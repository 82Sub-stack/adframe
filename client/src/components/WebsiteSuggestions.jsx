import { Globe, Loader2, ExternalLink, AlertCircle } from 'lucide-react';

export default function WebsiteSuggestions({ suggestions, loading, error, selectedUrl, onSelect }) {
  if (loading) {
    return (
      <div className="mt-4">
        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
          Suggested Websites
        </label>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-gray-200" />
              <div className="flex-1">
                <div className="h-3.5 w-32 bg-gray-200 rounded mb-1.5" />
                <div className="h-2.5 w-48 bg-gray-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="mt-4">
      <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
        Suggested Websites
      </label>
      <div className="space-y-2">
        {suggestions.map((site, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onSelect(site.url)}
            className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
              selectedUrl === site.url
                ? 'border-accent bg-accent/5 ring-1 ring-accent/20'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              selectedUrl === site.url ? 'bg-accent text-white' : 'bg-gray-100 text-text-muted'
            }`}>
              <Globe size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-text-primary truncate">{site.name}</span>
                <ExternalLink size={12} className="text-text-muted shrink-0" />
              </div>
              <div className="text-xs text-text-muted truncate">{site.url}</div>
              <div className="text-xs text-text-muted mt-0.5 leading-relaxed">{site.reason}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
