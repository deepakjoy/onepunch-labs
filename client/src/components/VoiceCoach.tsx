import { useState, useEffect } from 'react';
import { MicrophoneIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
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

export default function VoiceCoach() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showHighlightedTranscript, setShowHighlightedTranscript] = useState(false);
  const [showGrammar, setShowGrammar] = useState(true);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAudioFile(file);
      // Create URL for the audio file
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFile) return;

    setIsAnalyzing(true);
    const formData = new FormData();
    formData.append('audio', audioFile);

    try {
      const response = await fetch('http://localhost:3001/api/analyze-voice', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      setResult(data);
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
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-base font-semibold leading-6 text-gray-900">Voice Coach</h1>
          <p className="mt-2 text-sm text-gray-700">
            Upload an audio file to analyze your speaking patterns.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-8">
        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
          <div className="space-y-1 text-center">
            <MicrophoneIcon className="mx-auto h-12 w-12 text-gray-400" />
            <div className="flex justify-center text-sm text-gray-600">
              <label
                htmlFor="audio-upload"
                className="relative cursor-pointer rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500"
              >
                <span>Upload a file</span>
                <input
                  id="audio-upload"
                  name="audio"
                  type="file"
                  className="sr-only"
                  accept="audio/*"
                  onChange={handleFileChange}
                />
              </label>
              <p className="pl-1">or drag and drop</p>
            </div>
            <p className="text-xs text-gray-500">MP3, WAV, M4A, OGG, or WEBM up to 10MB</p>
            {audioFile && (
              <p className="mt-2 text-sm text-gray-500">
                Selected file: {audioFile.name}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={!audioFile || isAnalyzing}
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

      {result && (
        <div className="mt-8">
          {/* Audio player section */}
          {audioUrl && (
            <div className="mb-8 bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Audio Playback</h2>
              <div className="flex items-center space-x-4">
                <audio
                  controls
                  className="w-full"
                  src={audioUrl}
                >
                  Your browser does not support the audio element.
                </audio>
              </div>
            </div>
          )}

          {/* Main transcription section */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium text-gray-900">Transcription</h2>
              <button
                onClick={() => setShowTranscript(!showTranscript)}
                className="text-sm text-indigo-600 hover:text-indigo-500"
              >
                {showTranscript ? 'Hide Transcript' : 'Show Transcript'}
              </button>
            </div>
            {showTranscript && (
              <div className="mt-4">
                <RawTranscript words={result.transcription.words} />
              </div>
            )}
          </div>

          {/* Speaking pace analysis section */}
          <div className="mt-8 bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Speaking Pace Analysis</h2>
            <div className="h-64">
              <Line
                data={{
                  labels: result.pacing.dataPoints.map(point => `${Math.round(point.time)}s`),
                  datasets: [
                    {
                      label: 'Words per Minute',
                      data: result.pacing.dataPoints.map(point => point.wpm),
                      borderColor: 'rgb(79, 70, 229)',
                      backgroundColor: 'rgba(79, 70, 229, 0.5)',
                      tension: 0.1,
                    },
                    {
                      label: 'Average WPM',
                      data: Array(result.pacing.dataPoints.length).fill(result.pacing.averageWPM),
                      borderColor: 'rgb(156, 163, 175)',
                      borderDash: [5, 5],
                      borderWidth: 1,
                    },
                  ],
                }}
                options={chartOptions}
              />
            </div>
            <p className="mt-4 text-sm text-gray-600">
              Average speaking rate: {Math.round(result.pacing.averageWPM)} words per minute
            </p>
          </div>

          {/* Filler words analysis section */}
          {result.fillerWords && (
            <div className="mt-8 bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Filler Words Analysis</h2>
              <div className="space-y-4">
                {/* Filler word statistics */}
                <div className="text-sm text-gray-600">
                  <p>Total filler words: {result.fillerWords.total}</p>
                  {result.fillerWords.breakdown.length > 0 && (
                    <div className="mt-2">
                      <p>Breakdown:</p>
                      <ul className="list-disc list-inside">
                        {result.fillerWords.breakdown.map((item, index) => (
                          <li key={index}>
                            "{item.word}" ({item.count})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {/* Transcript with filler words highlighted */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-medium text-gray-900">Transcript with Filler Words Highlighted</h3>
                    <button
                      onClick={() => setShowHighlightedTranscript(!showHighlightedTranscript)}
                      className="text-sm text-indigo-600 hover:text-indigo-500"
                    >
                      {showHighlightedTranscript ? 'Hide Transcript' : 'Show Transcript'}
                    </button>
                  </div>
                  {showHighlightedTranscript && (
                    <div className="mt-2">
                      <WordDisplay words={result.transcription.words} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Grammar analysis section */}
          {result.grammar && result.grammar.length > 0 && (
            <div className="mt-8 bg-white shadow rounded-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium text-gray-900">Content and Clarity Analysis</h2>
                <button
                  onClick={() => setShowGrammar(!showGrammar)}
                  className="text-sm text-indigo-600 hover:text-indigo-500"
                >
                  {showGrammar ? 'Hide Analysis' : 'Show Analysis'}
                </button>
              </div>
              {showGrammar && (
                <div className="mt-4 space-y-6">
                  {result.grammar.map((item, index) => (
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
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
} 