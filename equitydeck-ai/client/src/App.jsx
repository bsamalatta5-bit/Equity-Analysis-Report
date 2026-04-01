import useAppStore from './store/appStore';
import InputScreen from './screens/InputScreen';
import ResearchScreen from './screens/ResearchScreen';
import CustomizeScreen from './screens/CustomizeScreen';
import BuildingScreen from './screens/BuildingScreen';
import DoneScreen from './screens/DoneScreen';

function Header() {
  const { step, company, reset } = useAppStore();
  const showCompany = step !== 'input' && company.name;

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-slate-950/90 backdrop-blur border-b border-slate-800/50 h-12 flex items-center px-5">
      <button
        onClick={reset}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <div className="w-6 h-6 bg-emerald-500 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-xs">E</span>
        </div>
        <span className="text-white font-semibold text-sm">EquityDeck AI</span>
      </button>

      {showCompany && (
        <div className="ml-4 flex items-center gap-2">
          <span className="text-slate-600">·</span>
          <span className="text-slate-300 text-sm">{company.name}</span>
          {company.ticker && (
            <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono">
              {company.ticker}
            </span>
          )}
        </div>
      )}

      <div className="ml-auto">
        <StepIndicator />
      </div>
    </header>
  );
}

function StepIndicator() {
  const { step } = useAppStore();
  const steps = ['input', 'researching', 'customize', 'building', 'done'];

  const currentIdx = steps.indexOf(step);

  return (
    <div className="hidden sm:flex items-center gap-1">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div
            className={`w-2 h-2 rounded-full transition-all ${
              i < currentIdx
                ? 'bg-emerald-500'
                : i === currentIdx
                ? 'bg-emerald-400 ring-2 ring-emerald-400/30'
                : 'bg-slate-700'
            }`}
          />
          {i < steps.length - 1 && (
            <div className={`w-4 h-px ${i < currentIdx ? 'bg-emerald-700' : 'bg-slate-800'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const step = useAppStore((s) => s.step);

  const renderScreen = () => {
    switch (step) {
      case 'input':       return <InputScreen />;
      case 'researching': return <ResearchScreen />;
      case 'review':      return <ResearchScreen />;
      case 'customize':   return <CustomizeScreen />;
      case 'building':    return <BuildingScreen />;
      case 'done':        return <DoneScreen />;
      default:            return <InputScreen />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <Header />
      <div className="pt-12">
        {renderScreen()}
      </div>
    </div>
  );
}
