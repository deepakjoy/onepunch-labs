import express, { Request, Response, RequestHandler } from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { ElevenLabsClient } from 'elevenlabs';

// Types for the transcription data
interface Word {
  text: string;
  start: number;
  end: number;
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
const FILLER_WORDS = new Set([
  'uh', 'um', 'ah', 'er', 'hm', 'hmm', 'like', 'you know', 'so', 'well', 'actually',
  'basically', 'literally', 'technically', 'honestly', 'frankly', 'seriously'
]);

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
  const segmentDuration = 5; 

  // Get all words, filtering out spacing
  const allWords = transcription.words.filter(word => word.type !== 'spacing');
  
  if (allWords.length === 0) return pacingData;

  // Calculate total duration
  const totalDuration = allWords[allWords.length - 1].end - allWords[0].start;
  const numSegments = Math.ceil(totalDuration / segmentDuration);

  for (let i = 0; i < numSegments; i++) {
    const segmentStart = allWords[0].start + (i * segmentDuration);
    const segmentEnd = segmentStart + segmentDuration;

    // Get words in this segment
    const segmentWords = allWords.filter(word => 
      word.start >= segmentStart && word.start < segmentEnd
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

app.use(cors());
app.use(express.json());

// Endpoint to process audio and get coaching feedback
const analyzeVoiceHandler: RequestHandler = async (req, res) => {
  
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No audio file uploaded' });
      return;
    }

    console.log('Debug: File uploaded:', req.file.originalname);

    // Debug logging for file
    console.log('Uploaded file:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path
    });

    // Verify file exists and is readable
    if (!fs.existsSync(req.file.path)) {
      throw new Error('Uploaded file not found');
    }

    // Step 1: Transcribe audio with ElevenLabs Scribe
    const audioData = fs.createReadStream(req.file.path);
    let transcription;
    try {
      transcription = await elevenLabs.speechToText.convert({
        file: audioData,
        model_id: "scribe_v1",
        language_code: "en"
      });
      //console.log('ElevenLabs Scribe response structure:', JSON.stringify(transcription, null, 2));

    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error:', error.message);
        if ('response' in error) {
          const apiError = error as { response?: { status: number; statusText: string; data: unknown; headers: unknown } };
          console.error('ElevenLabs API Error:', {
            status: apiError.response?.status,
            statusText: apiError.response?.statusText,
            data: JSON.stringify(apiError.response?.data, null, 2),
            headers: apiError.response?.headers
          });
        }
      }
      throw error;
    }

    // Analyze pacing
    const pacingData = analyzePacing(transcription as unknown as Transcription);

    // Clean up the uploaded file
    fs.unlinkSync(req.file.path);

    // Return the transcription and analysis data
    res.json({
      transcription: transcription,
      pacing: {
        dataPoints: pacingData,
        averageWPM: pacingData.reduce((sum, point) => sum + point.wpm, 0) / pacingData.length
      }
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
