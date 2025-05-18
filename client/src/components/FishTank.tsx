import React, { useState, useEffect, useRef } from 'react';
import './FishTank.css';

interface Dialogue {
  speaker: 'judge' | 'user' | 'ai_entrepreneur';
  text: string;
  audioUrl?: string;
  judge?: {
    id: string;
    name: string;
    convictionLevel: number;
  };
}

interface JudgeReply {
  text: string;
  audioUrl: string;
  judge: {
    id: string;
    name: string;
    convictionLevel: number;
  };
}

interface JudgeInfo {
  id: string;
  name: string;
  convictionLevel: number;
  persona: string;
  questionsAsked: number;
  currentOffer?: {
    amount: number;
    equity: number;
    isFinal: boolean;
  };
}

interface SessionParams {
  id: string;
  conversationHistory: Dialogue[];
  judges: Record<string, JudgeInfo>;
  currentJudge: string | null;
  createdAt: Date;
  lastUpdatedAt: Date;
}

type Mode = 'text' | 'audio';
type AIStrength = 'weak' | 'moderate' | 'strong' | 'human';

export default function FishTank() {
  const [dialogues, setDialogues] = useState<Dialogue[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('text');
  const aiMode: AIStrength = 'human';
  const [sessionParams, setSessionParams] = useState<SessionParams | null>(null);
  const [isAITyping, setIsAITyping] = useState(false);

  // Audio recording states
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Add judges state to the component
  const [judges, setJudges] = useState<JudgeInfo[]>([]);

  // Add debug state
  const [showDebug, setShowDebug] = useState(false);

  const hasStartedSession = useRef(false);

  // Start a new session on mount
  useEffect(() => {
    if (hasStartedSession.current) return;
    hasStartedSession.current = true;
    const startSession = async () => {
      try {
        setLoading(true);
        console.log('Starting new session...');
        const response = await fetch('/api/fishtank/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aiMode: aiMode }),
        });

        if (!response.ok) {
          throw new Error('Failed to start session');
        }

        const data = await response.json();
        console.log('Session started:', data);
        setSessionId(data.sessionId);
        setJudges(data.judges);
        setDialogues([
          {
            speaker: 'judge',
            text: data.initialGreeting.text,
            judge: data.initialGreeting.judge,
          },
        ]);
      } catch (error) {
        console.error('Error starting session:', error);
        alert('Failed to start the game. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    startSession();
  }, [aiMode]);

  useEffect(() => {
    if (!sessionId) return;
    const fetchSession = async () => {
      const res = await fetch(`/api/fishtank/session/${sessionId}`);
      const data = await res.json();
      setSessionParams(data);
    };
    fetchSession();
  }, [sessionId, dialogues]);

  // Start recording function
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setAudioBlob(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Unable to access microphone. Please check permissions.');
    }
  };

  // Stop recording function
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      // Stop the tracks to release the microphone
      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }
    }
  };

  // Cancel recording function
  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setAudioBlob(null);
      // Stop the tracks to release the microphone
      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }
    }
  };

  // Handle text submission
  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !sessionId) return;

    try {
      setLoading(true);
      setIsAITyping(true);
      console.log('Sending message for session:', sessionId);
      console.log('Message:', input);

      const response = await fetch('/api/fishtank/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: input,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Server error:', errorData);
        throw new Error(errorData.error || 'Failed to send message');
      }

      const data = await response.json();
      console.log('Received response:', data);

      // Update dialogues with new responses
      setDialogues((prev) => [
        ...prev,
        { speaker: 'player', text: input },
        ...data.replies.map((reply: JudgeReply) => ({
          speaker: 'judge',
          text: reply.text,
          judge: reply.judge,
          audioUrl: reply.audioUrl,
        })),
      ]);

      // Update judges state
      setJudges(data.allJudges);
      setInput('');
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setLoading(false);
      setIsAITyping(false);
    }
  };

  // Handle audio submission
  const handleAudioSubmit = async () => {
    if (!audioBlob || !sessionId) return;

    setLoading(true);
    setIsAITyping(true);

    // Create a form with the audio file
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');
    formData.append('sessionId', sessionId);
    formData.append('mode', 'audio');

    try {
      // Send to backend
      const res = await fetch('/api/fishtank/audio-reply', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      // Add user reply (show transcription if available)
      setDialogues((prev) => [
        ...prev,
        {
          speaker: 'user',
          text: data.transcription || '[Audio message]',
        },
      ]);

      // Add all judge replies
      const newDialogues = data.replies.map((reply: JudgeReply) => ({
        speaker: 'judge' as const,
        text: reply.text,
        audioUrl: reply.audioUrl,
        judge: reply.judge,
      }));
      setDialogues((prev) => [...prev, ...newDialogues]);

      // Update all judges
      if (data.allJudges) {
        setJudges(data.allJudges);
      }
    } catch (err) {
      console.error('Error sending audio:', err);
      alert('Failed to send audio. Please try again.');
    } finally {
      setAudioBlob(null);
      setLoading(false);
      setIsAITyping(false);
    }
  };

  // Add debug panel component
  const DebugPanel = () => {
    if (!showDebug) return null;

    return (
      <div className="mt-8 p-4 bg-gray-100 rounded-lg border border-gray-300">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">Debug Information</h2>
          <button
            onClick={() => setShowDebug(false)}
            className="text-sm text-gray-600 hover:text-gray-800"
          >
            Hide Debug
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Session State */}
          <div className="bg-white p-4 rounded shadow">
            <h3 className="font-semibold mb-2">Session State</h3>
            <pre className="text-xs overflow-auto max-h-60">
              {JSON.stringify(sessionParams, null, 2)}
            </pre>
          </div>

          {/* Judges State */}
          <div className="bg-white p-4 rounded shadow">
            <h3 className="font-semibold mb-2">Judges State</h3>
            <pre className="text-xs overflow-auto max-h-60">{JSON.stringify(judges, null, 2)}</pre>
          </div>

          {/* Conversation History */}
          <div className="bg-white p-4 rounded shadow">
            <h3 className="font-semibold mb-2">Conversation History</h3>
            <pre className="text-xs overflow-auto max-h-60">
              {JSON.stringify(dialogues, null, 2)}
            </pre>
          </div>

          {/* Current State */}
          <div className="bg-white p-4 rounded shadow">
            <h3 className="font-semibold mb-2">Current State</h3>
            <pre className="text-xs overflow-auto max-h-60">
              {JSON.stringify(
                {
                  sessionId,
                  loading,
                  mode,
                  aiMode,
                  isRecording,
                  isAITyping,
                  hasAudioBlob: !!audioBlob,
                },
                null,
                2,
              )}
            </pre>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fishtank-container">
      {/* Judges Panel - Side by side stats */}
      <div className="judges-panel">
        {judges.map((judge) => (
          <div key={judge.id} className="judge-card">
            <h3 className="judge-name">{judge.name}</h3>
            <div className="judge-stats">
              <div className="stat">
                <span className="label">Conviction:</span>
                <span
                  className={`value ${
                    judge.convictionLevel < 20
                      ? 'text-red-500'
                      : judge.convictionLevel >= 50
                        ? 'text-green-500'
                        : 'text-orange-500'
                  }`}
                >
                  {judge.convictionLevel}%
                </span>
              </div>
              <div className="stat">
                <span className="label">Questions:</span>
                <span className="value">{judge.questionsAsked}</span>
              </div>
              {judge.currentOffer && (
                <div className="stat offer">
                  <span className="label">Current Offer:</span>
                  <span className="value">
                    ${judge.currentOffer.amount} for {judge.currentOffer.equity}%
                    {judge.currentOffer.isFinal && ' (Final)'}
                  </span>
                </div>
              )}
              <div className="status">
                {judge.convictionLevel < 20 ? (
                  <span className="text-red-500">🚫 Out</span>
                ) : judge.currentOffer ? (
                  <span className="text-green-500">💰 Negotiating</span>
                ) : (
                  <span className="text-blue-500">⏳ Listening</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Chat Area */}
      <div className="chat-container">
        <div className="dialogues-container">
          {dialogues.map((d, index) => (
            <div key={index} className={`dialogue ${d.speaker}`}>
              <div className="dialogue-content">
                {d.speaker === 'judge' && d.judge && (
                  <div className="judge-info">
                    <span className="judge-name">{d.judge.name}</span>
                  </div>
                )}
                <p>{d.text}</p>
                {d.audioUrl && (
                  <audio controls className="mt-2">
                    <source src={d.audioUrl} type="audio/mpeg" />
                    Your browser does not support the audio element.
                  </audio>
                )}
              </div>
            </div>
          ))}
          {isAITyping && (
            <div
              className="ai-typing-indicator"
              style={{ color: '#888', fontStyle: 'italic', margin: '8px 0' }}
            >
              AI is generating a response...
            </div>
          )}
        </div>

        <div className="input-container">
          {mode === 'text' ? (
            <form onSubmit={handleTextSubmit} className="text-input-form">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your response..."
                disabled={loading || isAITyping}
                className="text-input"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!sessionId) return;
                  try {
                    setLoading(true);
                    setIsAITyping(true);
                    const response = await fetch('/api/fishtank/ai-player-reply', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ sessionId }),
                    });
                    const data = await response.json();
                    if (data.reply) {
                      setInput(data.reply);
                    }
                  } catch (error) {
                    console.error('Error generating AI reply:', error);
                  } finally {
                    setLoading(false);
                    setIsAITyping(false);
                  }
                }}
                disabled={loading || isAITyping}
                className="ai-button"
              >
                🤖 AI
              </button>
              <button type="submit" disabled={loading || isAITyping} className="submit-button">
                {loading ? 'Thinking...' : 'Send'}
              </button>
            </form>
          ) : (
            <div className="audio-input-container">
              {!isRecording && !audioBlob && (
                <button onClick={startRecording} className="record-button">
                  Start Recording
                </button>
              )}
              {isRecording && (
                <div className="recording-controls">
                  <button onClick={stopRecording} className="stop-button">
                    Stop Recording
                  </button>
                  <button onClick={cancelRecording} className="cancel-button">
                    Cancel
                  </button>
                </div>
              )}
              {audioBlob && (
                <div className="audio-preview">
                  <audio src={URL.createObjectURL(audioBlob)} controls />
                  <div className="audio-actions">
                    <button
                      onClick={handleAudioSubmit}
                      disabled={loading}
                      className="submit-button"
                    >
                      {loading ? 'Sending...' : 'Send'}
                    </button>
                    <button onClick={cancelRecording} className="cancel-button">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mode-toggle">
            <label
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}
            >
              <input
                type="radio"
                name="mode"
                value="text"
                checked={mode === 'text'}
                onChange={() => setMode('text')}
                style={{ accentColor: '#4299e1' }}
              />
              Text
            </label>
            <label
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}
            >
              <input
                type="radio"
                name="mode"
                value="audio"
                checked={mode === 'audio'}
                onChange={() => setMode('audio')}
                style={{ accentColor: '#4299e1' }}
              />
              Audio
            </label>
          </div>
        </div>
      </div>

      {showDebug && <DebugPanel />}
    </div>
  );
}
