import { useState, useEffect } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import annotationPlugin from 'chartjs-plugin-annotation';
import { useNavigate, useLocation } from 'react-router-dom';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  annotationPlugin
);

interface PacingDataPoint {
  time: number;
  wpm: number;
}

interface FillerWordCount {
  word: string;
  count: number;
}

interface AnalysisResult {
  transcription: {
    text: string;
    words: Array<{
      text: string;
      start: number;
      end: number;
      type: string;
    }>;
  };
  pacing: {
    dataPoints: PacingDataPoint[];
    averageWPM: number;
  };
  fillerWords: {
    total: number;
    breakdown: FillerWordCount[];
  };
  grammar: Array<{
    sentence: string;
    errors: Array<{
      text: string;
      suggestion: string;
      category: string;
    }>;
  }>;
  mergedAudioUrl?: string;
  reportUrl?: string;
}

interface SelectedFile {
  name: string;
  size: number;
}

// Helper function to clean word text by removing punctuation and converting to lowercase
// This ensures we correctly identify filler words even when they have punctuation
function cleanWord(text: string): string {
  return text.replace(/[.,!?;:()]/g, '').toLowerCase();
}

// Reusable component for displaying words with filler word highlighting
// Preserves punctuation in the display while correctly identifying filler words
function WordDisplay({ words }: { words: Array<{ text: string; type: string }> }) {
  // Set of filler words to check against - should match server's FILLER_WORDS
  const fillerWords = new Set(['uh', 'um', 'ah', 'er', 'hm', 'hmm', 'like', 'right', 'so', 'well', 'actually', 'basically', 'literally', 'technically', 'honestly', 'frankly', 'seriously']);
  
  // Set of multi-word filler phrases to check - should match server's FILLER_PHRASES
  const fillerPhrases = new Set(['you know', 'kind of', 'sort of', 'i mean', 'you see']);
  
  // Create an array to track which words are part of a phrase and their positions
  const phraseRanges: Array<{ start: number; end: number }> = [];
  
  // First pass: identify all phrases and their ranges
  for (let i = 0; i < words.length - 1; i++) {
    // Skip whitespace words
    if (words[i].type === 'spacing') continue;
    
    // Find the next non-whitespace word
    let nextWordIndex = i + 1;
    while (nextWordIndex < words.length && words[nextWordIndex].type === 'spacing') {
      nextWordIndex++;
    }
    if (nextWordIndex >= words.length) break;
    
    const currentWord = cleanWord(words[i].text);
    const nextWord = cleanWord(words[nextWordIndex].text);
    const phrase = `${currentWord} ${nextWord}`;
    
    if (fillerPhrases.has(phrase)) {
      phraseRanges.push({ start: i, end: nextWordIndex });
    }
  }
  
  // Function to check if a word is part of a phrase
  const isInPhrase = (index: number) => {
    return phraseRanges.some(range => index >= range.start && index <= range.end);
  };
  
  // Function to check if a word is the start of a phrase
  const isPhraseStart = (index: number) => {
    return phraseRanges.some(range => range.start === index);
  };
  
  return (
    <div className="prose max-w-none">
      {words.map((word, index) => {
        // Skip whitespace words for highlighting
        if (word.type === 'spacing') {
          return <span key={index}>{word.text}</span>;
        }
        
        // Check if the word (without punctuation) is a filler word
        const isFiller = fillerWords.has(cleanWord(word.text));
        
        // Check if this word is part of a phrase
        const isPartOfPhrase = isInPhrase(index);
        
        // If this is the start of a phrase, wrap the entire phrase
        if (isPhraseStart(index)) {
          const range = phraseRanges.find(range => range.start === index)!;
          const phraseWords = words.slice(range.start, range.end + 1);
          return (
            <span
              key={index}
              className="bg-red-100 text-red-800 px-1 rounded"
            >
              {phraseWords.map(w => w.text).join(' ')}
            </span>
          );
        }
        
        // Skip rendering if this word is part of a phrase but not the start
        if (isPartOfPhrase) {
          return null;
        }
        
        // Render single filler words
        return (
          <span
            key={index}
            className={isFiller ? 'bg-red-100 text-red-800 px-1 rounded' : ''}
          >
            {word.text}
          </span>
        );
      })}
    </div>
  );
}

