/**
 * Ad compositing service using Sharp.
 * Composites ad creatives onto website screenshots at correct positions.
 */

const sharp = require('sharp');
const { renderAdTag } = require('./puppeteer');

// Placement positions by ad size (as fraction of page dimensions)
const PLACEMENT_CONFIG = {
  '728x90': {
    name: 'Leaderboard',
    desktop: { xAlign: 'center', yFraction: 0.05 }, // Top of page, below header
    mobile: null, // Desktop-only
  },
  '970x250': {
    name: 'Billboard',
    desktop: { xAlign: 'center', yFraction: 0.04 },
    mobile: null,
  },
  '300x250': {
    name: 'Medium Rectangle',
    desktop: { xAlign: 'right', yFraction: 0.35 },
    mobile: { xAlign: 'center', yFraction: 0.30 },
  },
  '300x600': {
    name: 'Half Page',
    desktop: { xAlign: 'right', yFraction: 0.25 },
    mobile: { xAlign: 'center', yFraction: 0.30 },
  },
  '160x600': {
    name: 'Wide Skyscraper',
    desktop: { xAlign: 'left-sidebar', yFraction: 0.15 },
    mobile: null,
  },
};

/**
 * Calculate the x,y position for ad placement on the screenshot.
 */
function calculatePlacement(adWidth, adHeight, pageWidth, pageHeight, device, adSize) {
  const config = PLACEMENT_CONFIG[adSize];
  const placement = device === 'mobile' ? (config?.mobile || config?.desktop) : config?.desktop;

  if (!placement) {
    // Fallback: center of page at 30% down
    return {
      x: Math.max(0, Math.floor((pageWidth - adWidth) / 2)),
      y: Math.floor(pageHeight * 0.3),
    };
  }

  let x, y;

  // Calculate Y position
  y = Math.floor(pageHeight * placement.yFraction);
  // Ensure ad doesn't go off-page
  y = Math.min(y, pageHeight - adHeight - 20);
  y = Math.max(20, y);

  // Calculate X position
  switch (placement.xAlign) {
    case 'center':
      x = Math.max(0, Math.floor((pageWidth - adWidth) / 2));
      break;
    case 'right':
      // Place in right sidebar area (roughly 70% from left on desktop)
      if (device === 'desktop') {
        x = Math.min(pageWidth - adWidth - 20, Math.floor(pageWidth * 0.70));
      } else {
        x = Math.max(0, Math.floor((pageWidth - adWidth) / 2));
      }
      break;
    case 'left-sidebar':
      x = 20;
      break;
    default:
      x = Math.max(0, Math.floor((pageWidth - adWidth) / 2));
  }

  return { x, y };
}

/**
 * Create an ad image with border and label.
 */
async function createAdOverlay(adImageBuffer, adWidth, adHeight) {
  const borderWidth = 1;
  const labelHeight = 16;
  const borderColor = '#FF6B35';

  // Total size including border and label
  const totalWidth = adWidth + borderWidth * 2;
  const totalHeight = adHeight + borderWidth * 2 + labelHeight;

  // Create the "AD" label as SVG
  const labelSvg = `<svg width="${totalWidth}" height="${labelHeight}">
    <rect width="${totalWidth}" height="${labelHeight}" fill="${borderColor}" rx="0"/>
    <text x="4" y="12" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="white">AD</text>
  </svg>`;

  // Create border frame
  const borderSvg = `<svg width="${totalWidth}" height="${totalHeight}">
    <rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="none" stroke="${borderColor}" stroke-width="${borderWidth * 2}" rx="1"/>
  </svg>`;

  // Resize ad image to exact dimensions
  const resizedAd = await sharp(adImageBuffer)
    .resize(adWidth, adHeight, { fit: 'fill' })
    .png()
    .toBuffer();

  // Composite: border frame → ad image → label
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
 * Create a placeholder ad when the actual ad tag fails to render.
 */
async function createPlaceholder(adWidth, adHeight) {
  const svg = `<svg width="${adWidth}" height="${adHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${adWidth}" height="${adHeight}" fill="#f0f0f0" stroke="#cccccc" stroke-width="1"/>
    <rect x="0" y="0" width="${adWidth}" height="${adHeight}" fill="url(#diag)" />
    <defs>
      <pattern id="diag" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="20" stroke="#e0e0e0" stroke-width="1"/>
      </pattern>
    </defs>
    <text x="${adWidth / 2}" y="${adHeight / 2 - 10}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#999999">Ad Creative</text>
    <text x="${adWidth / 2}" y="${adHeight / 2 + 10}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#999999">${adWidth}×${adHeight}</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Generate the complete mockup: website screenshot with ad composited.
 */
async function generateMockup({ screenshotBuffer, dimensions, device, adSize, adTag, adImageBuffer }) {
  const [adWidth, adHeight] = adSize.split('x').map(Number);

  // Get the ad creative image
  let adCreativeBuffer;

  if (adImageBuffer) {
    // User uploaded an image
    adCreativeBuffer = adImageBuffer;
  } else if (adTag) {
    // Render the ad tag in a headless browser
    adCreativeBuffer = await renderAdTag(adTag, adWidth, adHeight);
    if (!adCreativeBuffer) {
      // Fallback to placeholder
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

  // Calculate placement position
  const { x, y } = calculatePlacement(adWidth, adHeight, pageWidth, pageHeight, device, adSize);

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
      adSizeName: PLACEMENT_CONFIG[adSize]?.name || adSize,
    },
  };
}

module.exports = {
  generateMockup,
  createPlaceholder,
};
