import { type Request, type Response, Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { ElevenLabsClient } from 'elevenlabs';
import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Base types for the Shark Tank simulator
interface Judge {
  id: string;
  name: string;
  voiceId: string;
  persona: string;
  prompt: string;
  convictionLevel: number;
  convictionThreshold: number;
  keyParameters: KeyParameter[];
  inNegotiation: boolean;
  currentOffer: string | null;
  isOut: boolean;
  hasAskedQuestion: boolean;
}

interface KeyParameter {
  name: string;
  weight: number;
  satisfied: boolean;
}

interface Dialogue {
  speaker: string;
  text: string;
}

interface GameSession {
  id: string;
  pitchTranscript: string;
  askAmount: string;
  equityOffered: string;
  companyValuation: string;
  conversationHistory: Dialogue[];
  judges: Record<string, Judge>;
  negotiationMode: boolean;
  judgesInNegotiation: string[];
  judgesMadeOffer: Set<string>;
  acceptedDeals: Set<string>;
  judgesOut: Set<string>;
  currentJudge: string | null;
  sharedKnowledge: Record<string, string>;
  createdAt: Date;
  lastUpdatedAt: Date;
}

// Initialize API clients
const elevenLabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY || ''
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ''
});

// Directory for storing session data and audio files
const FISHTANK_DIR = path.join(__dirname, 'fishtank');
const FISHTANK_SESSIONS_DIR = path.join(FISHTANK_DIR, 'sessions');
const FISHTANK_AUDIO_DIR = path.join(FISHTANK_DIR, 'audio');

// Ensure directories exist
if (!fs.existsSync(FISHTANK_DIR)) {
  fs.mkdirSync(FISHTANK_DIR, { recursive: true });
}
if (!fs.existsSync(FISHTANK_SESSIONS_DIR)) {
  fs.mkdirSync(FISHTANK_SESSIONS_DIR, { recursive: true });
}
if (!fs.existsSync(FISHTANK_AUDIO_DIR)) {
  fs.mkdirSync(FISHTANK_AUDIO_DIR, { recursive: true });
}

// Configure multer for audio file uploads
const storage = multer.diskStorage({
  destination: FISHTANK_AUDIO_DIR,
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
    fileSize: 1024 * 1024 * 100, // 100MB limit for audio files
  }
});

// In-memory sessions store for development
// In production, you'd want to use a database
const sessions: Record<string, GameSession> = {};

// JudgeManager class to handle judge interactions
class JudgeManager {
  judges: Record<string, Judge>;
  
  constructor() {
    this.judges = this.initializeJudges();
  }
  
