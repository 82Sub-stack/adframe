const express = require('express');
const router = express.Router();
const multer = require('multer');
const { randomUUID } = require('crypto');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { captureWebsite } = require('../services/puppeteer');
const { generateMockup } = require('../services/ad-injector');
const { isBlockedDomain } = require('../services/gemini');
const { getEffectiveOutputDir, getUploadDir } = require('../services/settings-store');
const queue = require('../utils/queue');

// Store generated mockups in memory (use disk/S3 in production)
const mockupStore = new Map();

// Configure multer for disk-backed uploads to avoid holding creatives in RAM.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, getUploadDir()),
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase() || '.bin';
    cb(null, `${randomUUID()}${extension}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, and GIF images are allowed'));
    }
  },
});

const TOPIC_PATH_HINTS = {
  sports: ['sport', 'sports', 'soccer', 'football', 'fussball'],
  soccer: ['soccer', 'football', 'fussball', 'sport'],
  finance: ['finance', 'money', 'wirtschaft', 'boerse', 'business'],
  news: ['news', 'politik', 'world', 'nachrichten'],
  tech: ['tech', 'technology', 'it', 'digital', 'ki', 'ai'],
  automotive: ['auto', 'automotive', 'cars', 'mobilitaet'],
  travel: ['travel', 'reisen', 'urlaub'],
  cooking: ['cooking', 'rezepte', 'food', 'recipe', 'essen'],
  lifestyle: ['lifestyle', 'leben', 'style'],
};

const MOCKUP_JOB_TIMEOUT_MS = Number.parseInt(
  process.env.MOCKUP_JOB_TIMEOUT_MS || '',
  10
) || (process.env.NODE_ENV === 'production' ? 70000 : 120000);

function parseBoolean(value, defaultValue = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return defaultValue;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

async function withTimeout(promise, timeoutMs, errorMessage) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(errorMessage);
          err.code = 'MOCKUP_TIMEOUT';
          reject(err);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function getTopicKeywords(topic) {
  if (!topic || typeof topic !== 'string') return [];
  const cleaned = topic.trim().toLowerCase();
  if (!cleaned) return [];

  const tokens = cleaned.split(/[^a-z0-9]+/).filter(Boolean);
  const expanded = [...tokens];

  for (const token of tokens) {
    if (TOPIC_PATH_HINTS[token]) {
      expanded.push(...TOPIC_PATH_HINTS[token]);
    }
  }

  if (tokens.includes('ai')) {
    expanded.push('ki', 'artificial-intelligence');
  }

  return unique(expanded).slice(0, 8);
}

function buildTopicCandidates(baseUrl, topicKeywords) {
  const parsed = new URL(baseUrl);
  const hostname = parsed.hostname.replace(/^www\./, '');
  const labels = hostname.split('.');
  const candidates = [baseUrl];

  if ((parsed.pathname || '/') !== '/') {
    return unique(candidates);
  }

  const baseDomain = labels.length >= 2 ? labels.slice(-2).join('.') : hostname;

  for (const keyword of topicKeywords) {
    candidates.push(`${parsed.protocol}//${hostname}/${keyword}`);
    candidates.push(`${parsed.protocol}//${hostname}/${keyword}/`);
    candidates.push(`${parsed.protocol}//${hostname}/topic/${keyword}`);
    candidates.push(`${parsed.protocol}//${hostname}/tag/${keyword}`);
    candidates.push(`${parsed.protocol}//${hostname}/thema/${keyword}`);
    candidates.push(`${parsed.protocol}//${hostname}/rubrik/${keyword}`);
    candidates.push(`${parsed.protocol}//${keyword}.${baseDomain}/`);
  }

  return unique(candidates);
}

