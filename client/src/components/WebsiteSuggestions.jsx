import { Globe, ExternalLink, AlertCircle, CheckCircle2, AlertTriangle, XCircle, Gauge } from 'lucide-react';

function getStatusInfo(preflight) {
  if (!preflight) {
    return {
      label: 'Not scored',
      Icon: Gauge,
      className: 'bg-gray-100 text-text-muted',
    };
  }

  if (preflight.status === 'failed') {
    return {
      label: 'Failed preflight',
      Icon: XCircle,
      className: 'bg-red-100 text-red-700',
    };
  }

  if (preflight.status === 'warning' || preflight.confidence === 'low') {
    return {
      label: 'Use with caution',
      Icon: AlertTriangle,
      className: 'bg-yellow-100 text-yellow-800',
    };
  }

  return {
    label: preflight.confidence === 'high' ? 'Strong candidate' : 'Good candidate',
    Icon: CheckCircle2,
    className: 'bg-emerald-100 text-emerald-700',
  };
}

function getSignalChips(preflight) {
  if (!preflight) return [];
  const chips = [];

  if (preflight.adSlotLikely) chips.push('Ad signals');
  if (preflight.adSizeCompatible) chips.push('Size match');
  if (preflight.mobileReady) chips.push('Mobile ready');
  if (preflight.topicScore >= 10) chips.push('Topic match');
  if (preflight.paywallRisk) chips.push('Paywall risk');

  return chips.slice(0, 4);
}

export default function WebsiteSuggestions({ suggestions, loading, error, selectedUrls = [], onToggle }) {
  if (loading) {
    return (
      <div className="mt-4">
        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
          Ranked Websites
        </label>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
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
        Ranked Websites (select up to 5)
      </label>
      <div className="space-y-2">
        {suggestions.map((site, idx) => {
          const preflight = site.preflight;
          const selected = selectedUrls.includes(site.url);
          const statusInfo = getStatusInfo(preflight);
          const StatusIcon = statusInfo.Icon;
          const chips = getSignalChips(preflight);

          return (
            <button
              key={site.url || idx}
              type="button"
              onClick={() => onToggle(site.url)}
              className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                selected
                  ? 'border-accent bg-accent/5 ring-1 ring-accent/20'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              } ${preflight?.status === 'failed' ? 'opacity-75' : ''}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                selected ? 'bg-accent text-white' : 'bg-gray-100 text-text-muted'
              }`}>
                <Globe size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-medium text-text-primary truncate">{site.name}</span>
                      <ExternalLink size={12} className="text-text-muted shrink-0" />
                    </div>
                    <div className="text-xs text-text-muted truncate">{site.url}</div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-text-primary text-xs shrink-0">
                    <Gauge size={11} />
                    {preflight?.score ?? 0}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${statusInfo.className}`}>
                    <StatusIcon size={11} />
                    {statusInfo.label}
                  </span>
                  {chips.map((chip) => (
                    <span key={chip} className="inline-flex px-2 py-0.5 rounded-full bg-gray-100 text-text-muted text-xs">
                      {chip}
                    </span>
                  ))}
                </div>

                <div className="text-xs text-text-muted mt-1.5 leading-relaxed">{site.reason}</div>
                {Array.isArray(preflight?.warnings) && preflight.warnings.length > 0 && (
                  <div className="text-xs text-yellow-800 mt-1">
                    {preflight.warnings.slice(0, 2).join(' | ')}
                  </div>
                )}
              </div>
              <input
                type="checkbox"
                checked={selected}
                readOnly
                className="mt-1"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