// Component for displaying raw transcript without highlighting
function RawTranscript({ words }: { words: Array<{ text: string; type: string }> }) {
  return (
    <div className="prose max-w-none">
      {words.map((word, index) => (
        <span key={index}>{word.text}</span>
      ))}
    </div>
  );
}

// Helper function to get category-specific styling
function getCategoryStyle(category: string) {
  switch (category.toLowerCase()) {
    case 'incorrect vocabulary':
      return {
        bg: 'bg-blue-50',
        text: 'text-blue-800',
        badge: 'bg-blue-100 text-blue-800',
        highlight: 'bg-blue-100'
      };
    case 'unclear message':
      return {
        bg: 'bg-purple-50',
        text: 'text-purple-800',
        badge: 'bg-purple-100 text-purple-800',
        highlight: 'bg-purple-100'
      };
    case 'broken sentences':
      return {
        bg: 'bg-orange-50',
        text: 'text-orange-800',
        badge: 'bg-orange-100 text-orange-800',
        highlight: 'bg-orange-100'
      };
    default:
      return {
        bg: 'bg-red-50',
        text: 'text-red-800',
        badge: 'bg-red-100 text-red-800',
        highlight: 'bg-red-100'
      };
  }
}

// Helper to get segment color for new ranges
function getFillerSegmentColor(segment: number) {
  if (segment <= 3) return 'bg-green-400 border-green-500';
  if (segment <= 6) return 'bg-yellow-400 border-yellow-500';
  if (segment <= 9) return 'bg-orange-400 border-orange-500';
  return 'bg-red-500 border-red-600';
}

// Gauge meter for speaking pace
function PaceGauge({ value }: { value: number }) {
  // Gauge settings
  const min = 0;
  const max = 300;
  const slowMax = 110;
  const convMax = 180;
  // Helper to get arc path for a range (always draws a semicircle segment)
  function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const largeArcFlag = endAngle - startAngle > 180 ? "1" : "0";
    return [
      "M", start.x, start.y,
      "A", r, r, 0, largeArcFlag, 0, end.x, end.y
    ].join(" ");
  }
  function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
    const rad = (angle - 90) * Math.PI / 180.0;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad)
    };
  }
  // Map WPM to angle from -90 (left) to +90 (right)
  const mapWPMToAngle = (wpm: number) => {
    const clamped = Math.max(min, Math.min(wpm, max));
    return ((clamped - min) / (max - min)) * 180 - 90;
  };
  // Arc segment angles (all in -90 to +90)
  const slowStart = -90;
  const slowEnd = mapWPMToAngle(slowMax);
  const convEnd = mapWPMToAngle(convMax);
  const fastEnd = 90;
  // Needle
  const needleAngle = mapWPMToAngle(value);

  return (
    <div className="flex flex-col items-center w-full" style={{ minHeight: 160 }}>
      <svg width="260" height="140" viewBox="0 0 260 140">
        {/* Slow (orange) */}
        <path d={describeArc(130, 130, 100, slowStart, slowEnd)} fill="none" stroke="#fbbf24" strokeWidth="16" />
        {/* Conversational (green) */}
        <path d={describeArc(130, 130, 100, slowEnd, convEnd)} fill="none" stroke="#4ade80" strokeWidth="16" />
        {/* Fast (red) */}
        <path d={describeArc(130, 130, 100, convEnd, fastEnd)} fill="none" stroke="#f87171" strokeWidth="16" />
        {/* Needle */}
        <g transform={`rotate(${needleAngle} 130 130)`}>
          <rect x="128" y="50" width="4" height="80" fill="#374151" rx="2" />
        </g>
        {/* Center circle */}
        <circle cx="130" cy="130" r="10" fill="#374151" />
      </svg>
      <div className="flex w-full justify-between mt-2 text-base font-semibold">
        <span className="text-orange-400">Slow</span>
        <span className="text-green-700">Conversational</span>
        <span className="text-red-400">Fast</span>
      </div>
    </div>
  );
}

