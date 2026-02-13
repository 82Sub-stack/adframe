import { Loader2, Globe, Shield, Layers, ImagePlus, Check } from 'lucide-react';

const STEPS = [
  { key: 'selecting', label: 'Selecting website...', icon: Globe },
  { key: 'loading', label: 'Loading page...', icon: Globe },
  { key: 'consent', label: 'Handling consent banners...', icon: Shield },
  { key: 'scrolling', label: 'Scrolling page...', icon: Layers },
  { key: 'screenshot', label: 'Taking screenshot...', icon: ImagePlus },
  { key: 'injecting', label: 'Injecting ad creative...', icon: Layers },
  { key: 'compositing', label: 'Generating mockup...', icon: ImagePlus },
];

function getActiveIndex(progressStep) {
  if (!progressStep) return 0;
  const step = progressStep.toLowerCase();
  if (step.includes('selecting')) return 0;
  if (step.includes('loading')) return 1;
  if (step.includes('consent') || step.includes('handling')) return 2;
  if (step.includes('scroll')) return 3;
  if (step.includes('screenshot') || step.includes('taking')) return 4;
  if (step.includes('inject')) return 5;
  if (step.includes('generat') || step.includes('composit')) return 6;
  return 0;
}

export default function ProgressLoader({ progressStep }) {
  const activeIdx = getActiveIndex(progressStep);

  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-8">
          <Loader2 size={32} className="text-accent animate-spin" />
        </div>
        <h3 className="text-lg font-semibold text-text-primary text-center mb-6">
          Generating your mockup
        </h3>
        <div className="space-y-3">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = idx === activeIdx;
            const isDone = idx < activeIdx;

            return (
              <div
                key={step.key}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all ${
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : isDone
                    ? 'text-green-600'
                    : 'text-text-muted'
                }`}
              >
                {isDone ? (
                  <Check size={16} className="shrink-0" />
                ) : isActive ? (
                  <Loader2 size={16} className="shrink-0 animate-spin" />
                ) : (
                  <Icon size={16} className="shrink-0 opacity-40" />
                )}
                <span className={`text-sm ${isActive ? 'font-medium' : ''}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
