import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
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
    case 'user-selected':
      return {
        label: 'User Selected',
        className: 'bg-sky-100 text-sky-700',
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

function shouldShowSlotPicker(mockup) {
  const slotCandidates = mockup?.slotCandidates || [];
  const alwaysShow = mockup?.clientOptions?.alwaysShowSlotPicker;
  if (alwaysShow) {
    return slotCandidates.length > 0;
  }
  if (slotCandidates.length <= 1) {
    return false;
  }
  return (slotCandidates[0]?.score || 0) <= 90;
}

function renderPreviewFrame({ isMobile, url, websiteUrl, alt }) {
  if (isMobile) {
    return (
      <DeviceFrame>
        <img
          src={url}
          alt={alt}
          className="w-full"
          style={{ imageRendering: 'auto' }}
        />
      </DeviceFrame>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden shadow-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 border-b border-gray-200">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 ml-2">
          <div className="px-3 py-1 rounded bg-white text-xs text-text-muted truncate border border-gray-200 max-w-md">
            {websiteUrl}
          </div>
        </div>
      </div>
      <img
        src={url}
        alt={alt}
        className="w-full"
        style={{ maxHeight: '70vh', objectFit: 'contain', imageRendering: 'auto' }}
      />
    </div>
  );
}

export default function PreviewPanel({ result, onResultChange, isGenerating, progressStep, error }) {
  const mockups = Array.isArray(result) ? result : result ? [result] : [];
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [showAnnotated, setShowAnnotated] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    setActiveIndex(0);
  }, [result]);

  const safeIndex = Math.max(0, Math.min(activeIndex, Math.max(mockups.length - 1, 0)));
  const current = mockups[safeIndex];
  const slotCandidates = current?.slotCandidates || [];
  const pickerVisible = shouldShowSlotPicker(current);

  useEffect(() => {
    setSelectedSlotId(current?.metadata?.placement?.slotId || slotCandidates[0]?.slotId || null);
    setShowAnnotated(shouldShowSlotPicker(current));
    setApplyError(null);
  }, [current?.mockupId, current?.metadata?.placement?.slotId, slotCandidates]);

  const currentPreviewUrl = current ? `${current.mockupImageUrl}/preview` : null;
  const annotatedPreviewUrl = current?.annotatedPreviewUrl || currentPreviewUrl;
  const previewUrl = pickerVisible && showAnnotated ? annotatedPreviewUrl : currentPreviewUrl;
  const methodInfo = current ? getPlacementMethodInfo(current.metadata?.placement?.method) : null;

  const selectedSlot = useMemo(
    () => slotCandidates.find((candidate) => candidate.slotId === selectedSlotId) || slotCandidates[0] || null,
    [slotCandidates, selectedSlotId]
  );

  const handleApplyPlacement = async () => {
    if (!current || !selectedSlotId) return;

    if (selectedSlotId === current.metadata?.placement?.slotId) {
      setShowAnnotated(false);
      return;
    }

    setIsApplying(true);
    setApplyError(null);

    try {
      const response = await axios.post(`/api/generate-mockup/${current.mockupId}/inject`, {
        slotId: selectedSlotId,
      });

      const nextMockup = {
        ...response.data,
        clientOptions: current.clientOptions || {},
      };
      const nextMockups = [...mockups];
      nextMockups[safeIndex] = nextMockup;
      onResultChange(Array.isArray(result) ? nextMockups : nextMockup);
      setShowAnnotated(false);
    } catch (requestError) {
      setApplyError(
        requestError.response?.data?.error || 'Failed to generate the selected placement. Please try again.'
      );
    } finally {
      setIsApplying(false);
    }
  };

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

  if (mockups.length === 0 || !current) {
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

  const isMobile = current.metadata.device === 'mobile';

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

      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h2 className="text-lg font-bold text-text-primary">Mockup Preview</h2>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-navy text-white text-xs font-medium">
              {current.metadata.adSizeName}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-200 text-text-primary text-xs">
              {current.metadata.adSize}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-200 text-text-primary text-xs capitalize">
              {current.metadata.device}
            </span>
            {current.metadata.consentHandled && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs">
                Consent handled
              </span>
            )}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${methodInfo.className}`}>
              {methodInfo.label}
            </span>
            {current.metadata.placement?.renderConfidence && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-200 text-text-primary text-xs capitalize">
                Render {current.metadata.placement.renderConfidence}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-text-muted">
            <ExternalLink size={11} />
            <a
              href={current.metadata.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent transition-colors"
            >
              {current.metadata.websiteUrl}
            </a>
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          <a
            href={current.mockupImageUrl}
            download
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            <Download size={15} />
            Download PNG
          </a>
          {current.adTagDownloadUrl && (
            <a
              href={current.adTagDownloadUrl}
              download
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-text-primary text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <FileCode size={15} />
              Ad Tag
            </a>
          )}
        </div>
      </div>

      {pickerVisible && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-sky-100 bg-sky-50 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-text-primary">Slot selection available</div>
            <div className="text-xs text-text-muted mt-0.5">
              Review the annotated candidates or keep the current auto-selected placement.
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowAnnotated(true)}
              className={`px-3 py-1.5 rounded-lg border text-xs ${
                showAnnotated
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-gray-200 text-text-primary hover:bg-white'
              }`}
            >
              Annotated Slots
            </button>
            <button
              type="button"
              onClick={() => setShowAnnotated(false)}
              className={`px-3 py-1.5 rounded-lg border text-xs ${
                !showAnnotated
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-gray-200 text-text-primary hover:bg-white'
              }`}
            >
              Current Mockup
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-center">
        {renderPreviewFrame({
          isMobile,
          url: previewUrl,
          websiteUrl: current.metadata.websiteUrl,
          alt: pickerVisible && showAnnotated ? 'Annotated ad slot preview' : 'Ad placement mockup',
        })}
      </div>

      {pickerVisible && (
        <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Select ad placement</h3>
              <p className="text-xs text-text-muted mt-0.5">
                Choosing a different slot reruns capture and injects into that placement.
              </p>
            </div>
            <button
              type="button"
              onClick={handleApplyPlacement}
              disabled={isApplying || !selectedSlot}
              className="px-3 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {isApplying ? 'Applying...' : selectedSlotId === current.metadata.placement?.slotId ? 'Use Current Placement' : 'Apply Selected Slot'}
            </button>
          </div>

          <div className="space-y-2">
            {slotCandidates.map((candidate) => {
              const isSelected = candidate.slotId === selectedSlotId;
              return (
                <button
                  key={candidate.slotId}
                  type="button"
                  onClick={() => setSelectedSlotId(candidate.slotId)}
                  className={`w-full text-left rounded-lg border px-4 py-3 transition-all ${
                    isSelected
                      ? 'border-accent bg-accent/5 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-text-primary">
                        Slot {candidate.rank}: {candidate.width}x{candidate.height}
                      </div>
                      <div className="text-xs text-text-muted mt-1">
                        Score {candidate.score} · {candidate.type} · {candidate.confidence} confidence
                      </div>
                    </div>
                    <div className={`text-xs font-semibold ${isSelected ? 'text-accent' : 'text-text-muted'}`}>
                      {candidate.slotId === current.metadata.placement?.slotId ? 'Current' : `#${candidate.rank}`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedSlot && (
            <div className="mt-3 text-xs text-text-muted">
              Selected slot: {selectedSlot.width}x{selectedSlot.height} at ({selectedSlot.x}, {selectedSlot.y})
            </div>
          )}

          {applyError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {applyError}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 p-3 rounded-lg bg-white border border-gray-200 text-xs text-text-muted">
        <span className="font-medium text-text-primary">Placement:</span>{' '}
        {current.metadata.placement.adSizeName} ({current.metadata.adSize}) at position ({current.metadata.placement.x}, {current.metadata.placement.y}) via {methodInfo.label}
        {current.metadata.placement.slotId && <span> · Slot {current.metadata.placement.slotId}</span>}
        {current.metadata.placement.domInjectionFallbackReason && (
          <span> · DOM fallback reason: {current.metadata.placement.domInjectionFallbackReason}</span>
        )}
        {current.metadata.placement.visualDiffRatio != null && (
          <span> · Visual diff {current.metadata.placement.visualDiffRatio}</span>
        )}
      </div>
    </div>
  );
}
