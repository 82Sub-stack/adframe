import { useEffect, useState } from 'react';
import axios from 'axios';
import { Download, RefreshCw, Settings, AlertTriangle } from 'lucide-react';

export default function SettingsPanel() {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    axios.get('/api/settings', { signal: controller.signal })
      .then(res => setSettings(res.data.settings))
      .catch(err => { if (!axios.isCancel(err)) setError('Could not load service status.'); });
    return () => controller.abort();
  }, []);
  return (
    <div className="h-full overflow-y-auto bg-surface">
      <div className="max-w-3xl mx-auto px-8 py-8">
        <div className="flex items-center gap-2 text-text-muted text-xs uppercase tracking-wide font-semibold mb-1"><Settings size={14} /> Web Settings</div>
        <h1 className="text-2xl font-bold text-text-primary mb-6">AdFrame Settings</h1>
        {error && <div className="rounded-lg bg-red-50 p-4 text-red-700 flex gap-2 mb-5"><AlertTriangle size={16} />{error}</div>}
        <section className="bg-white border border-gray-200 rounded-lg p-5 mb-5">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-2"><Download size={16} /> Downloads</h2>
          <p className="text-sm text-text-muted">Use Download PNG on a generated mockup to save it through your browser. Your browser controls the download folder.</p>
        </section>
        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-3">Service status</h2>
          {!settings && !error ? <RefreshCw size={16} className="animate-spin" /> : settings && (
            <dl className="grid grid-cols-[140px_1fr] gap-3 text-sm">
              <dt className="text-text-muted">Version</dt><dd>{settings.appVersion}</dd>
              <dt className="text-text-muted">Publisher selection</dt><dd>{settings.suggestionSource === 'curated' ? 'Curated German publishers' : 'Publisher discovery'}</dd>
            </dl>
          )}
        </section>
      </div>
    </div>
  );
}
