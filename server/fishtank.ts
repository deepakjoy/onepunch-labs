import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { ElevenLabsClient } from 'elevenlabs';
import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Game Configuration
const GAME_CONFIG = {
  maxEvaluationResponses: 3, // Number of player responses before moving to offers stage
  maxNegotiationRounds: 3,   // Maximum number of negotiation rounds
};

// Game Stage Types
type GameStage = 'evaluation' | 'initial_offers' | 'negotiation' | 'closure';

// Shark Tank Game Config
// const FISHTANK_CONFIG = {
//   maxQuestionsBeforeNegotiation: 2, // Force negotiation after this many player responses
// };

// Base types for the Shark Tank simulator
interface Judge {
  id: string;
  name: string;
  voiceId: string;
  persona: string;
  prompt: string;
  convictionLevel: number;
  questionsAsked: number;
  currentOffer: {
    amount: number;
    equity: number;
    isFinal: boolean;
  } | null;
}

// Update Dialogue interface
interface Dialogue {
  speaker: string;
  text: string;
  judge?: {
    id: string;
    name: string;
    persona: string;
    convictionLevel: number;
  };
}

// Add JudgeOffer interface
interface JudgeOffer {
  amount: number;
  equity: number;
  isFinal: boolean;
}

// Update GameSession interface
interface GameSession {
  id: string;
  conversationHistory: Dialogue[];
  judges: Record<string, Judge>;
  currentJudge: string;
  createdAt: Date;
  lastUpdatedAt: Date;
  currentStage: GameStage;
  stageProgress: number;
  playerResponseCount: number;
  negotiationRound: number;
  judgeOffers: Record<string, JudgeOffer>;
  acceptedOffer: string | null;
}

// Initialize API clients
const elevenLabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY || ''
});

// Initialize OpenAI client
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
        prompt: "You are Namita Thapar, the Shark Tank India judge renowned for your domain expertise in healthcare and pharma. Keep responses brief (1-3 sentences). Focus on healthcare, pharma, and solid unit economics.",
        convictionLevel: 40,
        questionsAsked: 0,
        currentOffer: null
      },
      judge2: {
        id: 'judge2',
        name: "Aman Gupta",
        voiceId: "PWuKnjMQhLOeUlRE7jgL",
        persona: "Strategic, marketing and brand expert",
        prompt: "You are Aman Gupta, the Shark Tank India judge and co-founder of boAt. Keep responses brief (1-3 sentences). Focus on brand potential, marketing strategy, and customer loyalty.",
        convictionLevel: 50,
        questionsAsked: 0,
        currentOffer: null
      },
      judge3: {
        id: 'judge3',
        name: "Ashneer Grover",
        voiceId: "TWdmNgGcFTnP8osgYASY",
        persona: "Blunt, analytical, focused on valuation and financials",
        prompt: "You are Ashneer Grover, the Shark Tank India judge known for your blunt style. Keep responses brief (1-3 sentences). Focus on business model, valuation, and financials.",
        convictionLevel: 35,
        questionsAsked: 0,
        currentOffer: null
      }
    };
  }
  
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
const fishtankRouter = express.Router();

// Endpoint: Get all judge profiles
fishtankRouter.get('/judges', (req: Request, res: Response) => {
  res.json(judgeManager.getJudgeProfiles());
});

