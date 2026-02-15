/**
 * Ad compositing service using Sharp.
 * Composites ad creatives onto website screenshots at correct positions.
 * Uses detected ad slot positions when available, with smart fallback.
 */

const sharp = require('sharp');
const { renderAdTag } = require('./puppeteer');

const PLACEMENT_CONFIG = {
  '728x90': { name: 'Leaderboard' },
  '970x250': { name: 'Billboard' },
  '300x250': { name: 'Medium Rectangle' },
  '300x600': { name: 'Half Page' },
  '160x600': { name: 'Wide Skyscraper' },
};

function getAdSizeName(adSize) {
  return PLACEMENT_CONFIG[adSize]?.name || adSize;
}

/**
 * Calculate fallback placement when no ad slot is detected on the page.
 * Uses layout-aware heuristics based on ad size and typical page structure.
 */
function calculateFallbackPlacement(adWidth, adHeight, pageWidth, pageHeight, device, adSize) {
  const viewportH = device === 'mobile' ? 844 : 900;
  // Typical page layout: header ~80px, nav ~50px, content starts ~150px
  const contentStart = 150;

  let x, y;

  switch (adSize) {
    case '728x90':
    case '970x250':
      // Leaderboard/Billboard: centered, just below navigation
      x = Math.max(0, Math.floor((pageWidth - adWidth) / 2));
      y = contentStart;
      break;

    case '300x250':
      if (device === 'mobile') {
        // Mobile: centered, between content blocks (~1.5 screens down)
        x = Math.max(0, Math.floor((pageWidth - adWidth) / 2));
        y = Math.min(Math.floor(viewportH * 1.5), pageHeight - adHeight - 20);
      } else {
        // Desktop: right sidebar area. Content is typically 60-70% width.
        const contentAreaWidth = Math.floor(pageWidth * 0.65);
        x = Math.min(contentAreaWidth + 20, pageWidth - adWidth - 20);
        y = contentStart + 100;
      }
      break;

    case '300x600':
      if (device === 'mobile') {
        x = Math.max(0, Math.floor((pageWidth - adWidth) / 2));
        y = Math.min(Math.floor(viewportH * 1.2), pageHeight - adHeight - 20);
      } else {
        const contentAreaWidth = Math.floor(pageWidth * 0.65);
        x = Math.min(contentAreaWidth + 20, pageWidth - adWidth - 20);
        y = contentStart + 50;
      }
      break;

    case '160x600':
      // Skyscraper: left sidebar, below header
      x = 10;
      y = contentStart + 50;
      break;

    default:
      x = Math.max(0, Math.floor((pageWidth - adWidth) / 2));
      y = Math.min(Math.floor(viewportH * 0.5), pageHeight - adHeight - 20);
  }

  // Ensure bounds
  x = Math.max(0, Math.min(x, pageWidth - adWidth));
  y = Math.max(10, Math.min(y, pageHeight - adHeight - 10));

  return { x, y };
}

/**
 * Prepare the creative as a clean overlay without extra frame/badge.
 */
async function createAdOverlay(adImageBuffer, adWidth, adHeight) {
  const overlay = await sharp(adImageBuffer)
    .resize(adWidth, adHeight, { fit: 'fill' })
    .png()
    .toBuffer();

  return { overlay, totalWidth: adWidth, totalHeight: adHeight };
}

/**
 * Create a visible placeholder ad when the actual ad tag fails to render.
 */
async function createPlaceholder(adWidth, adHeight) {
  const svg = `<svg width="${adWidth}" height="${adHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${adWidth}" height="${adHeight}" fill="#f3f4f6" stroke="#d1d5db" stroke-width="1"/>
    <text x="${adWidth / 2}" y="${adHeight / 2 - 6}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="600" fill="#6b7280">Creative unavailable</text>
    <text x="${adWidth / 2}" y="${adHeight / 2 + 14}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#9ca3af">${adWidth} x ${adHeight}</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Generate the complete mockup: website screenshot with ad composited.
 * Uses detected ad slot positions when available.
 */
async function generateMockup({
  screenshotBuffer,
  dimensions,
  device,
  adSize,
  adTag,
  adImageBuffer,
  detectedSlot,
  allowHeuristicFallback = true,
}) {
  const [adWidth, adHeight] = adSize.split('x').map(Number);

  // Get the ad creative image
  let adCreativeBuffer;
  let adTagRendered = false;

  if (adImageBuffer) {
    adCreativeBuffer = adImageBuffer;
  } else if (adTag) {
    adCreativeBuffer = await renderAdTag(adTag, adWidth, adHeight);
    if (adCreativeBuffer) {
      adTagRendered = true;
    } else {
      console.log('Ad tag render failed, using placeholder');
      adCreativeBuffer = await createPlaceholder(adWidth, adHeight);
    }
  } else {
    adCreativeBuffer = await createPlaceholder(adWidth, adHeight);
  }

  // Create the ad overlay (with border + label)
  const { overlay, totalWidth, totalHeight } = await createAdOverlay(adCreativeBuffer, adWidth, adHeight);

  // Get screenshot metadata
  const screenshotMeta = await sharp(screenshotBuffer).metadata();
  const pageWidth = screenshotMeta.width;
  const pageHeight = screenshotMeta.height;

  // Determine placement: prefer detected slot, fallback to heuristic
  let x, y;
  let placementMethod;

  if (detectedSlot) {
    x = detectedSlot.x;
    y = detectedSlot.y;
    placementMethod = 'detected';
    console.log(`Using detected ad slot at (${x}, ${y})`);
  } else {
    if (!allowHeuristicFallback) {
      const err = new Error(
        'No reliable ad slot was found on this page. Enable heuristic fallback to force a best-guess placement.'
      );
      err.code = 'NO_RELIABLE_SLOT';
      throw err;
    }
    const fallback = calculateFallbackPlacement(adWidth, adHeight, pageWidth, pageHeight, device, adSize);
    x = fallback.x;
    y = fallback.y;
    placementMethod = 'heuristic';
    console.log(`No ad slot detected, using heuristic placement at (${x}, ${y})`);
  }

  // Ensure overlay fits within screenshot bounds
  const safeX = Math.max(0, Math.min(x, pageWidth - totalWidth));
  const safeY = Math.max(0, Math.min(y, pageHeight - totalHeight));

  // Composite the ad onto the screenshot
  const mockup = await sharp(screenshotBuffer)
    .composite([
      {
        input: overlay,
        top: safeY,
        left: safeX,
        blend: 'over',
      },
    ])
    .png({ quality: 90 })
    .toBuffer();

  return {
    mockup,
    placement: {
      x: safeX,
      y: safeY,
      adSize,
      adSizeName: getAdSizeName(adSize),
      method: placementMethod,
      adTagRendered,
    },
  };
}

module.exports = {
  generateMockup,
  createPlaceholder,
  getAdSizeName,
};
