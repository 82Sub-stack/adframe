import { useEffect, useState } from 'react';
import { Download, FileCode, ExternalLink, AlertTriangle, ImageIcon } from 'lucide-react';
import ProgressLoader from './ProgressLoader';
import DeviceFrame from './DeviceFrame';

function getPlacementMethodInfo(method) {
  switch (method) {
    case 'dom-injected':
      return {
        label: 'DOM Injected',
        className: 'bg-emerald-100 text-emerald-700',
      };
    case 'detected':
      return {
        label: 'Overlay (Detected Slot)',
        className: 'bg-amber-100 text-amber-700',
      };
    case 'heuristic':
      return {
        label: 'Overlay (Heuristic)',
        className: 'bg-amber-100 text-amber-700',
      };
    default:
      return {
        label: 'Placement Applied',
        className: 'bg-gray-200 text-text-primary',
      };
  }
}

export default function PreviewPanel({ result, isGenerating, progressStep, error }) {
  const mockups = Array.isArray(result) ? result : result ? [result] : [];
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [result]);

  if (isGenerating) {
    return <ProgressLoader progressStep={progressStep} />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-8">
        <div className="w-full max-w-md text-center">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={24} className="text-red-500" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">Generation Failed</h3>
          <p className="text-sm text-text-muted leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }

  if (mockups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-5">
            <ImageIcon size={28} className="text-text-muted" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">No Mockup Yet</h3>
          <p className="text-sm text-text-muted leading-relaxed">
            Enter a topic, choose one or two websites, upload your ad creative, and generate mockups to see them here.
          </p>
        </div>
      </div>
    );
  }

  const safeIndex = Math.max(0, Math.min(activeIndex, mockups.length - 1));
  const current = mockups[safeIndex];
  const { mockupImageUrl, adTagDownloadUrl, metadata } = current;
  const isMobile = metadata.device === 'mobile';
  const previewUrl = `${mockupImageUrl}/preview`;
  const methodInfo = getPlacementMethodInfo(metadata.placement?.method);

  return (
    <div className="p-6">
      {mockups.length > 1 && (
        <div className="mb-4">
          <div className="text-xs text-text-muted mb-2">Generated Mockups ({mockups.length})</div>
          <div className="flex gap-2 flex-wrap">
            {mockups.map((item, idx) => (
              <button
                key={item.mockupId || idx}
                type="button"
                onClick={() => setActiveIndex(idx)}
                className={`px-3 py-1.5 rounded-lg border text-xs ${
                  safeIndex === idx
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-gray-200 text-text-primary hover:bg-gray-50'
                }`}
              >
                Site {idx + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-text-primary">Mockup Preview</h2>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-navy text-white text-xs font-medium">
              {metadata.adSizeName}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-200 text-text-primary text-xs">
              {metadata.adSize}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-200 text-text-primary text-xs capitalize">
              {metadata.device}
            </span>
            {metadata.consentHandled && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs">
                Consent handled
              </span>
            )}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${methodInfo.className}`}>
              {methodInfo.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-text-muted">
            <ExternalLink size={11} />
            <a
              href={metadata.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent transition-colors"
            >
              {metadata.websiteUrl}
            </a>
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          <a
            href={mockupImageUrl}
            download
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            <Download size={15} />
            Download PNG
          </a>
          {adTagDownloadUrl && (
            <a
              href={adTagDownloadUrl}
              download
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-text-primary text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <FileCode size={15} />
              Ad Tag
            </a>
          )}
        </div>
      </div>

      <div className="flex justify-center">
        {isMobile ? (
          <DeviceFrame>
            <img
              src={previewUrl}
              alt="Ad placement mockup"
              className="w-full"
              style={{ imageRendering: 'auto' }}
            />
          </DeviceFrame>
        ) : (
          <div className="rounded-lg overflow-hidden shadow-lg border border-gray-200 bg-white">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 border-b border-gray-200">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
              </div>
              <div className="flex-1 ml-2">
                <div className="px-3 py-1 rounded bg-white text-xs text-text-muted truncate border border-gray-200 max-w-md">
                  {metadata.websiteUrl}
                </div>
              </div>
            </div>
            <img
              src={previewUrl}
              alt="Ad placement mockup"
              className="w-full"
              style={{ maxHeight: '70vh', objectFit: 'contain', imageRendering: 'auto' }}
            />
          </div>
        )}
      </div>

      <div className="mt-4 p-3 rounded-lg bg-white border border-gray-200 text-xs text-text-muted">
        <span className="font-medium text-text-primary">Placement:</span>{' '}
        {metadata.placement.adSizeName} ({metadata.adSize}) at position ({metadata.placement.x}, {metadata.placement.y}) via {methodInfo.label}
        {metadata.placement.domInjectionFallbackReason && (
          <span> · DOM fallback reason: {metadata.placement.domInjectionFallbackReason}</span>
        )}
      </div>
    </div>
  );
}