  private initializeJudges(): Record<string, Judge> {
    return {
      judge1: {
        id: 'judge1',
        name: "Namita Thapar",
        voiceId: "7XWoY4Z0vEgFmvOBMut1",
        persona: "Decisive, expertise-driven pharma expert",
        prompt: "You are Namita Thapar, the Shark Tank India judge renowned for your domain expertise in healthcare and pharma.\nYou keep responses conversational and brief (1-3 sentences).\nYou value founders who deeply understand their space and have solid unit economics.\nWhen something is outside your wheelhouse, you say: \"Yeh mera expertise nahi hai, I'm out.\"\nAsk sharp questions about specific areas that OTHER JUDGES HAVEN'T ALREADY ASKED ABOUT.\nDO NOT repeat questions that have already been asked in the conversation history.",
        convictionLevel: 10,
        convictionThreshold: 40,
        keyParameters: [
          { name: "founder_expertise", weight: 30, satisfied: false },
          { name: "healthcare_applications", weight: 30, satisfied: false },
          { name: "Innovation", weight: 40, satisfied: false }
        ],
        inNegotiation: false,
        currentOffer: null,
        isOut: false,
        hasAskedQuestion: false
      },
      judge2: {
        id: 'judge2',
        name: "Aman Gupta",
        voiceId: "PWuKnjMQhLOeUlRE7jgL",
        persona: "Strategic, marketing and brand expert",
        prompt: "You are Aman Gupta, the Shark Tank India judge and co-founder of boAt, known for your strategic vision.\nYou keep responses conversational and brief (1-3 sentences).\nYou look for ventures with brand potential, marketing strategy, and customer loyalty.\nYou often say: \"Hum bhi bana lenge\" to signal confidence, and \"Shark Tank ki Pitch ho ya Cricket ki... Jeetna humein aata hai.\"\nAsk sharp questions about specific areas that OTHER JUDGES HAVEN'T ALREADY ASKED ABOUT.\nDO NOT repeat questions that have already been asked in the conversation history.",
        convictionLevel: 15,
        convictionThreshold: 50,
        keyParameters: [
          { name: "brand_potential", weight: 40, satisfied: false },
          { name: "marketing_strategy", weight: 40, satisfied: false },
          { name: "customer_retention", weight: 20, satisfied: false }
        ],
        inNegotiation: false,
        currentOffer: null,
        isOut: false,
        hasAskedQuestion: false
      },
      judge3: {
        id: 'judge3',
        name: "Ashneer Grover",
        voiceId: "TWdmNgGcFTnP8osgYASY",
        persona: "Blunt, analytical, focused on valuation and financials",
        prompt: "You are Ashneer Grover, the Shark Tank India judge known for your blunt style.\nYou keep responses conversational and brief (1-3 sentences).\nYou dissect business models with ruthless precision and call out inconsistencies as \"Doglapan.\"\nWhen unimpressed, you fire off: \"Bhai, kya kar raha hai tu?\"\nAsk sharp questions about specific areas that OTHER JUDGES HAVEN'T ALREADY ASKED ABOUT.\nDO NOT repeat questions that have already been asked in the conversation history.",
        convictionLevel: 5,
        convictionThreshold: 50,
        keyParameters: [
          { name: "valuation_justification", weight: 40, satisfied: false },
          { name: "market_size", weight: 20, satisfied: false },
          { name: "unit_economics", weight: 20, satisfied: false }
        ],
        inNegotiation: false,
        currentOffer: null,
        isOut: false,
        hasAskedQuestion: false
      }
    };
  }
  
  // Get profiles of all judges (public facing info)
  getJudgeProfiles() {
    return Object.values(this.judges).map(judge => ({
      id: judge.id,
      name: judge.name,
      persona: judge.persona
    }));
  }
}

// Initialize judge manager
const judgeManager = new JudgeManager();

// Create router for Fishtank endpoints
const fishtankRouter = Router();

// Endpoint: Get all judge profiles
fishtankRouter.get('/judges', (req: Request, res: Response) => {
  res.json(judgeManager.getJudgeProfiles());
});

// Endpoint: Start a new game session
fishtankRouter.post('/start', (req: Request, res: Response) => {
  console.log('POST /start endpoint called');
  const sessionId = uuidv4();
  
  // Initialize a new game session
  const newSession: GameSession = {
    id: sessionId,
    pitchTranscript: '',
    askAmount: '0',
    equityOffered: '0',
    companyValuation: '0',
    conversationHistory: [],
    judges: JSON.parse(JSON.stringify(judgeManager.judges)), // Deep clone
    negotiationMode: false,
    judgesInNegotiation: [],
    judgesMadeOffer: new Set(),
    acceptedDeals: new Set(),
    judgesOut: new Set(),
    currentJudge: null,
    sharedKnowledge: {},
    createdAt: new Date(),
    lastUpdatedAt: new Date()
  };
  
  // Store the session
  sessions[sessionId] = newSession;
  
  // Select a random judge to start the conversation
  const judges = Object.values(newSession.judges);
  const startingJudge = judges[Math.floor(Math.random() * judges.length)];
  newSession.currentJudge = startingJudge.id;
  
  // Create initial greeting from the judge
  const greetings = [
    `Hi there! I'm ${startingJudge.name}. Tell us about your business and what you're looking for today.`,
    `Welcome to the tank. I'm ${startingJudge.name}. So, what are you pitching to us?`,
    `So, you've entered the shark tank. I'm ${startingJudge.name}. Let's hear your pitch.`,
    `Alright, I'm ${startingJudge.name}. You have 60 seconds to tell me why I should invest in your company.`
  ];
  
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];
  
  // Add greeting to conversation history
  newSession.conversationHistory.push({
    speaker: 'judge',
    text: greeting
  });
  
  // Return session ID, judges, and the initial greeting
  res.json({
    sessionId,
    judges: judgeManager.getJudgeProfiles(),
    initialGreeting: {
      text: greeting,
      judge: {
        id: startingJudge.id,
        name: startingJudge.name,
        persona: startingJudge.persona,
        convictionLevel: startingJudge.convictionLevel
      }
    }
  });
});

