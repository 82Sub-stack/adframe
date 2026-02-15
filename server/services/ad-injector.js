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
 * Create an ad image with border and label.
 */
async function createAdOverlay(adImageBuffer, adWidth, adHeight) {
  const borderWidth = 1;
  const labelHeight = 16;
  const borderColor = '#FF6B35';

  const totalWidth = adWidth + borderWidth * 2;
  const totalHeight = adHeight + borderWidth * 2 + labelHeight;

  const labelSvg = `<svg width="${totalWidth}" height="${labelHeight}">
    <rect width="${totalWidth}" height="${labelHeight}" fill="${borderColor}" rx="0"/>
    <text x="4" y="12" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="white">AD</text>
  </svg>`;

  const borderSvg = `<svg width="${totalWidth}" height="${totalHeight}">
    <rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="none" stroke="${borderColor}" stroke-width="${borderWidth * 2}" rx="1"/>
  </svg>`;

  const resizedAd = await sharp(adImageBuffer)
    .resize(adWidth, adHeight, { fit: 'fill' })
    .png()
    .toBuffer();

  const overlay = await sharp({
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([
      { input: Buffer.from(borderSvg), top: 0, left: 0 },
      { input: resizedAd, top: borderWidth, left: borderWidth },
      { input: Buffer.from(labelSvg), top: adHeight + borderWidth * 2, left: 0 },
    ])
    .png()
    .toBuffer();

  return { overlay, totalWidth, totalHeight };
}

/**
 * Create a visible placeholder ad when the actual ad tag fails to render.
 */
async function createPlaceholder(adWidth, adHeight) {
  const svg = `<svg width="${adWidth}" height="${adHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${adWidth}" height="${adHeight}" fill="#f8f0eb" stroke="#FF6B35" stroke-width="2" stroke-dasharray="8,4"/>
    <text x="${adWidth / 2}" y="${adHeight / 2 - 12}" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#FF6B35">Ad Creative</text>
    <text x="${adWidth / 2}" y="${adHeight / 2 + 12}" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#999">${adWidth} x ${adHeight}</text>
    <text x="${adWidth / 2}" y="${adHeight / 2 + 32}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#bbb">(tag failed to render)</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Generate the complete mockup: website screenshot with ad composited.
 * Uses detected ad slot positions when available.
 */
async function generateMockup({ screenshotBuffer, dimensions, device, adSize, adTag, adImageBuffer, detectedSlot }) {
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
