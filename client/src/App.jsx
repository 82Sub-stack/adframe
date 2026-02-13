import { useState } from 'react';
import { LayoutDashboard } from 'lucide-react';
import InputPanel from './components/InputPanel';
import PreviewPanel from './components/PreviewPanel';

export default function App() {
  const [mockupResult, setMockupResult] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState('');
  const [error, setError] = useState(null);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-14 bg-navy flex flex-col items-center py-4 shrink-0">
        <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center mb-6">
          <LayoutDashboard size={20} className="text-white" />
        </div>
        <div className="writing-mode-vertical text-text-muted text-[10px] tracking-[0.2em] uppercase font-medium mt-2"
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
          AdFrame
        </div>
      </aside>

      {/* Main Content */}
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
            isGenerating={isGenerating}
            progressStep={progressStep}
            error={error}
          />
        </div>
      </div>
    </div>
  );
}