// Endpoint: Submit initial pitch
fishtankRouter.post('/pitch', upload.single('audio'), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    
    // Validate session exists
    if (!sessionId || !sessions[sessionId]) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    
    // Validate file was uploaded
    if (!req.file) {
      res.status(400).json({ error: 'No audio file uploaded' });
      return;
    }

    // TODO: Implement pitch transcription and analysis
    // This will use ElevenLabs for speech-to-text
    // Then use OpenAI to analyze the pitch and update judge parameters
    
    res.json({
      message: 'Pitch received, transcription not yet implemented'
    });
  } catch (error) {
    console.error('Error processing pitch:', error);
    res.status(500).json({ error: 'Error processing pitch' });
  }
});

// Endpoint: Get session state
fishtankRouter.get('/session/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  
  // Validate session exists
  if (!sessionId || !sessions[sessionId]) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  
  // Return session state (filtered for frontend needs)
  const session = sessions[sessionId];
  res.json({
    id: session.id,
    negotiationMode: session.negotiationMode,
    judgesInNegotiation: session.judgesInNegotiation,
    acceptedDeals: Array.from(session.acceptedDeals),
    judgesOut: Array.from(session.judgesOut),
    currentJudge: session.currentJudge,
    judges: Object.values(session.judges).map(judge => ({
      id: judge.id,
      name: judge.name,
      persona: judge.persona,
      convictionLevel: judge.convictionLevel,
      inNegotiation: judge.inNegotiation,
      isOut: judge.isOut,
      currentOffer: judge.currentOffer
    }))
  });
});

// Add this function to analyze and update key parameters based on user responses
async function analyzeKeyParameters(session: GameSession, judgeId: string, userMessage: string): Promise<void> {
  const judge = session.judges[judgeId];
  
  try {
    // Create a prompt for analyzing how well the user message satisfies each key parameter
    const prompt = `
Evaluate how well the entrepreneur's message satisfies each of the key investment parameters for judge ${judge.name}.
Score each parameter from 0-10, where 0 means completely unsatisfied and 10 means fully satisfied.

Parameters to evaluate:
${judge.keyParameters.map(param => `- ${param.name}: ${getParameterDescription(param.name)}`).join('\n')}

Recent conversation context:
${session.conversationHistory.slice(-5).map(d => `${d.speaker === 'judge' ? 'Judge' : 'Entrepreneur'}: ${d.text}`).join('\n')}

Entrepreneur's message: "${userMessage}"

Return ONLY valid JSON in this format:
{
  ${judge.keyParameters.map(param => `"${param.name}": 0`).join(',\n  ')}
}
`;

    // Call OpenAI to analyze the parameters
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You analyze entrepreneur pitches against specific investment criteria." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      max_tokens: 150,
      temperature: 0.3,
    });
    
    // Parse the response
    const analysisResult = JSON.parse(response.choices[0].message.content?.trim() || "{}");
    
    // Update each parameter's satisfaction status
    let convictionChange = 0;
    
    for (const param of judge.keyParameters) {
      const score = analysisResult[param.name] || 0;
      
      // Parameter is satisfied if score >= 7
      const wasSatisfied = param.satisfied;
      param.satisfied = score >= 7;
      
      // Calculate conviction change based on parameter weight and satisfaction
      if (!wasSatisfied && param.satisfied) {
        // Newly satisfied parameter gives a big boost
        convictionChange += param.weight * 0.5;
      } else if (param.satisfied) {
        // Already satisfied parameter gets a small boost
        convictionChange += param.weight * 0.1;
      } else {
        // Score contributes partially to conviction
        convictionChange += (score / 10) * param.weight * 0.2;
      }
    }
    
    // Update the judge's conviction level
    judge.convictionLevel = Math.max(0, Math.min(100, judge.convictionLevel + convictionChange));
    
    console.log(`Updated ${judge.name}'s key parameters. Conviction now: ${judge.convictionLevel}`);
    
  } catch (error) {
    console.error(`Error analyzing key parameters for ${judge.name}:`, error);
  }
}

