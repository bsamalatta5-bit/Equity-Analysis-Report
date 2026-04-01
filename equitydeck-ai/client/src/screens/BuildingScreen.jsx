import { useEffect, useRef, useState } from 'react';
import useAppStore from '../store/appStore';

const SLIDE_TITLES = [
  'Title Slide', 'Executive Summary', 'Business Overview', 'Product Portfolio',
  'Revenue Model', 'Financial Highlights', 'Margins & Profitability', 'Economic Moat',
  'Growth Drivers', 'Capital Structure', 'Key Risks', 'Investment Thesis',
];

const SLIDE_COLORS = [
  'bg-slate-700', 'bg-emerald-900', 'bg-blue-900', 'bg-purple-900',
  'bg-amber-900', 'bg-emerald-800', 'bg-teal-900', 'bg-indigo-900',
  'bg-green-900', 'bg-cyan-900', 'bg-red-900', 'bg-slate-600',
];

export default function BuildingScreen() {
  const { extractedData, activeSlides, setJob, setFile, setStep, setGenerationStartTime } = useAppStore();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('queued');
  const [error, setError] = useState('');
  const pollRef = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setGenerationStartTime(Date.now());
    startGeneration();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startGeneration = async () => {
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: extractedData, activeSlides }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to start generation');
      setJob(json.jobId);
      pollStatus(json.jobId);
    } catch (err) {
      setError(err.message);
      setStatus('failed');
    }
  };

  const pollStatus = (id) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${id}`);
        const json = await res.json();

        setProgress(json.progress || 0);
        setStatus(json.status);

        if (json.status === 'complete' && json.fileUrl) {
          clearInterval(pollRef.current);
          setFile(json.fileUrl);
          setStep('done');
        } else if (json.status === 'failed') {
          clearInterval(pollRef.current);
          setError(json.error || 'Generation failed');
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, 1500);
  };

  const slidesBuilt = Math.floor((progress / 100) * activeSlides.filter(Boolean).length);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">Building Your Presentation</h2>
          <p className="text-slate-400 text-sm">
            {status === 'queued' && 'Waiting in queue...'}
            {status === 'processing' && `Generating slides... ${progress}% complete`}
            {status === 'complete' && 'Finalizing...'}
            {status === 'failed' && 'Generation failed'}
          </p>
        </div>

        {/* Progress bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-400">Progress</span>
            <span className="text-sm font-mono text-white">{progress}%</span>
          </div>
          <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Slide thumbnails */}
        <div className="grid grid-cols-6 gap-2">
          {SLIDE_TITLES.map((title, i) => {
            const isActive = activeSlides[i];
            const isBuilt = isActive && i < slidesBuilt;
            const isBuilding = isActive && i === slidesBuilt && status === 'processing';

            return (
              <div
                key={i}
                className={`rounded-lg overflow-hidden border transition-all ${
                  !isActive
                    ? 'border-slate-800 opacity-30'
                    : isBuilt
                    ? 'border-emerald-500/50'
                    : isBuilding
                    ? 'border-emerald-400 animate-pulse'
                    : 'border-slate-700'
                }`}
              >
                <div
                  className={`${SLIDE_COLORS[i]} h-14 flex items-end p-1.5 transition-opacity ${
                    isBuilt ? 'opacity-100' : 'opacity-30'
                  }`}
                >
                  {isBuilt && (
                    <span className="text-white/70 text-[8px] leading-tight">{title}</span>
                  )}
                </div>
                <div className="bg-slate-900 px-1.5 py-1">
                  <span className="text-slate-500 text-[9px]">{String(i + 1).padStart(2, '0')}</span>
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mt-6 bg-red-900/20 border border-red-800 rounded-xl p-4 text-red-400 text-sm text-center">
            {error}
            <button
              onClick={() => {
                setError('');
                setStatus('queued');
                setProgress(0);
                started.current = false;
                startGeneration();
              }}
              className="block mx-auto mt-2 text-xs underline hover:text-red-300"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
