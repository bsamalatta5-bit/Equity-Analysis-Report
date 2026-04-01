import { useState } from 'react';
import useAppStore from '../store/appStore';

const SLIDE_TITLES = [
  'Title Slide',
  'Executive Summary',
  'Business Overview',
  'Product Portfolio',
  'Revenue Model',
  'Financial Highlights',
  'Margins & Profitability',
  'Economic Moat',
  'Growth Drivers',
  'Capital Structure',
  'Key Risks',
  'Investment Thesis',
];

const PRESET_PALETTES = [
  { name: 'Finance', primary: '1D7A5F', secondary: '0A1628', accent: 'F59E0B' },
  { name: 'Tech Blue', primary: '0070C0', secondary: '003366', accent: '00A0E0' },
  { name: 'Royal', primary: '6B21A8', secondary: '1E1B4B', accent: 'A855F7' },
  { name: 'Emerald', primary: '059669', secondary: '064E3B', accent: '34D399' },
  { name: 'Gold', primary: 'B7791F', secondary: '78350F', accent: 'F59E0B' },
];

export default function CustomizeScreen() {
  const {
    branding, setBranding, activeSlides, toggleSlide, setAllSlides,
    extractedData, setExtractedData, setStep, company,
  } = useAppStore();

  const [openSection, setOpenSection] = useState(null);

  const applyPreset = (preset) => {
    setBranding({ primary: '#' + preset.primary, secondary: '#' + preset.secondary, accent: '#' + preset.accent });
  };

  const autoDetect = () => {
    const name = (company.name || '').toLowerCase();
    const detected = PRESET_PALETTES.find((p) =>
      name.includes('tech') ? p.name === 'Tech Blue' :
      name.includes('bank') || name.includes('finance') ? p.name === 'Finance' : null
    ) || PRESET_PALETTES[0];
    applyPreset(detected);
  };

  const updateField = (path, value) => {
    if (!extractedData) return;
    const clone = JSON.parse(JSON.stringify(extractedData));
    const keys = path.split('.');
    let obj = clone;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = value;
    setExtractedData(clone);
  };

  const activeCount = activeSlides.filter(Boolean).length;

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-white mb-1">Customize Your Deck</h2>
        <p className="text-slate-400 text-sm mb-8">
          Adjust branding, choose slides, and review extracted data before generating.
        </p>

        <div className="grid grid-cols-5 gap-6">
          {/* Left panel — Branding */}
          <div className="col-span-2 space-y-5">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4">Brand Colors</h3>

              {[
                { key: 'primary', label: 'Primary Color' },
                { key: 'secondary', label: 'Secondary Color' },
                { key: 'accent', label: 'Accent Color' },
              ].map(({ key, label }) => (
                <div key={key} className="mb-3">
                  <label className="text-xs text-slate-400 font-medium uppercase tracking-wide block mb-1.5">
                    {label}
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={branding[key] || '#10B981'}
                      onChange={(e) => setBranding({ [key]: e.target.value })}
                      className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent"
                    />
                    <input
                      type="text"
                      value={branding[key] || ''}
                      onChange={(e) => setBranding({ [key]: e.target.value })}
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-emerald-500"
                      placeholder="#10B981"
                    />
                  </div>
                </div>
              ))}

              <div className="mt-5">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Presets</p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_PALETTES.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => applyPreset(p)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs text-white transition-all"
                    >
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#' + p.primary }} />
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={autoDetect}
                className="mt-4 w-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm py-2 rounded-lg transition-all border border-slate-700"
              >
                Auto-detect from company
              </button>
            </div>
          </div>

          {/* Right panel — Slides */}
          <div className="col-span-3">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold">Slides ({activeCount}/12 selected)</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAllSlides(true)}
                    className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    All
                  </button>
                  <span className="text-slate-600">·</span>
                  <button
                    onClick={() => setAllSlides(false)}
                    className="text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    None
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SLIDE_TITLES.map((title, i) => (
                  <button
                    key={i}
                    onClick={() => toggleSlide(i)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                      activeSlides[i]
                        ? 'bg-emerald-900/30 border-emerald-700/50 text-white'
                        : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center text-xs flex-shrink-0 ${
                        activeSlides[i] ? 'bg-emerald-500' : 'bg-slate-700'
                      }`}
                    >
                      {activeSlides[i] ? '✓' : ''}
                    </div>
                    <span className="text-xs font-medium">{String(i + 1).padStart(2, '0')} {title}</span>
                  </button>
                ))}
              </div>
              {activeCount < 3 && (
                <p className="mt-2 text-xs text-amber-400 text-center">Minimum 3 slides required</p>
              )}
            </div>
          </div>
        </div>

        {/* Data Review Accordion */}
        {extractedData && (
          <div className="mt-6 bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h3 className="text-white font-semibold mb-4">Data Review</h3>
            <div className="space-y-2">
              {[
                {
                  key: 'company',
                  label: 'Company Info',
                  fields: ['name', 'ticker', 'exchange', 'sector', 'founded', 'hq', 'employees'],
                },
                {
                  key: 'financials.current',
                  label: 'Current Financials',
                  fields: ['year', 'revenue', 'grossProfit', 'ebit', 'netProfit', 'grossMargin', 'ebitMargin', 'netMargin'],
                },
                {
                  key: 'executiveSummary',
                  label: 'Executive Summary',
                  fields: ['tagline', 'thesis'],
                },
              ].map(({ key, label, fields }) => {
                const isOpen = openSection === key;
                const obj = key.includes('.')
                  ? key.split('.').reduce((o, k) => o?.[k], extractedData)
                  : extractedData[key];

                return (
                  <div key={key} className="border border-slate-800 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setOpenSection(isOpen ? null : key)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800 transition-colors text-left"
                    >
                      <span className="text-sm font-medium text-white">{label}</span>
                      <span className="text-slate-400">{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOpen && obj && (
                      <div className="p-4 grid grid-cols-2 gap-3">
                        {fields.map((field) => (
                          <div key={field}>
                            <label className="text-xs text-slate-400 uppercase tracking-wide block mb-1">
                              {field}
                            </label>
                            <input
                              type="text"
                              defaultValue={obj[field] ?? ''}
                              onBlur={(e) => updateField(`${key}.${field}`, e.target.value)}
                              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={() => setStep('building')}
          disabled={activeCount < 3}
          className="mt-6 w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-2xl transition-all text-base"
        >
          Generate Presentation ({activeCount} slides)
        </button>
      </div>
    </div>
  );
}