// Helper function to get descriptions for key parameters
function getParameterDescription(paramName: string): string {
  const descriptions: Record<string, string> = {
    // Namita's parameters
    "founder_expertise": "Whether the founders demonstrate deep expertise in their field",
    "healthcare_applications": "Whether the product has applications in healthcare or wellbeing",
    "Innovation": "Whether the product offers genuine innovation in its space",
    
    // Aman's parameters
    "brand_potential": "Whether the product has strong brand potential and market appeal",
    "marketing_strategy": "Whether there's a clear and effective marketing strategy",
    "customer_retention": "Whether the product has strong customer retention metrics",
    
    // Ashneer's parameters
    "valuation_justification": "Whether the valuation is justified by metrics and traction",
    "market_size": "Whether the target market is large enough to build a significant business",
    "unit_economics": "Whether the unit economics are sound and profitable",
    
    // Generic fallback
    "default": "How well this aspect of the business satisfies investment criteria"
  };
  
  return descriptions[paramName] || descriptions["default"];
}

// Add this function to update all judges whenever the player speaks
async function updateAllJudges(session: GameSession, userMessage: string): Promise<void> {
  // Process each non-eliminated judge in parallel
  const updatePromises = Object.values(session.judges)
    .filter(judge => !judge.isOut)
    .map(judge => analyzeKeyParameters(session, judge.id, userMessage));
  
  // Wait for all judges to be updated
  await Promise.all(updatePromises);
  
  console.log("Updated conviction levels for all judges based on new information");
}

// Modify the generateJudgeResponse function to NOT update key parameters
async function generateJudgeResponse(
  session: GameSession,
  judgeId: string,
  userMessage: string
): Promise<{ text: string; updatedConviction: number }> {
  const judge = session.judges[judgeId];
  
  // Extract recent conversation history (last 10 messages)
  const recentHistory = session.conversationHistory
    .slice(-10)
    .map(d => `${d.speaker === 'judge' ? 'Judge' : 'Entrepreneur'}: ${d.text}`)
    .join('\n');
  
  // Format the shared knowledge about the pitch
  const knowledgeContext = Object.entries(session.sharedKnowledge)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  
  // Format the key parameters status
  const keyParamsStatus = judge.keyParameters.map(param => {
    return `${param.name}: ${param.satisfied ? 'Satisfied' : 'Not satisfied'} (${param.weight}% weight)`;
  }).join('\n');
  
  // Construct the prompt with enhanced context
  const prompt = `
You are ${judge.name}, a Shark Tank judge with the following persona: ${judge.persona}

${judge.prompt}

Session Information:
- Ask Amount: ${session.askAmount}
- Equity Offered: ${session.equityOffered}
- Company Valuation: ${session.companyValuation}

Your Key Investment Parameters (your main criteria):
${keyParamsStatus}

Your current conviction level: ${judge.convictionLevel}/100
Conviction needed to make an offer: ${judge.convictionThreshold}/100

Known Information:
${knowledgeContext}

Recent Conversation:
${recentHistory}

Entrepreneur: ${userMessage}

As ${judge.name}, respond with only 1-3 sentences to the entrepreneur's message above.
Based on your key parameters, respond authentically - if your criteria are being met, show interest.
If they're not addressing your criteria, push them on that or express skepticism.
If your conviction level is above ${judge.convictionThreshold}, consider beginning negotiation.
If your conviction is below 10, consider dropping out.
Don't explicitly state your internal parameters or conviction level in your response.

Response:
`;

  try {
    console.log(`Generating response for ${judge.name}...`);
    
    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a Shark Tank judge evaluating a startup pitch." },
        { role: "user", content: prompt }
      ],
      max_tokens: 150,
      temperature: 0.7,
    });
    
    const responseText = response.choices[0].message.content?.trim() || 
      "I'm not sure about that. Let me ask you something else.";
    
    // Return the response text and current conviction level
    return {
      text: responseText,
      updatedConviction: judge.convictionLevel
    };
  } catch (error) {
    console.error('Error generating judge response:', error);
    return {
      text: "I need to think about this more. Let's move on.",
      updatedConviction: judge.convictionLevel
    };
  }
}

