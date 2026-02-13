import { Monitor, Smartphone } from 'lucide-react';

export default function DeviceToggle({ value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
        Device
      </label>
      <div className="flex rounded-lg border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => onChange('desktop')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all ${
            value === 'desktop'
              ? 'bg-navy text-white'
              : 'bg-white text-text-primary hover:bg-gray-50'
          }`}
        >
          <Monitor size={16} />
          Desktop
        </button>
        <button
          type="button"
          onClick={() => onChange('mobile')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all border-l border-gray-200 ${
            value === 'mobile'
              ? 'bg-navy text-white'
              : 'bg-white text-text-primary hover:bg-gray-50'
          }`}
        >
          <Smartphone size={16} />
          Mobile
        </button>
      </div>
    </div>
  );
}
