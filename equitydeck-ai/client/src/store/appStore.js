import { create } from 'zustand';

const useAppStore = create((set, get) => ({
  // State
  step: 'input', // 'input' | 'researching' | 'review' | 'customize' | 'building' | 'done'
  mode: 'search', // 'search' | 'upload'
  company: { name: '', ticker: '', exchange: 'TASI' },
  researchText: '',
  extractedData: null,
  branding: { primary: '', secondary: '', accent: '' },
  activeSlides: Array(12).fill(true),
  jobId: null,
  fileUrl: null,
  generationStartTime: null,

  // Actions
  setStep: (step) => set({ step }),
  setMode: (mode) => set({ mode }),
  setCompany: (company) => set({ company: { ...get().company, ...company } }),
  appendResearchText: (chunk) => set((state) => ({ researchText: state.researchText + chunk })),
  setResearchText: (text) => set({ researchText: text }),
  setExtractedData: (data) => set({ extractedData: data }),
  setBranding: (branding) => set({ branding: { ...get().branding, ...branding } }),
  toggleSlide: (index) =>
    set((state) => {
      const activeSlides = [...state.activeSlides];
      const activeCount = activeSlides.filter(Boolean).length;
      // Minimum 3 slides must remain active
      if (activeSlides[index] && activeCount <= 3) return {};
      activeSlides[index] = !activeSlides[index];
      return { activeSlides };
    }),
  setAllSlides: (value) => set({ activeSlides: Array(12).fill(value) }),
  setJob: (jobId) => set({ jobId }),
  setFile: (fileUrl) => set({ fileUrl }),
  setGenerationStartTime: (t) => set({ generationStartTime: t }),

  // Reset
  reset: () =>
    set({
      step: 'input',
      mode: 'search',
      company: { name: '', ticker: '', exchange: 'TASI' },
      researchText: '',
      extractedData: null,
      branding: { primary: '', secondary: '', accent: '' },
      activeSlides: Array(12).fill(true),
      jobId: null,
      fileUrl: null,
      generationStartTime: null,
    }),
}));

export default useAppStore;