async function scoreTopicCandidate(candidateUrl, topicKeywords) {
  const timeoutMs = 2500;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(candidateUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AdFrame/1.0; +https://adframe.local)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) return null;

    const finalUrl = response.url || candidateUrl;
    const finalPath = new URL(finalUrl).pathname.toLowerCase();
    const html = (await response.text()).toLowerCase().slice(0, 40000);
    const headText = html.slice(0, 4000);

    let score = 0;
    for (const keyword of topicKeywords) {
      if (finalPath.includes(`/${keyword}`)) score += 10;
      if (finalPath.includes(keyword)) score += 5;
      if (headText.includes(keyword)) score += 2;
    }

    // Prefer URLs that are not homepage root when topic is specified.
    if (finalPath !== '/') score += 6;

    return {
      url: finalUrl,
      score,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveTopicAwareUrl(url, topic) {
  const topicKeywords = getTopicKeywords(topic);
  if (topicKeywords.length === 0) {
    return url;
  }

  const parsed = new URL(url);
  if ((parsed.pathname || '/') !== '/') {
    return url;
  }

  const candidates = buildTopicCandidates(url, topicKeywords).slice(0, 8);
  const results = await Promise.all(candidates.map((candidate) => scoreTopicCandidate(candidate, topicKeywords)));
  const valid = results.filter(Boolean);
  const best = valid.sort((a, b) => b.score - a.score)[0];

  if (best && best.score >= 8) {
    return best.url;
  }

  return url;
}

function getSlotConfidence(score = 0) {
  if (score >= 82) return 'high';
  if (score >= 68) return 'medium';
  return 'low';
}

function normalizeSlotCandidates(slotCandidates = []) {
  return slotCandidates.slice(0, 5).map((candidate, index) => ({
    slotId: candidate.slotId,
    rank: index + 1,
    score: candidate.score,
    type: candidate.type,
    x: candidate.x,
    y: candidate.y,
    width: candidate.slotWidth,
    height: candidate.slotHeight,
    confidence: getSlotConfidence(candidate.score),
  }));
}

async function generateAnnotatedPreview(baseScreenshotBuffer, slotCandidates = []) {
  if (!baseScreenshotBuffer) return null;

  const previewCandidates = normalizeSlotCandidates(slotCandidates).slice(0, 3);
  if (previewCandidates.length === 0) {
    return Buffer.from(baseScreenshotBuffer);
  }

  const image = sharp(baseScreenshotBuffer);
  const metadata = await image.metadata();
  const width = metadata.width || 1;
  const height = metadata.height || 1;
  const colors = ['#00C853', '#2196F3', '#FF9800'];

  const overlays = previewCandidates.map((candidate, index) => {
    const color = colors[index] || '#2196F3';
    const left = Math.max(0, Math.min(width - 1, Math.round(candidate.x)));
    const top = Math.max(0, Math.min(height - 1, Math.round(candidate.y)));
    const rectWidth = Math.max(24, Math.min(width - left, Math.round(candidate.width)));
    const rectHeight = Math.max(24, Math.min(height - top, Math.round(candidate.height)));
    const labelWidth = 38;
    const labelHeight = 28;

    return `
      <g>
        <rect x="${left}" y="${top}" width="${rectWidth}" height="${rectHeight}" rx="6" ry="6"
          fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="3" />
        <rect x="${left}" y="${top}" width="${labelWidth}" height="${labelHeight}" rx="0" ry="0" fill="${color}" />
        <text x="${left + labelWidth / 2}" y="${top + 19}" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#ffffff">${candidate.rank}</text>
      </g>
    `;
  }).join('');

  const svg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${overlays}
    </svg>
  `);

  return image
    .composite([{ input: svg, top: 0, left: 0 }])
    .png({ quality: 90 })
    .toBuffer();
}

async function runGenerationJob({
  url,
  adSize,
  deviceType,
  adTag,
  adImageBuffer,
  allowHeuristicFallbackEnabled,
  selectedSlotId = null,
}) {
  const [adWidth, adHeight] = adSize.split('x').map(Number);

  return queue.run(async () => {
    const captureResult = await captureWebsite(
      url,
      deviceType,
      adWidth,
      adHeight,
      () => {},
      {
        adTag: adTag || null,
        adImageBuffer: adImageBuffer || null,
        slotId: selectedSlotId || null,
      }
    );

    const slotCandidates = normalizeSlotCandidates(captureResult.slotCandidates || []);
    const selectedCandidate = selectedSlotId
      ? (captureResult.slotCandidates || []).find((candidate) => candidate.slotId === selectedSlotId)
      : captureResult.detectedSlot;

    if (selectedSlotId && !selectedCandidate) {
      const err = new Error('The selected ad slot is no longer available on this page.');
      err.code = 'INVALID_SLOT_ID';
      throw err;
    }

    if (captureResult.domInjection?.succeeded) {
      const mockup = captureResult.screenshot;
      return {
        mockup,
        annotatedPreview: await generateAnnotatedPreview(mockup, captureResult.slotCandidates || []),
        slotCandidates,
        placement: {
          x: captureResult.domInjection.x,
          y: captureResult.domInjection.y,
          adSize,
          adSizeName: getAdSizeName(adSize),
          method: selectedSlotId ? 'user-selected' : 'dom-injected',
          slotId: captureResult.domInjection.selectedSlotId || selectedSlotId || captureResult.detectedSlot?.slotId || null,
          adTagRendered: captureResult.preparedCreative?.adTagRendered || Boolean(adTag),
          adTagType: captureResult.preparedCreative?.adTagType || null,
          renderStrategy: captureResult.preparedCreative?.renderStrategy || null,
          renderConfidence: captureResult.preparedCreative?.renderConfidence || null,
          visuallyVerified: Boolean(captureResult.domInjection.visuallyVerified),
          visualDiffRatio: captureResult.domInjection.visualDiffRatio ?? null,
        },
        consentHandled: captureResult.consentHandled,
        finalUrl: captureResult.finalUrl || url,
      };
    }

    const preparedCreative = captureResult.preparedCreative || {};
    const mockupResult = await generateMockup({
      screenshotBuffer: captureResult.screenshot,
      dimensions: captureResult.dimensions,
      device: deviceType,
      adSize,
      adTag: preparedCreative.adTag ?? (adTag || null),
      adImageBuffer: preparedCreative.adImageBuffer ?? (adImageBuffer || null),
      detectedSlot: selectedCandidate || captureResult.detectedSlot,
      allowHeuristicFallback: allowHeuristicFallbackEnabled,
    });

    if (captureResult.domInjection?.reason && captureResult.domInjection.reason !== 'not-attempted') {
      mockupResult.placement.domInjectionFallbackReason = captureResult.domInjection.reason;
    }
    if (preparedCreative.adTagRendered) {
      mockupResult.placement.adTagRendered = true;
    }

    mockupResult.placement.slotId = selectedSlotId || selectedCandidate?.slotId || captureResult.detectedSlot?.slotId || null;
    mockupResult.placement.adTagType = preparedCreative.adTagType || null;
    mockupResult.placement.renderStrategy = preparedCreative.renderStrategy || null;
    mockupResult.placement.renderConfidence = preparedCreative.renderConfidence || null;
    mockupResult.placement.method = selectedSlotId ? 'user-selected' : mockupResult.placement.method;

    return {
      ...mockupResult,
      annotatedPreview: await generateAnnotatedPreview(mockupResult.mockup, captureResult.slotCandidates || []),
      slotCandidates,
      consentHandled: captureResult.consentHandled,
      finalUrl: captureResult.finalUrl || url,
    };
  });
}

function pruneMockupStore() {
  if (mockupStore.size <= 100) {
    return;
  }

  const entries = [...mockupStore.entries()].filter(([key]) => !String(key).startsWith('adtag-'));
  const toDelete = entries.slice(0, Math.max(0, entries.length - 50));

  toDelete.forEach(([key, value]) => {
    if (value.path && fs.existsSync(value.path)) {
      fs.unlinkSync(value.path);
    }
    if (value.annotatedPath && fs.existsSync(value.annotatedPath)) {
      fs.unlinkSync(value.annotatedPath);
    }
    mockupStore.delete(key);
    mockupStore.delete(`adtag-${key}`);
  });
}

function storeMockupResult({
  mockupBuffer,
  annotatedPreviewBuffer,
  metadata,
  request,
  adTag,
}) {
  const mockupId = randomUUID();
  const outputDir = getEffectiveOutputDir();
  fs.mkdirSync(outputDir, { recursive: true });
  const mockupPath = path.join(outputDir, `${mockupId}.png`);
  fs.writeFileSync(mockupPath, mockupBuffer);

  let annotatedPath = null;
  if (annotatedPreviewBuffer) {
    annotatedPath = path.join(outputDir, `${mockupId}-annotated.png`);
    fs.writeFileSync(annotatedPath, annotatedPreviewBuffer);
  }

  mockupStore.set(mockupId, {
    path: mockupPath,
    annotatedPath,
    metadata,
    request,
  });

  if (adTag) {
    mockupStore.set(`adtag-${mockupId}`, { adTag });
  }

  pruneMockupStore();
  return mockupId;
}

function buildMockupResponse(mockupId, metadata) {
  return {
    mockupId,
    mockupImageUrl: `/api/download-mockup/${mockupId}`,
    annotatedPreviewUrl: `/api/download-mockup/${mockupId}/annotated`,
    adTagDownloadUrl: metadata.hasAdTag ? `/api/download-adtag/${mockupId}` : null,
    slotCandidates: metadata.slotCandidates || [],
    metadata: {
      websiteUrl: metadata.websiteUrl,
      adSize: metadata.adSize,
      adSizeName: metadata.adSizeName,
      device: metadata.device,
      placement: metadata.placement,
      consentHandled: metadata.consentHandled,
    },
  };
}

router.post('/', upload.single('adImage'), async (req, res) => {
  const uploadedImagePath = req.file?.path || null;

  try {
    const { websiteUrl, topic, adSize, device, adTag, allowHeuristicFallback } = req.body;
    const adImage = req.file;
    const allowHeuristicFallbackEnabled = parseBoolean(allowHeuristicFallback, false);

    // Validation
    if (!websiteUrl) {
      return res.status(400).json({ error: 'Website URL is required' });
    }
    if (!adSize) {
      return res.status(400).json({ error: 'Ad size is required' });
    }

    const validSizes = ['300x250', '300x600', '728x90', '160x600', '970x250'];
    if (!validSizes.includes(adSize)) {
      return res.status(400).json({ error: `Invalid ad size. Valid sizes: ${validSizes.join(', ')}` });
    }

    const validDevices = ['desktop', 'mobile'];
    const deviceType = device || 'desktop';
    if (!validDevices.includes(deviceType)) {
      return res.status(400).json({ error: 'Device must be "desktop" or "mobile"' });
    }

    // Check mobile-only restriction
    const desktopOnlySizes = ['728x90', '160x600', '970x250'];
    if (deviceType === 'mobile' && desktopOnlySizes.includes(adSize)) {
      return res.status(400).json({ error: `${adSize} is a desktop-only ad size` });
    }

    if (!adTag && !adImage) {
      return res.status(400).json({ error: 'Either an ad tag or ad image is required' });
    }

    // Validate image dimensions if uploaded
    if (adImage) {
      const [expectedWidth, expectedHeight] = adSize.split('x').map(Number);
      try {
        const meta = await sharp(adImage.path).metadata();
        // Allow some tolerance (within 2px)
        if (Math.abs(meta.width - expectedWidth) > 2 || Math.abs(meta.height - expectedHeight) > 2) {
          return res.status(400).json({
            error: `Image dimensions (${meta.width}x${meta.height}) don't match selected ad size (${adSize}). Please upload an image with the correct dimensions.`,
          });
        }
      } catch (err) {
        return res.status(400).json({ error: 'Could not read uploaded image' });
      }
    }

    // Normalize URL
    let url = websiteUrl;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    if (isBlockedDomain(url)) {
      return res.status(400).json({
        error: 'This domain is not supported for mockups (social platforms, search engines, ecommerce, and video sites are excluded). Please use a publisher website.',
      });
    }

    url = await resolveTopicAwareUrl(url, topic);

    // Check blocked domains
    if (isBlockedDomain(url)) {
      return res.status(400).json({
        error: 'This domain is not supported for mockups (social platforms, search engines, ecommerce, and video sites are excluded). Please use a publisher website.',
      });
    }

    let finalWebsiteUrl = url;
    const result = await runGenerationJob({
      url,
      adSize,
      deviceType,
      adTag,
      adImageBuffer: adImage ? adImage.buffer : null,
      allowHeuristicFallbackEnabled,
    });

    finalWebsiteUrl = result.finalUrl || finalWebsiteUrl;
    const storedMetadata = {
      websiteUrl: finalWebsiteUrl,
      adSize,
      adSizeName: result.placement.adSizeName,
      device: deviceType,
      placement: result.placement,
      consentHandled: result.consentHandled,
      slotCandidates: result.slotCandidates || [],
      hasAdTag: Boolean(adTag),
      createdAt: new Date().toISOString(),
    };
    const requestContext = {
      websiteUrl: finalWebsiteUrl,
      topic: topic || '',
      adSize,
      device: deviceType,
      allowHeuristicFallback: allowHeuristicFallbackEnabled,
      adTag: adTag || null,
      adImageBuffer: adImage ? adImage.buffer : null,
    };

    const mockupId = storeMockupResult({
      mockupBuffer: result.mockup,
      annotatedPreviewBuffer: result.annotatedPreview,
      metadata: storedMetadata,
      request: requestContext,
      adTag: adTag || null,
    });

    res.json(buildMockupResponse(mockupId, storedMetadata));
  } catch (err) {
    console.error('Mockup generation error:', err);
    const message = err?.message || '';

    if (err.code === 'MOCKUP_TIMEOUT' || message.includes('timeout') || message.includes('Timeout')) {
      return res.status(504).json({
        error: 'Mockup generation timed out. Try a different website or retry in a moment.',
      });
    }

    if (/ERR_SSL_VERSION_OR_CIPHER_MISMATCH|ERR_SSL_PROTOCOL_ERROR|ERR_CERT_/i.test(message)) {
      return res.status(422).json({
        error: 'The target domain has an SSL/TLS configuration issue for automated browsing. Try the site with "http://" or use an alternate subdomain.',
      });
    }

    if (err.code === 'NO_RELIABLE_SLOT') {
      return res.status(422).json({
        error: err.message,
      });
    }

    if (err.code === 'INVALID_SLOT_ID') {
      return res.status(422).json({
        error: err.message,
      });
    }

    if (
      /Target closed|Session closed|browser has disconnected|ENOMEM|heap out of memory|Cannot find context/i.test(message)
    ) {
      return res.status(503).json({
        error: 'Mockup generation failed due to temporary server resource limits. Please retry in a moment.',
      });
    }

    res.status(500).json({
      error: 'Failed to generate mockup. Please try again.',
      details: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  } finally {
    if (uploadedImagePath && fs.existsSync(uploadedImagePath)) {
      try {
        fs.unlinkSync(uploadedImagePath);
      } catch (cleanupErr) {
        console.warn('Failed to remove uploaded creative:', cleanupErr.message);
      }
    }
  }
});

