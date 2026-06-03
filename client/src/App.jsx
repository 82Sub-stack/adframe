import { useState } from 'react';
import { LayoutDashboard, Settings } from 'lucide-react';
import InputPanel from './components/InputPanel';
import PreviewPanel from './components/PreviewPanel';
import SettingsPanel from './components/SettingsPanel';

export default function App() {
  const [activeView, setActiveView] = useState('mockup');
  const [mockupResult, setMockupResult] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState('');
  const [error, setError] = useState(null);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-14 bg-navy flex flex-col items-center py-4 shrink-0">
        <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center mb-5">
          <LayoutDashboard size={20} className="text-white" />
        </div>
        <div className="flex flex-col gap-2 mb-5">
          <button
            type="button"
            onClick={() => setActiveView('mockup')}
            title="Mockups"
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
              activeView === 'mockup'
                ? 'bg-white/15 text-white'
                : 'text-text-muted hover:bg-white/10 hover:text-white'
            }`}
          >
            <LayoutDashboard size={18} />
          </button>
          <button
            type="button"
            onClick={() => setActiveView('settings')}
            title="Settings"
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
              activeView === 'settings'
                ? 'bg-white/15 text-white'
                : 'text-text-muted hover:bg-white/10 hover:text-white'
            }`}
          >
            <Settings size={18} />
          </button>
        </div>
        <div className="writing-mode-vertical text-text-muted text-[10px] tracking-[0.2em] uppercase font-medium mt-2"
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
          AdFrame
        </div>
      </aside>

      {activeView === 'settings' ? (
        <div className="flex-1 overflow-hidden">
          <SettingsPanel />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Input Panel */}
          <div className="w-[380px] bg-white border-r border-gray-200 overflow-y-auto shrink-0">
            <InputPanel
              onResult={setMockupResult}
              onGenerating={setIsGenerating}
              onProgress={setProgressStep}
              onError={setError}
            />
          </div>

          {/* Preview Panel */}
          <div className="flex-1 bg-surface overflow-y-auto">
            <PreviewPanel
              result={mockupResult}
              onResultChange={setMockupResult}
              isGenerating={isGenerating}
              progressStep={progressStep}
              error={error}
            />
          </div>
        </div>
      )}
    </div>
  );
}
