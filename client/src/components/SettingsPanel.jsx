import { useEffect, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, FolderOpen, KeyRound, RefreshCw, Save, Settings, AlertTriangle } from 'lucide-react';

function getDesktopApi() {
  return window.adframeDesktop || null;
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [outputDir, setOutputDir] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/settings');
      const nextSettings = res.data.settings;
      setSettings(nextSettings);
      setOutputDir(nextSettings.outputDir || '');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const chooseOutputDir = async () => {
    const desktopApi = getDesktopApi();
    if (!desktopApi?.selectOutputDirectory) {
      setError('Folder selection is only available in the desktop app.');
      return;
    }

    const selectedDir = await desktopApi.selectOutputDirectory();
    if (selectedDir) {
      setOutputDir(selectedDir);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const payload = { outputDir };
      if (apiKeyInput.trim()) {
        payload.geminiApiKey = apiKeyInput.trim();
      }

      const res = await axios.put('/api/settings', payload);
      setSettings(res.data.settings);
      setOutputDir(res.data.settings.outputDir || '');
      setApiKeyInput('');
      setMessage('Settings saved');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const clearApiKey = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const res = await axios.put('/api/settings', { geminiApiKey: '' });
      setSettings(res.data.settings);
      setApiKeyInput('');
      setMessage('Gemini API key cleared');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to clear API key.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-2 text-text-muted text-sm">
          <RefreshCw size={16} className="animate-spin" />
          Loading settings...
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-surface">
      <div className="max-w-3xl mx-auto px-8 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-text-muted text-xs uppercase tracking-wide font-semibold mb-1">
            <Settings size={14} />
            Desktop Settings
          </div>
          <h1 className="text-2xl font-bold text-text-primary">AdFrame Settings</h1>
        </div>

        {(error || message || settings?.warnings?.length > 0) && (
          <div className="space-y-2 mb-5">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-start gap-2">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 flex items-start gap-2">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                {message}
              </div>
            )}
            {settings?.warnings?.map((warning) => (
              <div key={warning} className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 flex items-start gap-2">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                {warning}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-6">
          <section className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                  <KeyRound size={16} />
                  Gemini API Key
                </h2>
                <p className="text-xs text-text-muted mt-1">
                  Status: {settings?.geminiApiKeyConfigured ? 'configured' : 'not configured'}
                </p>
              </div>
              {settings?.geminiApiKeyConfigured && (
                <button
                  type="button"
                  onClick={clearApiKey}
                  disabled={saving}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-text-primary text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  Clear Key
                </button>
              )}
            </div>

            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={settings?.geminiApiKeyConfigured ? 'Paste a new key to replace the current one' : 'Paste Gemini API key'}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20"
            />
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-4">
              <FolderOpen size={16} />
              Output Folder
            </h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={outputDir}
                onChange={(e) => setOutputDir(e.target.value)}
                className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20"
              />
              <button
                type="button"
                onClick={chooseOutputDir}
                className="px-3 py-2 rounded-lg border border-gray-300 text-text-primary text-sm hover:bg-gray-50"
              >
                Choose Folder
              </button>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-4">Diagnostics</h2>
            <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-text-muted">Version</dt>
              <dd className="text-text-primary">{settings?.appVersion || '1.0.0'}</dd>
              <dt className="text-text-muted">Platform</dt>
              <dd className="text-text-primary">{settings?.platform}</dd>
              <dt className="text-text-muted">Chromium</dt>
              <dd className="text-text-primary">{settings?.chromiumMode}</dd>
              <dt className="text-text-muted">Data Folder</dt>
              <dd className="text-text-primary break-all">{settings?.dataDir}</dd>
            </dl>
          </section>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveSettings}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
