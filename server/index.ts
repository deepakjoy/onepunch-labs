import express, { Request, Response, RequestHandler } from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { ElevenLabsClient } from 'elevenlabs';
import crypto from 'crypto';
import OpenAI from 'openai';

// Types for the transcription data
interface Word {
  text: string;
  start?: number;
  end?: number;
  type: string;
}

interface Transcription {
  language_code: string;
  language_probability: number;
  text: string;
  words: Word[];
}

interface PacingDataPoint {
  time: number;
  wpm: number;
}

// Filler words to exclude from WPM calculation
// These are single-word fillers that should be detected individually
const FILLER_WORDS = new Set([
  'uh', 'um', 'ah', 'er', 'hm', 'hmm', 'like', 'right', 'so', 'well', 'actually',
  'basically', 'literally', 'technically', 'honestly', 'frankly', 'seriously'
]);

// Multi-word filler phrases to check
// These are phrases that should be detected as a single unit
// Note: The order of checking matters - we check phrases first, then single words
const FILLER_PHRASES = [
  'you know',
  'kind of',
  'sort of',
  'i mean',
  'you see'
];

// Function to calculate words per minute
function calculateWPM(words: Word[], duration: number): number {
  // Filter out filler words and spacing
  const validWords = words.filter(word => 
    word.type !== 'spacing' && !FILLER_WORDS.has(word.text.toLowerCase())
  );
  
  // If there's a pause longer than 2 seconds, return 0
  if (duration > 2 && validWords.length === 0) {
    return 0;
  }
  
  return (validWords.length / duration) * 60;
}

// Function to analyze pacing
function analyzePacing(transcription: Transcription): PacingDataPoint[] {
  const pacingData: PacingDataPoint[] = [];
  const segmentDuration = 10; 

  // Get all words, filtering out spacing
  const allWords = transcription.words.filter(word => 
    word.type !== 'spacing' && word.start !== undefined && word.end !== undefined
  );
  
  if (allWords.length === 0) return pacingData;

  // Calculate total duration
  const firstWord = allWords[0];
  const lastWord = allWords[allWords.length - 1];
  if (!firstWord.start || !lastWord.end) return pacingData;
  
  const totalDuration = lastWord.end - firstWord.start;
  const numSegments = Math.ceil(totalDuration / segmentDuration);

  for (let i = 0; i < numSegments; i++) {
    const segmentStart = firstWord.start + (i * segmentDuration);
    const segmentEnd = segmentStart + segmentDuration;

    // Get words in this segment
    const segmentWords = allWords.filter(word => 
      word.start !== undefined && word.start >= segmentStart && word.start < segmentEnd
    );

    // Calculate WPM for this segment
    const wpm = calculateWPM(segmentWords, segmentDuration);

    pacingData.push({
      time: segmentStart,
      wpm: wpm
    });
  }

  return pacingData;
}

interface FillerWordCount {
  word: string;
  count: number;
}

// Helper function to clean word text by removing punctuation and converting to lowercase
// This ensures we correctly identify filler words even when they have punctuation
// Example: "Um," -> "um" or "You know?" -> "you know"
function cleanWord(text: string): string {
  return text.replace(/[.,!?;:()]/g, '').toLowerCase();
}