// Endpoint: Start a new game session
fishtankRouter.post('/start', async (req: Request, res: Response) => {
  // const { aiMode } = req.body as { aiMode?: AIStrength['strength'] };
  const sessionId = uuidv4();
  
  // Initialize a new game session
  const session: GameSession = {
    id: sessionId,
    conversationHistory: [],
    judges: JSON.parse(JSON.stringify(judgeManager.judges)), // Deep clone
    currentJudge: 'judge1',
    createdAt: new Date(),
    lastUpdatedAt: new Date(),
    currentStage: 'evaluation',
    stageProgress: 0,
    playerResponseCount: 0,
    negotiationRound: 0,
    judgeOffers: {},
    acceptedOffer: null
  };
  
  // Store the session
  sessions[sessionId] = session;
  
  // Select a random judge to start the conversation
  const judges = Object.values(session.judges);
  const startingJudge = judges[Math.floor(Math.random() * judges.length)];
  
  // Create initial greeting from the judge
  const greeting = `Welcome to the tank! I'm ${startingJudge.name}. You have 60 seconds to tell us about your business and what you're looking for today.`;
  
  // Add greeting to conversation history
  session.conversationHistory.push({
    speaker: 'judge',
    text: greeting,
    judge: formatJudgeForResponse(startingJudge)
  });
  
  // Return session ID and initial greeting
  res.json({
    sessionId,
    judges: Object.values(session.judges).map(formatJudgeForResponse),
    initialGreeting: {
      text: greeting,
      judge: formatJudgeForResponse(startingJudge)
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
  
  // Return full session state for frontend display
  const session = sessions[sessionId];
  res.json({
    id: session.id,
    conversationHistory: session.conversationHistory,
    stage: session.currentStage,
    stageProgress: session.stageProgress,
    playerResponseCount: session.playerResponseCount,
    negotiationRound: session.negotiationRound,
    judgeOffers: session.judgeOffers,
    acceptedOffer: session.acceptedOffer,
    createdAt: session.createdAt,
    lastUpdatedAt: session.lastUpdatedAt,
    judges: Object.values(session.judges).map(formatJudgeForResponse)
  });
});

// Add function to extract offer details
async function extractOfferDetails(response: string): Promise<{ amount: number; equity: number } | null> {
  try {
    const prompt = `Extract the investment offer details from this Shark Tank judge's response. Return ONLY a JSON object with the amount in dollars and equity percentage.

Judge's response: "${response}"

Return a JSON object in this format:
{
  "amount": number (the dollar amount, e.g., 500000 for $500,000),
  "equity": number (the equity percentage, e.g., 20 for 20%)
}

If no clear offer is made, return null.`;

    const result = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        { role: "system", content: "You are extracting investment offer details from a Shark Tank judge's response." },
        { role: "user", content: prompt }
      ],
      max_tokens: 100,
      temperature: 0.3,
    });

    const content = result.choices[0].message.content?.trim() || 'null';
    const cleanContent = content.replace(/```json\n?|\n?```/g, '');
    const offer = JSON.parse(cleanContent);
    console.log('Extracted offer details:', offer);
    return offer;
  } catch (error) {
    console.error('Error extracting offer details:', error);
    return null;
  }
}