router.post('/:id/inject', async (req, res) => {
  try {
    const { id } = req.params;
    const { slotId } = req.body || {};

    if (!slotId) {
      return res.status(400).json({ error: 'slotId is required' });
    }

    if (!mockupStore.has(id)) {
      return res.status(404).json({ error: 'Original mockup not found' });
    }

    const existing = mockupStore.get(id);
    const request = existing?.request;
    if (!request) {
      return res.status(404).json({ error: 'Original generation context is no longer available' });
    }

    const result = await runGenerationJob({
      url: request.websiteUrl,
      adSize: request.adSize,
      deviceType: request.device,
      adTag: request.adTag,
      adImageBuffer: request.adImageBuffer || null,
      allowHeuristicFallbackEnabled: parseBoolean(request.allowHeuristicFallback, false),
      selectedSlotId: slotId,
    });

    const storedMetadata = {
      websiteUrl: result.finalUrl || request.websiteUrl,
      adSize: request.adSize,
      adSizeName: result.placement.adSizeName,
      device: request.device,
      placement: result.placement,
      consentHandled: result.consentHandled,
      slotCandidates: result.slotCandidates || existing.metadata?.slotCandidates || [],
      hasAdTag: Boolean(request.adTag),
      createdAt: new Date().toISOString(),
    };

    const mockupId = storeMockupResult({
      mockupBuffer: result.mockup,
      annotatedPreviewBuffer: result.annotatedPreview,
      metadata: storedMetadata,
      request,
      adTag: request.adTag || null,
    });

    res.json(buildMockupResponse(mockupId, storedMetadata));
  } catch (err) {
    console.error('Targeted mockup generation error:', err);

    if (err.code === 'INVALID_SLOT_ID' || err.code === 'NO_RELIABLE_SLOT') {
      return res.status(422).json({ error: err.message });
    }

    res.status(500).json({
      error: 'Failed to generate mockup for the selected slot. Please try again.',
      details: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
});

// Export mockupStore for download routes
router.mockupStore = mockupStore;

module.exports = router;
