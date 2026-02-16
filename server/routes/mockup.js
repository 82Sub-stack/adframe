const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { captureWebsite } = require('../services/puppeteer');
const { generateMockup, getAdSizeName } = require('../services/ad-injector');
const { isBlockedDomain } = require('../services/gemini');
const queue = require('../utils/queue');

// Configure multer for image uploads
const storage = multer.memoryStorage();
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

// Store generated mockups in memory (use disk/S3 in production)
const mockupStore = new Map();

// Ensure output directory exists
const outputDir = path.join(__dirname, '..', 'output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

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
  const timeoutMs = 4500;
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
    const html = (await response.text()).toLowerCase().slice(0, 120000);
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

  const candidates = buildTopicCandidates(url, topicKeywords).slice(0, 16);
  const results = await Promise.all(candidates.map((candidate) => scoreTopicCandidate(candidate, topicKeywords)));
  const valid = results.filter(Boolean);
  const best = valid.sort((a, b) => b.score - a.score)[0];

  if (best && best.score >= 8) {
    return best.url;
  }

  return url;
}

router.post('/', upload.single('adImage'), async (req, res) => {
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
        const meta = await sharp(adImage.buffer).metadata();
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

    // Parse ad dimensions for slot detection
    const [adWidth, adHeight] = adSize.split('x').map(Number);

    // Generate mockup via queue
    const result = await queue.run(async () => {
      // Step 1: Capture website screenshot (also detects ad slot positions)
      const captureResult = await captureWebsite(
        url,
        deviceType,
        adWidth,
        adHeight,
        () => {},
        {
          adTag: adTag || null,
          adImageBuffer: adImage ? adImage.buffer : null,
        }
      );

      // Preferred path: inject creative into detected slot in live DOM and screenshot the page.
      if (captureResult.domInjection?.succeeded) {
        const placement = {
          x: captureResult.domInjection.x,
          y: captureResult.domInjection.y,
          adSize,
          adSizeName: getAdSizeName(adSize),
          method: 'dom-injected',
          adTagRendered: Boolean(adTag),
        };

        return {
          mockup: captureResult.screenshot,
          placement,
          consentHandled: captureResult.consentHandled,
        };
      }

      // Fallback path: composite ad onto screenshot when direct DOM injection fails.
      const mockupResult = await generateMockup({
        screenshotBuffer: captureResult.screenshot,
        dimensions: captureResult.dimensions,
        device: deviceType,
        adSize,
        adTag: adTag || null,
        adImageBuffer: adImage ? adImage.buffer : null,
        detectedSlot: captureResult.detectedSlot,
        allowHeuristicFallback: allowHeuristicFallbackEnabled,
      });

      if (captureResult.domInjection?.reason && captureResult.domInjection.reason !== 'not-attempted') {
        mockupResult.placement.domInjectionFallbackReason = captureResult.domInjection.reason;
      }

      return {
        ...mockupResult,
        consentHandled: captureResult.consentHandled,
      };
    });

    // Store the mockup
    const mockupId = uuidv4();
    const mockupPath = path.join(outputDir, `${mockupId}.png`);
    fs.writeFileSync(mockupPath, result.mockup);

    mockupStore.set(mockupId, {
      path: mockupPath,
      metadata: {
        websiteUrl: url,
        adSize,
        device: deviceType,
        placement: result.placement,
        consentHandled: result.consentHandled,
        createdAt: new Date().toISOString(),
      },
    });

    // Also store ad tag if provided
    if (adTag) {
      const adTagId = `adtag-${mockupId}`;
      mockupStore.set(adTagId, { adTag });
    }

    // Clean up old mockups (keep last 50)
    if (mockupStore.size > 100) {
      const entries = [...mockupStore.entries()];
      const toDelete = entries.slice(0, entries.length - 50);
      toDelete.forEach(([key, value]) => {
        if (value.path && fs.existsSync(value.path)) {
          fs.unlinkSync(value.path);
        }
        mockupStore.delete(key);
      });
    }

    res.json({
      mockupId,
      mockupImageUrl: `/api/download-mockup/${mockupId}`,
      adTagDownloadUrl: adTag ? `/api/download-adtag/${mockupId}` : null,
      metadata: {
        websiteUrl: url,
        adSize,
        adSizeName: result.placement.adSizeName,
        device: deviceType,
        placement: result.placement,
        consentHandled: result.consentHandled,
      },
    });
  } catch (err) {
    console.error('Mockup generation error:', err);

    if (err.message?.includes('timeout') || err.message?.includes('Timeout')) {
      return res.status(504).json({
        error: 'Page load timed out. Try a different website or check the URL.',
      });
    }

    if (err.code === 'NO_RELIABLE_SLOT') {
      return res.status(422).json({
        error: err.message,
      });
    }

    res.status(500).json({
      error: 'Failed to generate mockup. Please try again.',
      details: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
});

// Export mockupStore for download routes
router.mockupStore = mockupStore;

module.exports = router;
