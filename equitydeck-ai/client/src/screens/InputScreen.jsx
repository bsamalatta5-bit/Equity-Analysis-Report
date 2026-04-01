import { useState, useRef } from 'react';
import useAppStore from '../store/appStore';

const EXCHANGES = ['TASI', 'Nomu'];

export default function InputScreen() {
  const { mode, company, setMode, setCompany, setStep, setExtractedData } = useAppStore();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef();

  const handleSearch = (e) => {
    e.preventDefault();
    if (!company.name.trim() || !company.ticker.trim()) return;
    setStep('researching');
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setUploadError('Only PDF files are accepted.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setUploadError('File exceeds the 25MB limit.');
      return;
    }

    setUploadError('');
    setUploading(true);
    const formData = new FormData();
    formData.append('report', file);

    try {
      const res = await fetch('/api/extract', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Extraction failed');
      setExtractedData(json.data);
      if (json.data?.company?.name) {
        setCompany({ name: json.data.company.name, ticker: json.data.company.ticker || '' });
      }
      setStep('customize');
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        {/* Logo / Title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">E</span>
            </div>
            <span className="text-2xl font-bold text-white">EquityDeck AI</span>
          </div>
          <p className="text-slate-400 text-sm">
            Professional equity research reports for Saudi stocks, powered by AI
          </p>
        </div>

        {/* Tabs */}
        <div className="flex bg-slate-900 rounded-xl p-1 mb-6 border border-slate-800">
          {[
            { id: 'search', label: 'Search Company' },
            { id: 'upload', label: 'Upload PDF Report' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === tab.id
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {mode === 'search' ? (
          <form
            onSubmit={handleSearch}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Company Name
              </label>
              <input
                type="text"
                placeholder="e.g. Elm Company"
                value={company.name}
                onChange={(e) => setCompany({ name: e.target.value })}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Ticker Symbol
                </label>
                <input
                  type="text"
                  placeholder="e.g. 7203"
                  value={company.ticker}
                  onChange={(e) => setCompany({ ticker: e.target.value })}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                />
              </div>
              <div className="w-36">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Exchange
                </label>
                <select
                  value={company.exchange}
                  onChange={(e) => setCompany({ exchange: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                >
                  {EXCHANGES.map((ex) => (
                    <option key={ex}>{ex}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3.5 rounded-xl transition-all"
            >
              Start Research
            </button>
          </form>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                dragging
                  ? 'border-emerald-400 bg-emerald-500/10'
                  : 'border-slate-700 hover:border-slate-500'
              } ${uploading ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => handleFile(e.target.files[0])}
              />
              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-slate-300 text-sm">Extracting data from PDF...</span>
                </div>
              ) : (
                <>
                  <div className="text-4xl mb-3">📄</div>
                  <p className="text-white font-medium mb-1">Drop your PDF here</p>
                  <p className="text-slate-400 text-sm">or click to browse</p>
                  <p className="text-slate-500 text-xs mt-3">Max 25MB · PDF only</p>
                </>
              )}
            </div>
            {uploadError && (
              <p className="mt-3 text-red-400 text-sm text-center">{uploadError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