// Add function to generate judge response
async function generateJudgeResponse(session: GameSession, judgeId: string, userMessage: string, contextPrompt?: string): Promise<string> {
  const judge = session.judges[judgeId];
  
  const prompt = `
You are ${judge.name}, a Shark Tank judge with this persona: ${judge.persona}

${judge.prompt}

Your current conviction level: ${judge.convictionLevel}/100

Recent conversation:
${session.conversationHistory.slice(-5).map(d => `${d.speaker}: ${d.text}`).join('\n')}

Entrepreneur's message: "${userMessage}"
${contextPrompt ? contextPrompt : ''}

${session.currentStage === 'initial_offers' ? `
IMPORTANT: You must make a specific offer that includes:
1. A dollar amount (e.g., $500,000)
2. An equity percentage (e.g., 20%)

Express your offer in your own natural language, but make sure to clearly state both the amount and equity percentage.
If you're not interested, indicate that you're out or not interested.` : ''}

Respond with 1-3 sentences. If your conviction is below 20, indicate you're out.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        { role: "system", content: "You are a Shark Tank judge evaluating a pitch." },
        { role: "user", content: prompt }
      ],
      max_tokens: 150,
      temperature: 0.7,
    });
    
    const reply = response.choices[0].message.content?.trim() || 
      "I need to think about this more.";
    
    // Update judge state based on response
    if (reply.toLowerCase().includes("i'm out") || reply.toLowerCase().includes("im out")) {
      judge.convictionLevel = 0; // Set conviction to 0 to indicate out
    } else if (session.currentStage === 'initial_offers') {
      // Extract offer details using AI
      const offerDetails = await extractOfferDetails(reply);
      
      if (offerDetails) {
        judge.currentOffer = {
          amount: offerDetails.amount,
          equity: offerDetails.equity,
          isFinal: false
        };
        session.judgeOffers[judge.id] = judge.currentOffer;
      }
    }
    
    judge.questionsAsked++;
    return reply;
  } catch (error) {
    console.error('Error generating judge response:', error);
    return "I need to think about this more.";
  }
}

// Add function to analyze message and update conviction
async function analyzeMessage(session: GameSession, judgeId: string, userMessage: string): Promise<void> {
  const judge = session.judges[judgeId];
  
  try {
    const prompt = `
Evaluate this entrepreneur's message based on your expertise and interests.
Score from 0-10 how well it aligns with your investment criteria.

Your persona: ${judge.persona}
Your focus areas: ${judge.prompt}

Recent conversation:
${session.conversationHistory.slice(-5).map(d => `${d.speaker}: ${d.text}`).join('\n')}

Entrepreneur's message: "${userMessage}"

Return ONLY a number from 0-10 representing your conviction level.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        { role: "system", content: "You are a Shark Tank judge evaluating a pitch." },
        { role: "user", content: prompt }
      ],
      max_tokens: 10,
      temperature: 0.3,
    });
    
    const rawScore = response.choices[0].message.content?.trim() || "0";
    const newScore = parseInt(rawScore);
    
    // Defensive check for LLM response
    if (isNaN(newScore)) {
      console.error(`Invalid score received from LLM for ${judge.name}: "${rawScore}"`);
      return;
    }
    
    if (newScore < 0 || newScore > 10) {
      console.error(`Out of bounds score received from LLM for ${judge.name}: ${newScore} (expected 0-10)`);
      return;
    }
    
    const newConviction = newScore * 10; // Convert to 0-100 scale
    
    // Calculate weighted average: 70% current conviction, 30% new score
    // This creates a more gradual change in conviction
    judge.convictionLevel = Math.round(
      (judge.convictionLevel * 0.7) + (newConviction * 0.3)
    );
    
  } catch (error) {
    console.error(`Error analyzing message for ${judge.name}:`, error);
  }
}

