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

router.post('/', upload.single('adImage'), async (req, res) => {
  try {
    const { websiteUrl, adSize, device, adTag } = req.body;
    const adImage = req.file;

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

    res.status(500).json({
      error: 'Failed to generate mockup. Please try again.',
      details: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
});

// Export mockupStore for download routes
router.mockupStore = mockupStore;

module.exports = router;