export default function VoiceCoach() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [mergedAudioUrl, setMergedAudioUrl] = useState<string | null>(null);
  const [showRawTranscript, setShowRawTranscript] = useState(false);
  const [showHighlightedTranscript, setShowHighlightedTranscript] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const reportId = params.get('report');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newFiles = Array.from(files).map(file => ({
        name: file.name,
        size: file.size
      }));
      setSelectedFiles(newFiles);
      
      // Create object URL for the first file to play
      const firstFile = files[0];
      if (firstFile) {
        const url = URL.createObjectURL(firstFile);
        setAudioUrl(url);
      }
    } else {
      setSelectedFiles([]);
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
    }
  };

  // Clean up the audio URL when component unmounts or file changes
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  useEffect(() => {
    if (reportId) {
      fetch(`http://localhost:3001/api/voicecoach/report/${reportId}`)
        .then(res => res.json())
        .then(data => {
          setAnalysisResult(data);
          if (data.mergedAudioUrl) {
            setMergedAudioUrl(`http://localhost:3001${data.mergedAudioUrl}`);
          }
        });
    }
  }, [reportId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFiles.length === 0) return;

    setIsAnalyzing(true);
    const formData = new FormData();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput.files) {
      Array.from(fileInput.files).forEach(file => {
        formData.append('audio', file);
      });
    }

    try {
      const response = await fetch('http://localhost:3001/api/voicecoach/analyze-voice', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      setAnalysisResult(data);
      if (data.mergedAudioUrl) {
        setMergedAudioUrl(`http://localhost:3001${data.mergedAudioUrl}`);
      }
      if (data.reportUrl) {
        navigate(data.reportUrl, { replace: true });
      }
    } catch (error) {
      console.error('Error analyzing voice:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context) => `Words per minute: ${context.parsed.y}`,
        },
      },
      annotation: {
        annotations: {
          extremeZone1: {
            type: 'box',
            yMin: 0,
            yMax: 100,
            backgroundColor: 'rgba(255, 0, 0, 0.1)', // Light red
            borderWidth: 0,
          },
          cautionZone1: {
            type: 'box',
            yMin: 100,
            yMax: 120,
            backgroundColor: 'rgba(255, 165, 0, 0.5)', // Light orange
            borderWidth: 0,
          },
          idealZone: {
            type: 'box',
            yMin: 120,
            yMax: 170,
            backgroundColor: 'rgba(144, 238, 144, 0.5)', // Light green
            borderWidth: 0,
          },
          cautionZone2: {
            type: 'box',
            yMin: 170,
            yMax: 200,
            backgroundColor: 'rgba(255, 165, 0, 0.5)', // Light orange
            borderWidth: 0,
          },
          extremeZone2: {
            type: 'box',
            yMin: 200,
            yMax: 300, // Arbitrary upper limit
            backgroundColor: 'rgba(255, 0, 0, 0.1)', // Light red
            borderWidth: 0,
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Words per minute',
        },
      },
      x: {
        title: {
          display: true,
          text: 'Time (seconds)',
        },
      },
    },
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 w-full">
      <div className="mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Voice Coach</h1>
          
          {/* Hide upload UI if viewing a report */}
          {!reportId && (
            <div className="mx-auto w-full">
              <div className="flex justify-center">
                <label className="w-full flex flex-col items-center px-4 py-6 bg-white rounded-lg shadow-lg tracking-wide border border-blue-500 cursor-pointer hover:bg-blue-50">
                  <svg className="w-8 h-8 text-blue-500" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M16.88 9.1A4 4 0 0 1 16 17H5a5 5 0 0 1-1-9.9V7a3 3 0 0 1 4.52-2.59A4.98 4.98 0 0 1 17 8c0 .38-.04.74-.12 1.1zM11 11h3l-4-4-4 4h3v3h2v-3z" />
                  </svg>
                  <span className="mt-2 text-base leading-normal">Select audio files</span>
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="audio/*"
                    multiple
                    onChange={handleFileChange}
                  />
                  <p className="mt-2 text-xs text-gray-500">MP3, WAV, M4A, OGG, or WEBM up to 1GB</p>
                </label>
              </div>

              {selectedFiles.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Selected Files:</h3>
                  <ul className="space-y-2">
                    {selectedFiles.map((file, index) => (
                      <li key={index} className="flex items-center justify-between bg-white p-2 rounded-md shadow">
                        <span className="text-sm text-gray-600">{file.name}</span>
                        <span className="text-xs text-gray-500">
                          {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-8">
                <div className="mt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={selectedFiles.length === 0 || isAnalyzing}
                    className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
                  >
                    {isAnalyzing ? (
                      <>
                        <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      'Analyze Voice'
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {analysisResult && (
            <div className="mt-8">
              {/* Audio player section */}
              {mergedAudioUrl && (
                <div className="mb-8 bg-white shadow rounded-lg p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">Audio Playback</h2>
                  <div className="flex items-center space-x-4">
                    <audio
                      controls
                      className="w-full"
                      src={mergedAudioUrl}
                    >
                      Your browser does not support the audio element.
                    </audio>
                    <a
                      href={mergedAudioUrl}
                      download
                      className="ml-2 px-3 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium hover:bg-blue-200"
                    >
                      Download Merged Audio
                    </a>
                  </div>
                </div>
              )}

              {/* Main transcription section (collapsible) */}
              <div className="bg-white shadow rounded-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-medium text-gray-900">Transcription</h2>
                  <button
                    onClick={() => setShowRawTranscript(v => !v)}
                    className="text-sm text-indigo-600 hover:text-indigo-500"
                  >
                    {showRawTranscript ? 'Hide' : 'Show'} Transcript
                  </button>
                </div>
                {showRawTranscript && (
                  <div className="mt-4">
                    <RawTranscript words={analysisResult.transcription.words} />
                  </div>
                )}
              </div>

              {/* Speaking pace analysis section */}
              <div className="mt-8 bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Speaking Pace Analysis</h2>
                <div className="mb-6 flex flex-col md:flex-row gap-6 items-stretch justify-center">
                  {/* WPM KPI Card (left, 50%) */}
                  <div className="bg-indigo-50 rounded-lg p-6 flex flex-col items-center justify-center shadow text-center w-full md:w-1/2 h-full min-h-[220px]">
                    <span className="text-4xl font-bold text-indigo-700">{Math.round(analysisResult.pacing.averageWPM)}</span>
                    <span className="text-sm text-indigo-900 mt-2">Words per Minute</span>
                  </div>
                  {/* Pace Gauge Meter (right, 50%) */}
                  <div className="bg-indigo-50 rounded-lg p-6 flex flex-col items-center justify-center shadow text-center w-full md:w-1/2 h-full min-h-[220px]">
                    <PaceGauge value={Math.round(analysisResult.pacing.averageWPM)} />
                  </div>
                </div>
                <div className="h-64">
                  <Line
                    data={{
                      labels: analysisResult.pacing.dataPoints.map(point => `${Math.round(point.time)}s`),
                      datasets: [
                        {
                          label: 'Words per Minute',
                          data: analysisResult.pacing.dataPoints.map(point => point.wpm),
                          borderColor: 'rgb(79, 70, 229)',
                          backgroundColor: 'rgba(79, 70, 229, 0.5)',
                          tension: 0.1,
                        },
                        {
                          label: 'Average WPM',
                          data: Array(analysisResult.pacing.dataPoints.length).fill(analysisResult.pacing.averageWPM),
                          borderColor: 'rgb(156, 163, 175)',
                          borderDash: [5, 5],
                          borderWidth: 1,
                        },
                      ],
                    }}
                    options={chartOptions}
                  />
                </div>
              </div>

              {/* Filler words analysis section */}
              {analysisResult.fillerWords && (
                <div className="mt-8 bg-white shadow rounded-lg p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">Filler Words Analysis</h2>

                  {/* KPI Cards and Filler Words per Minute Meter side by side */}
                  <div className="flex flex-col md:flex-row gap-6 mb-6">
                    {/* KPI Cards row (50%) */}
                    <div className="w-full md:w-1/2 flex flex-row gap-4 justify-center items-center">
                      {/* KPI Card for Total Filler Words */}
                      <div className="bg-indigo-50 rounded-lg p-6 flex flex-col items-center justify-center shadow text-center w-1/2">
                        <span className="text-4xl font-bold text-indigo-700">{analysisResult.fillerWords.total}</span>
                        <span className="text-sm text-indigo-900 mt-2">Total Filler Words</span>
                      </div>
                      {/* KPI Card for Filler Words per Minute */}
                      <div className="bg-indigo-50 rounded-lg p-6 flex flex-col items-center justify-center shadow text-center w-1/2">
                        {(() => {
                          const words = analysisResult.transcription.words;
                          const first = words.find(w => typeof w.start === 'number');
                          const last = [...words].reverse().find(w => typeof w.end === 'number');
                          const audioLengthSec = first && last ? (last.end! - first.start!) : 0;
                          const audioLengthMin = audioLengthSec / 60;
                          const avgFillerWPM = audioLengthMin > 0 ? (analysisResult.fillerWords.total / audioLengthMin) : 0;
                          return (
                            <>
                              <span className="text-4xl font-bold text-indigo-700">{avgFillerWPM.toFixed(2)}</span>
                              <span className="text-sm text-indigo-900 mt-2">Filler Words/min</span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    {/* Filler Words per Minute Meter (50%) */}
                    <div className="w-full md:w-1/2 flex flex-col justify-center">
                      {(() => {
                        // Calculate audio length in seconds
                        const words = analysisResult.transcription.words;
                        const first = words.find(w => typeof w.start === 'number');
                        const last = [...words].reverse().find(w => typeof w.end === 'number');
                        const audioLengthSec = first && last ? (last.end! - first.start!) : 0;
                        const audioLengthMin = audioLengthSec / 60;
                        const avgFillerWPM = audioLengthMin > 0 ? (analysisResult.fillerWords.total / audioLengthMin) : 0;
                        const maxSegments = 12;
                        const cappedWPM = Math.min(Math.round(avgFillerWPM), maxSegments);
                        return (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-gray-700">Filler Words per Minute</span>
                            </div>
                            <div className="flex gap-2 mb-2">
                              {Array.from({ length: maxSegments }, (_, i) => {
                                const segment = i + 1;
                                const filled = cappedWPM >= segment;
                                const color = getFillerSegmentColor(segment);
                                return (
                                  <div
                                    key={segment}
                                    className={`w-8 h-10 rounded-md border ${color} ${filled ? 'opacity-100' : 'opacity-10'}`}
                                  ></div>
                                );
                              })}
                            </div>
                            <div className="flex w-full justify-between text-xs text-gray-500 mt-1 font-semibold">
                              <span className="w-1/4 text-green-700 text-center">Great</span>
                              <span className="w-1/4 text-yellow-700 text-center">OK</span>
                              <span className="w-1/4 text-orange-700 text-center">Needs work</span>
                              <span className="w-1/4 text-red-700 text-center">Umm...</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Filler word statistics as pills */}
                  <div className="text-sm text-gray-600 mb-4">
                    {analysisResult.fillerWords.breakdown.length > 0 && (
                      <div className="flex flex-wrap gap-2 items-center">
                        {analysisResult.fillerWords.breakdown.map((item, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm"
                          >
                            {item.word} <span className="ml-1 text-xs text-blue-600">({item.count})</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Transcript with filler words highlighted (collapsible) */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-sm font-medium text-gray-900">Transcript with Filler Words Highlighted</h3>
                      <button
                        onClick={() => setShowHighlightedTranscript(v => !v)}
                        className="text-sm text-indigo-600 hover:text-indigo-500"
                      >
                        {showHighlightedTranscript ? 'Hide' : 'Show'} Transcript
                      </button>
                    </div>
                    {showHighlightedTranscript && (
                      <div className="mt-2">
                        <WordDisplay words={analysisResult.transcription.words} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Grammar analysis section */}
              {analysisResult.grammar && analysisResult.grammar.length > 0 && (
                <div className="mt-8 bg-white shadow rounded-lg p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-medium text-gray-900">Content and Clarity Analysis</h2>
                  </div>
                  <div className="mt-4 space-y-6">
                    {analysisResult.grammar.map((item, index) => (
                      <div key={index} className="border-b border-gray-200 pb-4 last:border-b-0">
                        <p className="text-gray-900 mb-2">{item.sentence}</p>
                        {item.errors.length > 0 ? (
                          <div className="space-y-2">
                            {item.errors.map((error, errorIndex) => {
                              const style = getCategoryStyle(error.category);
                              return (
                                <div key={errorIndex} className={`${style.bg} p-3 rounded-md`}>
                                  <div className="flex items-start justify-between">
                                    <p className={`${style.text} font-medium`}>
                                      <span className={`${style.highlight} px-1 rounded`}>{error.text}</span>
                                    </p>
                                    <span className={`text-xs ${style.badge} px-2 py-1 rounded-full`}>
                                      {error.category}
                                    </span>
                                  </div>
                                  <p className={`${style.text} text-sm mt-1`}>
                                    Suggestion: {error.suggestion}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-green-600 text-sm">✓ No grammatical errors found</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 