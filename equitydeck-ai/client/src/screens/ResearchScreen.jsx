import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import useAppStore from '../store/appStore';

export default function ResearchScreen() {
  const { company, researchText, appendResearchText, setResearchText, setExtractedData, setStep } = useAppStore();
  const [streaming, setStreaming] = useState(true);
  const [error, setError] = useState('');
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [revising, setRevising] = useState(false);
  const [searchQueries, setSearchQueries] = useState([]);
  const scrollRef = useRef();
  const abortRef = useRef(null);

  useEffect(() => {
    setResearchText('');
    startStream();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [researchText]);

  const startStream = () => {
    const controller = new AbortController();
    abortRef.current = controller;

    fetch('/api/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName: company.name, ticker: company.ticker }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Research failed');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));

              if (event.type === 'status') {
                // Parse search queries from status messages
                const match = event.message.match(/searching.*?["']([^"']+)["']/i);
                if (match) {
                  setSearchQueries((prev) => [...prev.slice(-9), match[1]]);
                }
              } else if (event.type === 'text') {
                appendResearchText(event.chunk);

                // Extract search queries from stream text
                const searchMatch = event.chunk.match(/Searching for:\s*(.+)/i);
                if (searchMatch) {
                  setSearchQueries((prev) => [...prev.slice(-9), searchMatch[1].trim()]);
                }
              } else if (event.type === 'complete') {
                setExtractedData(event.data);
                setStreaming(false);
              } else if (event.type === 'error') {
                setError(event.message);
                setStreaming(false);
              }
            } catch {
              // Skip malformed events
            }
          }
        }
        setStreaming(false);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message);
          setStreaming(false);
        }
      });
  };

  const handleRevise = async () => {
    if (!feedback.trim()) return;
    setRevising(true);
    try {
      const res = await fetch('/api/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentReport: researchText, feedback }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setResearchText(json.revisedReport);
      if (json.data) setExtractedData(json.data);
      setShowReviseModal(false);
      setFeedback('');
    } catch (err) {
      setError(err.message);
    } finally {
      setRevising(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex gap-4 p-4">
      {/* Sidebar */}
      <div className="w-56 flex-shrink-0 space-y-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3">
            Researching
          </p>
          <p className="text-white font-semibold text-sm">{company.name}</p>
          <p className="text-slate-400 text-xs font-mono">{company.ticker} · {company.exchange}</p>
          {streaming && (
            <div className="mt-3 flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-slate-400 text-xs">Live research</span>
            </div>
          )}
        </div>

        {searchQueries.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Web Searches
            </p>
            <div className="space-y-1.5">
              {searchQueries.map((q, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="text-emerald-400 text-xs mt-0.5">→</span>
                  <span className="text-slate-300 text-xs">{q}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main panel */}
      <div className="flex-1 flex flex-col">
        <div className="bg-slate-900 border border-slate-800 rounded-xl flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/40" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/40" />
              <div className="w-3 h-3 rounded-full bg-green-500/40" />
            </div>
            <span className="text-slate-400 text-xs font-mono">equity_research_{company.ticker}.md</span>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-6 font-mono text-sm"
          >
            {error ? (
              <div className="text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-4">
                Error: {error}
              </div>
            ) : (
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{researchText}</ReactMarkdown>
                {streaming && (
                  <span className="inline-block w-2 h-4 bg-emerald-400 animate-pulse ml-0.5 align-middle" />
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          {!streaming && !error && researchText && (
            <div className="border-t border-slate-800 p-4 flex gap-3">
              <button
                onClick={() => setStep('customize')}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl transition-all text-sm"
              >
                ✓ Accept & Build Presentation
              </button>
              <button
                onClick={() => setShowReviseModal(true)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 rounded-xl transition-all text-sm"
              >
                ✎ Request Changes
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Revise Modal */}
      {showReviseModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg">
            <h3 className="text-white font-semibold text-lg mb-2">Request Changes</h3>
            <p className="text-slate-400 text-sm mb-4">
              Describe what should be changed or added to the report.
            </p>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="e.g. Add more detail on the government contracts segment and update the risk section..."
              rows={5}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowReviseModal(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2.5 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleRevise}
                disabled={revising || !feedback.trim()}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-all"
              >
                {revising ? 'Revising...' : 'Revise Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
