import React, { useState, useEffect, useRef } from 'react';
import { JudgesTable } from './JudgesTable';

interface Dialogue {
  speaker: 'judge' | 'user';
  text: string;
  audioUrl?: string;
  judge?: {
    id: string;
    name: string;
    convictionLevel: number;
    isOut: boolean;
    inNegotiation: boolean;
  };
}

type Mode = 'text' | 'audio';

interface KeyParameter {
  name: string;
  weight: number;
  satisfied: boolean;
}

interface JudgeInfo {
  id: string;
  name: string;
  convictionLevel: number;
  isOut: boolean;
  inNegotiation: boolean;
  currentOffer: number | null;
  keyParameters?: KeyParameter[];
}

export default function FishTank() {
  const [dialogues, setDialogues] = useState<Dialogue[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('text');
  
  // Audio recording states
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Add judges state to the component
  const [judges, setJudges] = useState<JudgeInfo[]>([]);

  // Start a new session on mount
  useEffect(() => {
    const startSession = async () => {
      const res = await fetch('/api/fishtank/start', { method: 'POST' });
      const data = await res.json();
      setSessionId(data.sessionId);
      
      // Initialize judges
      setJudges(data.judges.map((judge: {id: string; name: string; convictionLevel?: number}) => ({
        ...judge,
        convictionLevel: judge.convictionLevel || 50,
        inNegotiation: false,
        isOut: false,
        currentOffer: null
      })));
      
      // Use the initial greeting from a judge
      setDialogues([{ 
        speaker: 'judge', 
        text: data.initialGreeting.text,
        judge: data.initialGreeting.judge
      }]);
    };
    startSession();
  }, []);

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
      console.error("Error accessing microphone:", err);
      alert("Unable to access microphone. Please check permissions.");
    }
  };

  // Stop recording function
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      // Stop the tracks to release the microphone
      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
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
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
    }
  };

  // Handle text submission
  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !sessionId) return;

    // Add user reply
    setDialogues(prev => [...prev, { speaker: 'user', text: input }]);
    setLoading(true);

    // Send to backend
    const res = await fetch('/api/fishtank/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message: input, mode: 'text' })
    });
    const data = await res.json();

    // Add judge reply
    setDialogues(prev => [...prev, { 
      speaker: 'judge', 
      text: data.reply,
      audioUrl: data.audioUrl,
      judge: data.judge
    }]);

    // If allJudges is provided, update all judges
    if (data.allJudges) {
      setJudges(data.allJudges);
    } else {
      // Fallback to the old logic of updating just the responding judge
      setJudges(prev => prev.map(j => 
        j.id === data.judge.id 
          ? { 
              ...j, 
              ...data.judge,
              keyParameters: data.judge.keyParameters || j.keyParameters 
            } 
          : j
      ));
    }

    setInput('');
    setLoading(false);
  };

  // Handle audio submission
  const handleAudioSubmit = async () => {
    if (!audioBlob || !sessionId) return;

    setLoading(true);
    
    // Create a form with the audio file
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');
    formData.append('sessionId', sessionId);
    formData.append('mode', 'audio');

    try {
      // Add user reply (audio placeholder for now)
      setDialogues(prev => [...prev, { 
        speaker: 'user', 
        text: "[Audio message]"
      }]);

      // Send to backend
      const res = await fetch('/api/fishtank/audio-reply', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      // Add judge reply with audio
      setDialogues(prev => [...prev, { 
        speaker: 'judge', 
        text: data.reply,
        audioUrl: data.audioUrl,
        judge: data.judge
      }]);

      // Auto-play the response if available
      if (data.audioUrl) {
        const audio = new Audio(data.audioUrl);
        audio.play();
      }

      // If allJudges is provided, update all judges
      if (data.allJudges) {
        setJudges(data.allJudges);
      } else {
        // Fallback to the old logic of updating just the responding judge
        setJudges(prev => prev.map(j => 
          j.id === data.judge.id 
            ? { 
                ...j, 
                ...data.judge,
                keyParameters: data.judge.keyParameters || j.keyParameters 
              } 
            : j
        ));
      }
    } catch (err) {
      console.error("Error sending audio:", err);
      alert("Failed to send audio. Please try again.");
    } finally {
      setAudioBlob(null);
      setLoading(false);
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 max-w-xl mx-auto py-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-4">FISH TANK</h1>
      
      {/* Add the judges table */}
      <JudgesTable judges={judges} />
      
      <div className="mb-4 flex items-center gap-4">
        <span className="font-medium">Mode:</span>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="mode"
            value="text"
            checked={mode === 'text'}
            onChange={() => setMode('text')}
          />
          Text
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="mode"
            value="audio"
            checked={mode === 'audio'}
            onChange={() => setMode('audio')}
          />
          Audio
        </label>
      </div>
      <div className="bg-white rounded shadow p-4 mb-4 min-h-[200px]">
        {dialogues.map((d, i) => (
          <div
            key={i}
            className={`my-2 ${d.speaker === 'judge' ? 'text-left' : 'text-right'}`}
          >
            <span className={`font-bold ${d.speaker === 'judge' ? 'text-blue-700' : 'text-green-700'}`}>
              {d.speaker === 'judge' ? (d.judge ? d.judge.name : 'Judge') : 'You'}:
            </span>{' '}
            {d.text}
            {d.judge && (
              <div className="text-xs text-gray-500 mt-1">
                Conviction Level: {d.judge.convictionLevel}/100
                {d.judge.isOut && ' 🚫 Out'}
                {d.judge.inNegotiation && ' 💰 Interested in a deal'}
              </div>
            )}
            {d.audioUrl && (
              <div className="mt-1">
                <audio src={d.audioUrl} controls className="w-full" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="my-2 text-left text-blue-500">Judge is thinking...</div>
        )}
      </div>
      {mode === 'text' ? (
        <form onSubmit={handleTextSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type your reply..."
            className="flex-1 border rounded px-3 py-2"
            disabled={loading}
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            disabled={loading}
          >
            Send
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          {!isRecording && !audioBlob ? (
            <button
              onClick={startRecording}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              disabled={loading}
            >
              Start Recording
            </button>
          ) : isRecording ? (
            <div className="flex gap-2">
              <button
                onClick={stopRecording}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 flex-1"
              >
                Stop Recording
              </button>
              <button
                onClick={cancelRecording}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleAudioSubmit}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 flex-1"
                disabled={loading}
              >
                Send Recording
              </button>
              <button
                onClick={() => setAudioBlob(null)}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                disabled={loading}
              >
                Discard
              </button>
            </div>
          )}
          {isRecording && (
            <div className="text-center text-red-600 animate-pulse font-medium">
              Recording in progress...
            </div>
          )}
          {audioBlob && !isRecording && (
            <div className="mt-2">
              <audio src={URL.createObjectURL(audioBlob)} controls className="w-full" />
            </div>
          )}
        </div>
      )}
    </div>
  );
} 