// Analyzes the transcription for filler words, returning:
// - total: total count of all filler words
// - breakdown: list of each filler word type and its count
function analyzeFillerWords(words: Word[]): { total: number; breakdown: FillerWordCount[] } {
  // Map to store counts of each filler word/phrase
  const wordCounts = new Map<string, number>();
  let total = 0;

  // First check for multi-word phrases
  // This is done first to prevent single-word detection from interfering with phrases
  for (let i = 0; i < words.length - 1; i++) {
    // Skip whitespace words
    if (words[i].type === 'spacing') continue;
    
    // Find the next non-whitespace word
    let nextWordIndex = i + 1;
    while (nextWordIndex < words.length && words[nextWordIndex].type === 'spacing') {
      nextWordIndex++;
    }
    if (nextWordIndex >= words.length) break;
    
    // Clean both current and next word before checking for phrases
    const currentWord = cleanWord(words[i].text);
    const nextWord = cleanWord(words[nextWordIndex].text);
    const phrase = `${currentWord} ${nextWord}`;
    
    // Debug: Uncomment to see what phrases are being checked
    console.log(`Checking phrase: "${phrase}" (words: ${words[i].text}, ${words[nextWordIndex].text})`);
    
    if (FILLER_PHRASES.includes(phrase)) {
      total++;
      wordCounts.set(phrase, (wordCounts.get(phrase) || 0) + 1);
      // Skip to after the next word since we've already counted it as part of the phrase
      i = nextWordIndex;
      continue;
    }
  }

  // Then check for single-word fillers, skipping words that were part of phrases
  for (let i = 0; i < words.length; i++) {
    // Skip whitespace words
    if (words[i].type === 'spacing') continue;
    
    // Skip if this word was part of a phrase (handled in previous loop)
    if (i > 0) {
      // Find the previous non-whitespace word
      let prevWordIndex = i - 1;
      while (prevWordIndex >= 0 && words[prevWordIndex].type === 'spacing') {
        prevWordIndex--;
      }
      if (prevWordIndex >= 0) {
        const prevWord = cleanWord(words[prevWordIndex].text);
        const currentWord = cleanWord(words[i].text);
        if (FILLER_PHRASES.includes(`${prevWord} ${currentWord}`)) {
          continue;
        }
      }
    }
    
    const cleanedWord = cleanWord(words[i].text);
    // Debug: Uncomment to see what words are being checked
    console.log(`Checking word: "${cleanedWord}"`);
    
    if (FILLER_WORDS.has(cleanedWord)) {
      total++;
      wordCounts.set(cleanedWord, (wordCounts.get(cleanedWord) || 0) + 1);
    }
  }

  // Convert the map to the required breakdown format and sort by count
  const breakdown = Array.from(wordCounts.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);

  // Debug: Uncomment to see the final results
  console.log('Filler word analysis results:', { total, breakdown });

  return { total, breakdown };
}

dotenv.config();

// Debug log for API key
console.log('ElevenLabs API Key:', process.env.ELEVENLABS_API_KEY ? 'Present' : 'Missing');

const app = express();
const port = 3001;

// Configure multer for audio files
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/x-m4a', 'audio/ogg', 'audio/webm'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files are allowed.'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

const elevenLabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY
});

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

app.use(cors());
app.use(express.json());

// Cache directory for storing API responses
const CACHE_DIR = path.join(__dirname, 'cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
}

// Feature flags
const ENABLE_GRAMMAR_CACHE = process.env.ENABLE_GRAMMAR_CACHE !== 'false';
const ENABLE_ELEVENLABS_CACHE = process.env.ENABLE_ELEVENLABS_CACHE !== 'false';

// Function to generate a cache key based on file content
function generateCacheKey(filePath: string): string {
  const fileContent = fs.readFileSync(filePath);
  const hash = crypto.createHash('md5').update(fileContent).digest('hex');
  console.log(`Generated cache key ${hash} for file: ${path.basename(filePath)}`);
  return hash;
}

// Function to get cached response if it exists
function getCachedResponse(cacheKey: string): Transcription | null {
  if (!ENABLE_ELEVENLABS_CACHE) {
    console.log('ElevenLabs caching is disabled');
    return null;
  }

  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
  if (fs.existsSync(cachePath)) {
    console.log(`Cache HIT: Found cached response for key ${cacheKey}`);
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  }
  console.log(`Cache MISS: No cached response found for key ${cacheKey}`);
  return null;
}

// Function to save response to cache
function saveToCache(cacheKey: string, data: Transcription): void {
  if (!ENABLE_ELEVENLABS_CACHE) {
    console.log('ElevenLabs caching is disabled, skipping cache save');
    return;
  }

  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
  console.log(`Cache SAVE: Saved response to ${cachePath}`);
}

// Function to get cached grammar analysis if it exists
function getCachedGrammarAnalysis(cacheKey: string): Array<{ sentence: string; errors: Array<{ text: string; suggestion: string }> }> | null {
  if (!ENABLE_GRAMMAR_CACHE) {
    console.log('Grammar caching is disabled');
    return null;
  }

  const cachePath = path.join(CACHE_DIR, `grammar-${cacheKey}.json`);
  if (fs.existsSync(cachePath)) {
    console.log(`Grammar Cache HIT: Found cached analysis for key ${cacheKey}`);
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  }
  console.log(`Grammar Cache MISS: No cached analysis found for key ${cacheKey}`);
  return null;
}

// Function to save grammar analysis to cache
function saveGrammarAnalysisToCache(cacheKey: string, data: Array<{ sentence: string; errors: Array<{ text: string; suggestion: string }> }>): void {
  if (!ENABLE_GRAMMAR_CACHE) {
    console.log('Grammar caching is disabled, skipping cache save');
    return;
  }

  const cachePath = path.join(CACHE_DIR, `grammar-${cacheKey}.json`);
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
  console.log(`Grammar Cache SAVE: Saved analysis to ${cachePath}`);
}