// Add function to analyze player's response intent
async function analyzePlayerResponse(session: GameSession, userInput: string): Promise<{
  isAcceptance: boolean;
  isCounterOffer: boolean;
  counterOfferAmount?: number;
  counterOfferEquity?: number;
}> {
  try {
    const prompt = `Analyze this entrepreneur's response in the Shark Tank game. The game is in the ${session.currentStage} stage.

Recent conversation:
${session.conversationHistory.slice(-5).map(m => `${m.speaker === 'judge' ? m.judge?.name : 'You'}: ${m.text}`).join('\n')}

Entrepreneur's response: "${userInput}"

Determine if the entrepreneur is:
1. Accepting an offer
2. Making a counter-offer
3. Neither

If they're making a counter-offer, extract the amount and equity percentage they're asking for.

Return ONLY a JSON object in this exact format, with no markdown formatting or additional text:
{
  "isAcceptance": boolean,
  "isCounterOffer": boolean,
  "counterOfferAmount": number or null,
  "counterOfferEquity": number or null
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        { role: "system", content: "You are analyzing an entrepreneur's response in Shark Tank. Return ONLY a JSON object with no additional formatting or text." },
        { role: "user", content: prompt }
      ],
      max_tokens: 150,
      temperature: 0.3,
    });

    const content = response.choices[0].message.content?.trim() || '{}';
    // Remove any markdown formatting if present
    const cleanContent = content.replace(/```json\n?|\n?```/g, '');
    const result = JSON.parse(cleanContent);
    console.log('Player response analysis:', result);
    return result;
  } catch (error) {
    console.error('Error analyzing player response:', error);
    return {
      isAcceptance: false,
      isCounterOffer: false,
      counterOfferAmount: undefined,
      counterOfferEquity: undefined
    };
  }
}

// Update processUserInput function to use AI analysis
async function processUserInput(session: GameSession, userInput: string): Promise<void> {
  // Update conversation history
  session.conversationHistory.push({
    speaker: 'player',
    text: userInput
  });

  // Update all judges' conviction
  await Promise.all(Object.values(session.judges).map(judge => 
    analyzeMessage(session, judge.id, userInput)
  ));

  // Process based on current stage
  switch (session.currentStage) {
    case 'evaluation': {
      // Update stage progress
      session.stageProgress++;
      session.playerResponseCount++;

      // Check if we should move to initial offers
      if (session.playerResponseCount >= GAME_CONFIG.maxEvaluationResponses) {
        console.log('Moving from evaluation to initial_offers stage');
        session.currentStage = 'initial_offers';
        session.stageProgress = 0;
        session.playerResponseCount = 0;
        
        // Generate initial offers from interested judges
        const interestedJudges = Object.values(session.judges)
          .filter(judge => judge.convictionLevel >= 50);
        
        if (interestedJudges.length === 0) {
          console.log('No interested judges, moving to closure');
          session.currentStage = 'closure';
        } else {
          // Generate offers for interested judges
          for (const judge of interestedJudges) {
            const offer = {
              amount: Math.round(judge.convictionLevel * 1000), // Base amount on conviction
              equity: Math.round(judge.convictionLevel / 2), // Base equity on conviction
              isFinal: false
            };
            judge.currentOffer = offer;
            session.judgeOffers[judge.id] = offer;
          }
        }
      }
      break;
    }

    case 'initial_offers': {
      // Check if player has responded to offers
      const hasInterestedJudges = Object.values(session.judges)
        .some(judge => judge.convictionLevel >= 50);
      
      if (!hasInterestedJudges) {
        console.log('No interested judges remaining, moving to closure');
        session.currentStage = 'closure';
        session.stageProgress = 0;
      } else {
        // Analyze player's response using AI
        const responseAnalysis = await analyzePlayerResponse(session, userInput);
        
        if (responseAnalysis.isAcceptance) {
          console.log('Player accepted offer, moving to closure');
          session.currentStage = 'closure';
          session.stageProgress = 0;
          // Find the judge with highest conviction and mark their offer as accepted
          const highestConvictionJudge = Object.values(session.judges)
            .filter(judge => judge.convictionLevel >= 50)
            .sort((a, b) => b.convictionLevel - a.convictionLevel)[0];
          session.acceptedOffer = highestConvictionJudge.id;
        } else if (responseAnalysis.isCounterOffer) {
          console.log('Player made counter-offer, moving to negotiation');
          session.currentStage = 'negotiation';
          session.stageProgress = 0;
          session.negotiationRound = 0;
          
          // Update the counter-offer in the session
          if (responseAnalysis.counterOfferAmount && responseAnalysis.counterOfferEquity) {
            const highestConvictionJudge = Object.values(session.judges)
              .filter(judge => judge.convictionLevel >= 50)
              .sort((a, b) => b.convictionLevel - a.convictionLevel)[0];
            
            session.judgeOffers[highestConvictionJudge.id] = {
              amount: responseAnalysis.counterOfferAmount,
              equity: responseAnalysis.counterOfferEquity,
              isFinal: false
            };
          }
        } else {
          console.log('Moving to negotiation stage for further discussion');
          session.currentStage = 'negotiation';
          session.stageProgress = 0;
          session.negotiationRound = 0;
        }
      }
      break;
    }

    case 'negotiation': {
      // Update negotiation round
      session.negotiationRound++;
      session.stageProgress++;

      // Check if we should force a decision
      if (session.negotiationRound >= GAME_CONFIG.maxNegotiationRounds) {
        console.log('Max negotiation rounds reached, moving to closure');
        session.currentStage = 'closure';
        session.stageProgress = 0;
      } else {
        // Analyze player's response using AI
        const responseAnalysis = await analyzePlayerResponse(session, userInput);
        
        if (responseAnalysis.isAcceptance) {
          console.log('Player accepted offer during negotiation, moving to closure');
          session.currentStage = 'closure';
          session.stageProgress = 0;
          // Find the judge with highest conviction and mark their offer as accepted
          const highestConvictionJudge = Object.values(session.judges)
            .filter(judge => judge.convictionLevel >= 50)
            .sort((a, b) => b.convictionLevel - a.convictionLevel)[0];
          session.acceptedOffer = highestConvictionJudge.id;
        } else if (responseAnalysis.isCounterOffer) {
          // Update the counter-offer in the session
          if (responseAnalysis.counterOfferAmount && responseAnalysis.counterOfferEquity) {
            const highestConvictionJudge = Object.values(session.judges)
              .filter(judge => judge.convictionLevel >= 50)
              .sort((a, b) => b.convictionLevel - a.convictionLevel)[0];
            
            session.judgeOffers[highestConvictionJudge.id] = {
              amount: responseAnalysis.counterOfferAmount,
              equity: responseAnalysis.counterOfferEquity,
              isFinal: false
            };
          }
        }
      }
      break;
    }

    case 'closure': {
      // Game is over, no further processing needed
      console.log('In closure stage, no further stage transitions');
      break;
    }
  }

  // Update last updated timestamp
  session.lastUpdatedAt = new Date();
}

// Update the reply endpoint to use generateJudgeResponse
fishtankRouter.post('/reply', async (req: Request, res: Response) => {
  console.log('Received reply request:', req.body);
  const { sessionId, message } = req.body;

  // Validate session and message
  if (!sessionId || !sessions[sessionId]) {
    console.log('Session not found:', sessionId);
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  if (!message || typeof message !== 'string') {
    console.log('Invalid message:', message);
    res.status(400).json({ error: 'Message is required' });
    return;
  }

  try {
    const session = sessions[sessionId];
    console.log('Processing message for session:', sessionId);
    console.log('Current stage:', session.currentStage);
    console.log('Stage progress:', session.stageProgress);
    console.log('Player response count:', session.playerResponseCount);
    
    // Process the user input
    await processUserInput(session, message);
    
    // Log stage after processing
    console.log('Stage after processing:', session.currentStage);
    console.log('Stage progress after processing:', session.stageProgress);
    console.log('Player response count after processing:', session.playerResponseCount);
    
    // Determine which judges should reply based on stage
    let replyingJudges: Judge[] = [];
    if (session.currentStage === 'evaluation') {
      replyingJudges = Object.values(session.judges).slice(0, 2); // Only two judges
    } else {
      // For offers/negotiation/closure, filter by conviction
      replyingJudges = Object.values(session.judges)
        .filter(judge => judge.convictionLevel >= 20)
        .sort((a, b) => b.convictionLevel - a.convictionLevel)
        .slice(0, 2);
    }
    console.log('Replying judges:', replyingJudges.map(j => j.name));
    
    // Generate responses from selected judges
    let firstJudgeResponse = '';
    const replies = [];
    for (let idx = 0; idx < replyingJudges.length; idx++) {
      const judge = replyingJudges[idx];
      let response;
      if (idx === 0) {
        // First judge: normal prompt (can ask a question)
        response = await generateJudgeResponse(session, judge.id, message);
        firstJudgeResponse = response;
      } else {
        // Second judge: comment/context only, no new question or topic
        const previousJudge = replyingJudges[0];
        const contextPrompt = `\nThe previous judge (${previousJudge.name}) just said: "${firstJudgeResponse}"\nYour job is to comment on their point, add context, agree, disagree, or provide your perspective, but do NOT ask for more information, do NOT introduce a new topic, and do NOT ask a new question. Do not repeat what has already been said.\n`;
        response = await generateJudgeResponse(session, judge.id, message, contextPrompt);
      }
      
      // Add judge response to conversation history
      session.conversationHistory.push({
        speaker: 'judge',
        text: response,
        judge: formatJudgeForResponse(judge)
      });
      
      replies.push({
        text: response,
        audioUrl: null, // We'll add audio generation later
        judge: formatJudgeForResponse(judge)
      });
    }
    
    console.log('Generated replies:', replies);
    
    // Return responses with judge information
    res.json({ 
      replies,
      allJudges: Object.values(session.judges).map(formatJudgeForResponse)
    });
  } catch (error) {
    console.error('Error processing reply:', error);
    res.status(500).json({ error: 'Error processing reply' });
  }
});

// Update the audio-reply endpoint to handle multiple responses
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
    await processUserInput(session, transcription);
    
    // Return responses with judge information
    res.json({ 
      replies: session.conversationHistory.slice(-5),
      transcription,
      allJudges: Object.values(session.judges).map(formatJudgeForResponse)
    });
  } catch (error) {
    console.error('Error processing audio reply:', error);
    res.status(500).json({ error: 'Error processing audio reply' });
  }
});

// Endpoint: Generate AI player reply
fishtankRouter.post('/ai-player-reply', async (req: Request, res: Response) => {
  const { sessionId } = req.body;
  if (!sessionId || !sessions[sessionId]) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  const session = sessions[sessionId];
  
  console.log('Generating AI player response for stage:', session.currentStage);
  console.log('Stage progress:', session.stageProgress);
  console.log('Player response count:', session.playerResponseCount);
  
  // Get the last 5 messages for better context
  const recentMessages = session.conversationHistory.slice(-5);
  console.log('Recent messages for AI player response:', recentMessages);
  
  const prompt = `You are an entrepreneur on Shark Tank. The game is currently in the ${session.currentStage} stage. Here's the recent conversation:

${recentMessages.map(m => `${m.speaker === 'judge' ? m.judge?.name : 'You'}: ${m.text}`).join('\n')}

Based on the conversation and current stage (${session.currentStage}), craft a natural, engaging response that:
1. Directly addresses the most recent judge(s) who spoke and their specific questions/points
2. Maintains your business vision
3. Is persuasive and specific
4. Sounds like a real person speaking
5. Adapts to the current stage:
   - In evaluation: Focus on answering questions and building credibility
   - In initial_offers: Interested judges will make offers
   - In negotiation: Players can make counter-offers or accept the offer. In case of counter-offers, the judge will respond with a new offer.
   - In closure: Player can accept or reject the final offer. Judges will not entertain any counter-offers in this stage. They will express their closing thoughts based on the player's response.

Keep your response concise (1-3 sentences).`;

  console.log('AI Player Response Prompt:', prompt);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        { role: "system", content: "You are a confident, passionate entrepreneur pitching your startup on Shark Tank. Your responses should be natural, engaging, and directly address the judges' points while maintaining your business vision." },
        { role: "user", content: prompt }
      ],
      max_tokens: 150,
      temperature: 0.7,
    });
    const reply = response.choices[0].message.content?.trim() || '';
    console.log('AI Player Response:', reply);
    res.json({ reply });
  } catch (error) {
    console.error('Error generating AI player reply:', error);
    res.status(500).json({ error: 'Failed to generate AI reply' });
  }
});

// Helper function to format judge data for response
function formatJudgeForResponse(judge: Judge) {
  return {
    id: judge.id,
    name: judge.name,
    persona: judge.persona,
    convictionLevel: Math.round(judge.convictionLevel),
    inNegotiation: false,
    isOut: judge.convictionLevel < 20,
    talkTimeSeconds: 0
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
