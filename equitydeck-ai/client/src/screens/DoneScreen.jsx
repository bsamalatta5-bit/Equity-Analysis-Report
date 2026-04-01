import { useEffect, useState } from 'react';
import useAppStore from '../store/appStore';

export default function DoneScreen() {
  const { fileUrl, company, activeSlides, generationStartTime, reset } = useAppStore();
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (generationStartTime) {
      const secs = Math.round((Date.now() - generationStartTime) / 1000);
      setElapsed(secs < 60 ? `${secs}s` : `${Math.round(secs / 60)}m ${secs % 60}s`);
    }
  }, []);

  const activeCount = activeSlides.filter(Boolean).length;

  const handleDownload = () => {
    const url = `${fileUrl}?company=${encodeURIComponent(company.name || 'Company')}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `EquityDeck_${company.name || 'Company'}.pptx`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-lg text-center">
        {/* Success animation */}
        <div className="relative inline-block mb-8">
          <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
            <div className="w-16 h-16 bg-emerald-500/30 rounded-full flex items-center justify-center">
              <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center">
                <span className="text-white text-2xl">✓</span>
              </div>
            </div>
          </div>
        </div>

        <h2 className="text-3xl font-bold text-white mb-2">Presentation Ready!</h2>
        <p className="text-slate-400 mb-8">Your equity research deck has been generated successfully.</p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-white font-mono">{activeCount}</div>
            <div className="text-xs text-slate-400 mt-1">Slides Generated</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-white font-mono truncate">{company.ticker || 'N/A'}</div>
            <div className="text-xs text-slate-400 mt-1">{company.exchange}</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-white font-mono">{elapsed || '–'}</div>
            <div className="text-xs text-slate-400 mt-1">Generation Time</div>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleDownload}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-4 rounded-2xl transition-all text-base flex items-center justify-center gap-2"
          >
            <span>↓</span> Download Presentation (.pptx)
          </button>
          <button
            onClick={reset}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3.5 rounded-2xl transition-all text-sm border border-slate-700"
          >
            Start New Research
          </button>
        </div>

        <p className="text-slate-600 text-xs mt-6">
          {company.name} · {company.exchange} · EquityDeck AI
        </p>
      </div>
    </div>
  );
}