// Function to check grammar using OpenAI
async function checkGrammar(text: string, cacheKey: string): Promise<Array<{ sentence: string; errors: Array<{ text: string; suggestion: string }> }>> {
  try {
    // Try to get cached response first
    const cachedAnalysis = getCachedGrammarAnalysis(cacheKey);
    if (cachedAnalysis) {
      return cachedAnalysis;
    }

    console.log('No grammar cache found, requesting analysis from OpenAI');
    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content: "You are a spoken English coach. Analyze the following speech transcript and identify only errors or issues that a listener would notice in natural speech. Do not correct punctuation, capitalization, lowercase, or minor stutters; focus solely on issues that could affect auditory understanding or clarity. For each sentence, provide the original sentence and a list of errors or issues with suggestions. Format the response as a JSON array where each element has 'sentence' and 'errors' fields. The 'errors' field should be an array of objects with 'text' (the issue), 'suggestion' (how to improve) and 'category' (the type of issue). Focus on these categories, 'Incorrect vocabulary', 'Unclear message', 'Broken sentences'. Exclude categories related to pauses, laughter, or minor grammatical issues. Include all insights within an object called 'analysis'."
        },
        {
          role: "user",
          content: text
        }
      ],
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('No content in response');
    }
    
    const result = JSON.parse(content);
    const analysis = result.analysis || [];

    // Save to cache
    saveGrammarAnalysisToCache(cacheKey, analysis);
    return analysis;
  } catch (error) {
    console.error('Error checking grammar:', error);
    return [];
  }
}

// Endpoint to process audio and get coaching feedback
const analyzeVoiceHandler: RequestHandler = async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No audio file uploaded' });
      return;
    }

    console.log('Processing file:', {
      filename: req.file.originalname,
      size: `${(req.file.size / 1024 / 1024).toFixed(2)}MB`,
      mimetype: req.file.mimetype
    });

    // Verify file exists and is readable
    if (!fs.existsSync(req.file.path)) {
      throw new Error('Uploaded file not found');
    }

    // Generate cache key from file content
    const cacheKey = generateCacheKey(req.file.path);
    let transcription;

    // Try to get cached response first
    const cachedResponse = getCachedResponse(cacheKey);
    if (cachedResponse) {
      console.log('Using cached transcription response');
      transcription = cachedResponse;
    } else {
      console.log('No cache found, requesting transcription from ElevenLabs API');
      // Step 1: Transcribe audio with ElevenLabs Scribe
      const audioData = fs.createReadStream(req.file.path);
      try {
        transcription = await elevenLabs.speechToText.convert({
          file: audioData,
          model_id: "scribe_v1",
          language_code: "en"
        });
        console.log('Received transcription from ElevenLabs API');
        console.log('Saving response to cache for future use');
        saveToCache(cacheKey, transcription);
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.error('ElevenLabs API Error:', error.message);
          if ('response' in error) {
            const apiError = error as { response?: { status: number; statusText: string; data: unknown; headers: unknown } };
            console.error('API Error Details:', {
              status: apiError.response?.status,
              statusText: apiError.response?.statusText,
              data: JSON.stringify(apiError.response?.data, null, 2),
              headers: apiError.response?.headers
            });
          }
        }
        throw error;
      }
    }

    // Analyze pacing
    const pacingData = analyzePacing(transcription as unknown as Transcription);

    // Analyze filler words
    const fillerWords = analyzeFillerWords(transcription.words);

    // Get the full text without filler words
    const textWithoutFillers = transcription.words
      .filter(word => !FILLER_WORDS.has(cleanWord(word.text)))
      .map(word => word.text)
      .join(' ')
      .replace(/\s+/g, ' ') // Replace multiple spaces with a single space
      .trim(); // Remove leading/trailing spaces

    // Check grammar
    const grammarAnalysis = await checkGrammar(textWithoutFillers, cacheKey);

    // Clean up the uploaded file
    fs.unlinkSync(req.file.path);

    // Return the transcription and analysis data
    res.json({
      transcription: transcription,
      pacing: {
        dataPoints: pacingData,
        averageWPM: pacingData.reduce((sum, point) => sum + point.wpm, 0) / pacingData.length
      },
      fillerWords: fillerWords,
      grammar: grammarAnalysis
    });

  } catch (error) {
    console.error('Error processing audio:', error);
    res.status(500).json({ error: 'Error processing audio file' });
  }
};

app.post('/api/analyze-voice', upload.single('audio'), analyzeVoiceHandler);

app.get('/', (req: Request, res: Response) => {
  res.send('Hello from Express!');
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
