import { useState } from 'react';
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
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface PacingDataPoint {
  time: number;
  wpm: number;
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
}

export default function VoiceCoach() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAudioFile(e.target.files[0]);
    }
  };

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
            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
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
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Transcription</h2>
            <p className="text-gray-700">{result.transcription.text}</p>
          </div>

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
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      beginAtZero: true,
                      title: {
                        display: true,
                        text: 'Words per Minute',
                      },
                    },
                    x: {
                      title: {
                        display: true,
                        text: 'Time (seconds)',
                      },
                    },
                  },
                  plugins: {
                    legend: {
                      position: 'top' as const,
                    },
                  },
                }}
              />
            </div>
            <p className="mt-4 text-sm text-gray-600">
              Average speaking rate: {Math.round(result.pacing.averageWPM)} words per minute
            </p>
          </div>
        </div>
      )}
    </div>
  );
} 