// Add this function to select which judge should respond
function selectRespondingJudge(session: GameSession): Judge {
  // If there's a current judge in focus, continue with them
  if (session.currentJudge && !session.judges[session.currentJudge].isOut) {
    return session.judges[session.currentJudge];
  }
  
  // Filter out judges who are "out"
  const availableJudges = Object.values(session.judges).filter(j => !j.isOut);
  
  // If no judges left, use a random one anyway (shouldn't happen in normal gameplay)
  if (availableJudges.length === 0) {
    return Object.values(session.judges)[0];
  }
  
  // Find judges who haven't asked questions yet
  const judgesWhoHaventAsked = availableJudges.filter(j => !j.hasAskedQuestion);
  
  if (judgesWhoHaventAsked.length > 0) {
    // Prioritize judges who haven't spoken yet
    const selectedJudge = judgesWhoHaventAsked[Math.floor(Math.random() * judgesWhoHaventAsked.length)];
    selectedJudge.hasAskedQuestion = true; // Mark as having asked a question
    return selectedJudge;
  }
  
  // Otherwise, choose randomly from available judges
  return availableJudges[Math.floor(Math.random() * availableJudges.length)];
}

// Add this function to extract key information from user messages
async function extractKeyInformation(session: GameSession, message: string): Promise<void> {
  try {
    const prompt = `
Extract key business information from the entrepreneur's message.
If any of the following are mentioned, extract them. Otherwise, leave them as "unknown".

Format your response as JSON with these fields:
{
  "valuation": "The valuation mentioned or 'unknown'",
  "equity": "The equity percentage mentioned or 'unknown'",
  "ask": "The investment amount asked for or 'unknown'",
  "revenue": "Current or projected revenue or 'unknown'",
  "profit_margin": "Profit margin or 'unknown'",
  "customer_acquisition_cost": "CAC or 'unknown'",
  "market_size": "Market size or 'unknown'"
}

Entrepreneur's message: "${message}"
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You extract structured business information from text." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      max_tokens: 300,
      temperature: 0.3,
    });
    
    const info = JSON.parse(response.choices[0].message.content?.trim() || "{}");
    
    // Update session with extracted information
    if (info.valuation && info.valuation !== 'unknown') {
      session.companyValuation = info.valuation;
      session.sharedKnowledge['valuation'] = info.valuation;
    }
    
    if (info.equity && info.equity !== 'unknown') {
      session.equityOffered = info.equity;
      session.sharedKnowledge['equity'] = info.equity;
    }
    
    if (info.ask && info.ask !== 'unknown') {
      session.askAmount = info.ask;
      session.sharedKnowledge['ask'] = info.ask;
    }
    
    // Store other extracted information in shared knowledge
    Object.entries(info).forEach(([key, value]) => {
      if (value && value !== 'unknown') {
        session.sharedKnowledge[key] = value as string;
      }
    });
    
  } catch (error) {
    console.error('Error extracting key information:', error);
  }
}

// Create a shared function for processing user input (text or transcribed audio)
async function processUserInput(
  session: GameSession, 
  userMessage: string,
  mode: 'text' | 'audio'
): Promise<{
  reply: string;
  audioUrl: string;
  respondingJudge: Judge;
}> {
  // Add user message to conversation history
  session.conversationHistory.push({ speaker: 'user', text: userMessage });
  
  // Extract key information from user message
  await extractKeyInformation(session, userMessage);
  
  // Update all judges' conviction based on user message
  await updateAllJudges(session, userMessage);
  
  // Select which judge should respond
  const respondingJudge = selectRespondingJudge(session);
  session.currentJudge = respondingJudge.id;
  
  // Generate judge response using OpenAI
  const { text: reply, updatedConviction } = await generateJudgeResponse(
    session,
    respondingJudge.id,
    userMessage
  );
  
  // Update judge's conviction level
  respondingJudge.convictionLevel = updatedConviction;
  
  // Check if judge is now convinced enough to make an offer
  if (respondingJudge.convictionLevel >= respondingJudge.convictionThreshold) {
    respondingJudge.inNegotiation = true;
    if (!session.judgesInNegotiation.includes(respondingJudge.id)) {
      session.judgesInNegotiation.push(respondingJudge.id);
    }
  }
  
  // Check if judge is out (conviction too low, or has declared out)
  if (respondingJudge.convictionLevel < 10 || reply.toLowerCase().includes("i'm out") || reply.toLowerCase().includes("im out")) {
    respondingJudge.isOut = true;
    session.judgesOut.add(respondingJudge.id);
  }
  
  // Add reply to conversation history
  session.conversationHistory.push({ speaker: 'judge', text: reply });
  
  // Update session timestamp
  session.lastUpdatedAt = new Date();
  
  // Generate audio response if needed
  let audioUrl = '';
  if (mode === 'audio') {
    audioUrl = await textToSpeech(reply, respondingJudge.voiceId);
  }
  
  return { reply, audioUrl, respondingJudge };
}

// Simplified /reply endpoint
fishtankRouter.post('/reply', async (req: Request, res: Response) => {
  const { sessionId, message, mode = 'text' } = req.body;

  // Validate session and message
  if (!sessionId || !sessions[sessionId]) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'Message is required' });
    return;
  }

  try {
    const session = sessions[sessionId];
    
    // Process the user input
    const { reply, audioUrl, respondingJudge } = await processUserInput(
      session, 
      message, 
      mode as 'text' | 'audio'
    );
    
    // Return response with judge information
    res.json({ 
      reply,
      audioUrl,
      judge: formatJudgeForResponse(respondingJudge),
      allJudges: Object.values(session.judges).map(formatJudgeForResponse)
    });
  } catch (error) {
    console.error('Error processing reply:', error);
    res.status(500).json({ error: 'Error generating response' });
  }
});

// Simplified /audio-reply endpoint
fishtankRouter.post('/audio-reply', upload.single('audio'), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    
    // Validate session exists
    if (!sessionId || !sessions[sessionId]) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    
    // Validate file was uploaded
    if (!req.file) {
      res.status(400).json({ error: 'No audio file uploaded' });
      return;
    }

    const session = sessions[sessionId];
    
    // Step 1: Transcribe the audio
    const transcription = await transcribeAudio(req.file.path);
    
    if (!transcription) {
      res.status(500).json({ error: 'Failed to transcribe audio' });
      return;
    }
    
    // Process the transcribed input
    const { reply, audioUrl, respondingJudge } = await processUserInput(
      session, 
      transcription, 
      'audio'
    );
    
    // Return response with judge information
    res.json({ 
      reply,
      audioUrl,
      transcription,
      judge: formatJudgeForResponse(respondingJudge),
      allJudges: Object.values(session.judges).map(formatJudgeForResponse)
    });
  } catch (error) {
    console.error('Error processing audio reply:', error);
    res.status(500).json({ error: 'Error processing audio reply' });
  }
});

// Helper function to format judge data for response
function formatJudgeForResponse(judge: Judge) {
  return {
    id: judge.id,
    name: judge.name,
    persona: judge.persona,
    convictionLevel: judge.convictionLevel,
    inNegotiation: judge.inNegotiation,
    isOut: judge.isOut,
    keyParameters: judge.keyParameters.map(param => ({
      name: param.name,
      weight: param.weight,
      satisfied: param.satisfied
    }))
  };
}

// Helper function to transcribe audio using ElevenLabs
async function transcribeAudio(audioFilePath: string): Promise<string> {
  try {
    const audioData = fs.createReadStream(audioFilePath);
    const transcription = await elevenLabs.speechToText.convert({
      file: audioData,
      model_id: "scribe_v1",
      language_code: "en"
    });
    
    return transcription.text || '';
  } catch (error) {
    console.error('Error transcribing audio:', error);
    return '';
  }
}

// Helper function to generate audio from text using ElevenLabs
async function textToSpeech(text: string, voiceId: string): Promise<string> {
  try {
    const audioFilename = `${uuidv4()}.mp3`;
    const audioFilePath = path.join(FISHTANK_AUDIO_DIR, audioFilename);
    
    // Generate audio with ElevenLabs (returns a stream)
    const audioStream = await elevenLabs.generate({
      voice: voiceId,
      text: text,
      model_id: "eleven_multilingual_v1"
    });
    
    // Create write stream
    const writeStream = fs.createWriteStream(audioFilePath);
    
    // Pipe the audio stream to the file
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve());
      writeStream.on('error', reject);
      audioStream.pipe(writeStream);
    });
    
    return `/api/fishtank/audio/${audioFilename}`;
  } catch (error) {
    console.error('Error generating audio:', error);
    return '';
  }
}

// Endpoint to serve audio files
fishtankRouter.get('/audio/:filename', (req: Request, res: Response) => {
  const { filename } = req.params;
  const filePath = path.join(FISHTANK_AUDIO_DIR, filename);
  
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Audio file not found' });
    return;
  }
  
  res.sendFile(filePath);
});

// Export the router
export default fishtankRouter;
