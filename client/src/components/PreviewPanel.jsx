import { Download, FileCode, ExternalLink, AlertTriangle, ImageIcon, RefreshCw } from 'lucide-react';
import ProgressLoader from './ProgressLoader';
import DeviceFrame from './DeviceFrame';

export default function PreviewPanel({ result, isGenerating, progressStep, error }) {
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

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-5">
            <ImageIcon size={28} className="text-text-muted" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">No Mockup Yet</h3>
          <p className="text-sm text-text-muted leading-relaxed">
            Select a topic and country, choose a website, upload your ad creative, and generate a mockup to see it here.
          </p>
        </div>
      </div>
    );
  }

  const { mockupImageUrl, adTagDownloadUrl, metadata } = result;
  const isMobile = metadata.device === 'mobile';
  const previewUrl = `${mockupImageUrl}/preview`;

  return (
    <div className="p-6">
      {/* Header with metadata */}
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

        {/* Download buttons */}
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

      {/* Mockup image */}
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
            {/* Browser chrome */}
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

      {/* Placement info */}
      <div className="mt-4 p-3 rounded-lg bg-white border border-gray-200 text-xs text-text-muted">
        <span className="font-medium text-text-primary">Placement:</span>{' '}
        {metadata.placement.adSizeName} ({metadata.adSize}) at position ({metadata.placement.x}, {metadata.placement.y})
      </div>
    </div>
  );
}
