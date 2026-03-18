/**
 * Puppeteer screenshot engine for capturing publisher websites.
 * Also detects existing ad slots on the page for realistic ad placement.
 */

const puppeteer = require('puppeteer');
const sharp = require('sharp');
const { handleConsent, setConsentCookies } = require('./consent-handler');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DESKTOP_VIEWPORT = {
  width: Number.parseInt(process.env.CAPTURE_VIEWPORT_WIDTH, 10) || (IS_PRODUCTION ? 1366 : 1440),
  height: Number.parseInt(process.env.CAPTURE_VIEWPORT_HEIGHT, 10) || 900,
};
const MOBILE_VIEWPORT = { width: 390, height: 844, isMobile: true, hasTouch: true };

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const MAX_CAPTURE_HEIGHT = Number.parseInt(
  process.env.CAPTURE_MAX_HEIGHT,
  10
) || (IS_PRODUCTION ? 3400 : 10000);
const DEFAULT_SCROLL_SCAN_PX = Number.parseInt(
  process.env.CAPTURE_MAX_SCROLL_PX,
  10
) || (IS_PRODUCTION ? 1600 : 8000);
const GENERIC_SLOT_SCAN_LIMIT = Number.parseInt(
  process.env.SLOT_SCAN_LIMIT,
  10
) || (IS_PRODUCTION ? 900 : 1800);
const ADTAG_NAV_TIMEOUT_MS = Number.parseInt(
  process.env.ADTAG_NAV_TIMEOUT_MS,
  10
) || (IS_PRODUCTION ? 10000 : 15000);
const ADTAG_WAIT_MS = Number.parseInt(
  process.env.ADTAG_WAIT_MS,
  10
) || (IS_PRODUCTION ? 1500 : 3000);
const ADTAG_RENDER_MAX_WAIT_MS = Number.parseInt(
  process.env.ADTAG_RENDER_MAX_WAIT_MS,
  10
) || (IS_PRODUCTION ? 8000 : 12000);

let browserInstance = null;

function isTallFormat(width, height) {
  return height / Math.max(1, width) >= 1.7;
}

function isWideFormat(width, height) {
  return width / Math.max(1, height) >= 1.7;
}

function getFormatAwareSlotThresholds(adWidth, adHeight, device) {
  if (isTallFormat(adWidth, adHeight)) {
    return {
      minHeight: Math.max(260, Math.round(adHeight * 0.65)),
      maxWidth: Math.max(adWidth + 120, Math.round(adWidth * 1.65)),
      maxAspectRatio: device === 'mobile' ? 0.95 : 0.82,
    };
  }

  if (isWideFormat(adWidth, adHeight)) {
    return {
      minWidth: Math.max(320, Math.round(adWidth * 0.65)),
      maxHeight: Math.max(adHeight + 90, Math.round(adHeight * 1.8)),
      minAspectRatio: 1.6,
    };
  }

  return null;
}

function isFormatCompatibleSlot(slot, adWidth, adHeight, device) {
  if (!slot) return false;

  const thresholds = getFormatAwareSlotThresholds(adWidth, adHeight, device);
  if (!thresholds) return true;

  const slotWidth = slot.slotWidth || slot.width || 0;
  const slotHeight = slot.slotHeight || slot.height || 0;
  const slotAspectRatio = slotWidth / Math.max(1, slotHeight);

  if (thresholds.minHeight && slotHeight < thresholds.minHeight) return false;
  if (thresholds.maxWidth && slotWidth > thresholds.maxWidth) return false;
  if (thresholds.maxAspectRatio && slotAspectRatio > thresholds.maxAspectRatio) return false;
  if (thresholds.minWidth && slotWidth < thresholds.minWidth) return false;
  if (thresholds.maxHeight && slotHeight > thresholds.maxHeight) return false;
  if (thresholds.minAspectRatio && slotAspectRatio < thresholds.minAspectRatio) return false;

  return true;
}

async function getBrowser() {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-zygote',
    '--disable-extensions',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ];

  if (IS_PRODUCTION) {
    launchArgs.push('--renderer-process-limit=2');
  }
  if (process.env.PUPPETEER_SINGLE_PROCESS === 'true') {
    launchArgs.push('--single-process');
  }

  browserInstance = await puppeteer.launch({
    headless: 'new',
    args: launchArgs,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    timeout: 30000,
  });

  browserInstance.on('disconnected', () => {
    browserInstance = null;
  });

  return browserInstance;
}

/**
 * Detect existing ad slots/iframes and return ranked candidates.
 */
async function detectAdSlots(page, targetWidth, targetHeight, device, options = {}) {
  const maxCandidateY = options.maxCandidateY || (device === 'mobile' ? 2800 : (IS_PRODUCTION ? 3200 : 4200));
  const scanLimit = options.scanLimit || GENERIC_SLOT_SCAN_LIMIT;
  const slots = await page.evaluate((tw, th, maxScanned) => {
    const results = [];
    const slotIds = new WeakMap();
    let slotCounter = 0;

    const getSlotId = (el) => {
      if (slotIds.has(el)) return slotIds.get(el);
      const existing = el.getAttribute('data-adframe-slot-id');
      if (existing) {
        slotIds.set(el, existing);
        return existing;
      }
      const newId = `adf-slot-${++slotCounter}`;
      el.setAttribute('data-adframe-slot-id', newId);
      slotIds.set(el, newId);
      return newId;
    };

    const isVisible = (el, rect) => {
      if (!rect || rect.width < 1 || rect.height < 1) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (parseFloat(style.opacity || '1') < 0.05) return false;
      return true;
    };

    const getViewportRatio = (rect) => {
      const visibleW = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
      const visibleH = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
      const area = rect.width * rect.height;
      if (area <= 0) return 0;
      return (visibleW * visibleH) / area;
    };

    const pushSlot = (el, rect, type, isAdLikely) => {
      if (!isVisible(el, rect)) return;
      if (rect.width < 50 || rect.height < 30) return;

      const text = ((el.textContent || '') + '').replace(/\s+/g, ' ').trim();
      const textLength = Math.min(500, text.length);
      const headingCount = el.querySelectorAll('h1, h2, h3, h4').length;
      const paragraphCount = el.querySelectorAll('p').length;
      const hasArticleSignals =
        el.matches('article, main, [role="main"]') ||
        Boolean(el.querySelector('article, time, header h1, header h2'));

      results.push({
        slotId: getSlotId(el),
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height,
        isAd: isAdLikely,
        type,
        viewportRatio: getViewportRatio(rect),
        textLength,
        headingCount,
        paragraphCount,
        hasArticleSignals,
      });
    };

    // 1) Iframes are strong ad indicators.
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      const rect = iframe.getBoundingClientRect();
      const src = (iframe.src || iframe.dataset.src || '').toLowerCase();
      const id = (iframe.id || '').toLowerCase();
      const cls = (iframe.className || '').toLowerCase();
      const isAdLikely = src.includes('ad') || src.includes('doubleclick') ||
        src.includes('googlesyndication') || src.includes('amazon-adsystem') ||
        src.includes('flashtalking') || src.includes('adform') ||
        src.includes('adition') || id.includes('ad') || cls.includes('ad') ||
        id.includes('banner') || cls.includes('banner') ||
        id.includes('gpt') || cls.includes('gpt');
      pushSlot(iframe, rect, 'iframe', isAdLikely);
    }

    // 2) Common ad container selectors.
    const adSelectors = [
      '[id*="ad-"][id*="container"]', '[id*="ad_"][id*="container"]',
      '[class*="ad-"][class*="container"]', '[class*="ad_"][class*="container"]',
      '[id*="ad-slot"]', '[class*="ad-slot"]', '[class*="adslot"]',
      '[data-ad]', '[data-ad-slot]', '[data-google-query-id]',
      '[id*="billboard"]', '[id*="leaderboard"]', '[id*="skyscraper"]',
      '[id*="rectangle"]', '[class*="billboard"]', '[class*="leaderboard"]',
      '[id*="google_ads_iframe"]', '[id*="gpt"]', '[class*="gpt"]',
      '.ad-wrapper', '.ad-container', '.ad-unit', '.ad-placement',
      '[id*="iqadtile"]', '[class*="iqadtile"]',
      '[id*="adtile"]', '[class*="adtile"]',
    ];
    for (const sel of adSelectors) {
      try {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const rect = el.getBoundingClientRect();
          pushSlot(el, rect, 'div', true);
        }
      } catch (e) {
        // Ignore invalid selectors.
      }
    }

    const gptSlots = document.querySelectorAll('[id^="div-gpt-ad"]');
    for (const el of gptSlots) {
      const rect = el.getBoundingClientRect();
      pushSlot(el, rect, 'gpt', true);
    }

    // 3) Generic size-match fallback for sites with sparse naming.
    const candidates = document.querySelectorAll('div, section, aside');
    let scanned = 0;
    for (const el of candidates) {
      if (scanned > maxScanned) break;
      scanned++;

      const rect = el.getBoundingClientRect();
      if (rect.width < 50 || rect.height < 30) continue;

      const widthClose = Math.abs(rect.width - tw) <= Math.max(80, tw * 0.35);
      const heightClose = Math.abs(rect.height - th) <= Math.max(80, th * 0.35);
      if (!widthClose || !heightClose) continue;

      const id = (el.id || '').toLowerCase();
      const cls = (el.className || '').toLowerCase();
      const hasAdHints = id.includes('ad') || cls.includes('ad') ||
        id.includes('banner') || cls.includes('banner') ||
        id.includes('gpt') || cls.includes('gpt') ||
        id.includes('sponsor') || cls.includes('sponsor') ||
        el.querySelector('iframe');

      const text = ((el.textContent || '') + '').replace(/\s+/g, ' ').trim();
      const hasContentSignals =
        text.length > 160 ||
        Boolean(el.querySelector('h1, h2, h3, h4, article, time')) ||
        el.matches('article, main, [role="main"]');

      if (hasContentSignals && !hasAdHints) continue;

      pushSlot(el, rect, 'size-match', Boolean(hasAdHints));
    }

    return results;
  }, targetWidth, targetHeight, scanLimit);

  if (slots.length === 0) {
    return options.returnCandidates ? { bestSlot: null, candidates: [] } : null;
  }

  const targetArea = targetWidth * targetHeight;
  const targetRatio = targetWidth / targetHeight;

  // De-duplicate by slotId.
  const deduped = new Map();
  for (const slot of slots) {
    const existing = deduped.get(slot.slotId);
    if (!existing) {
      deduped.set(slot.slotId, slot);
      continue;
    }
    if (slot.isAd && !existing.isAd) {
      deduped.set(slot.slotId, slot);
    }
  }

  const tallFormat = isTallFormat(targetWidth, targetHeight);
  const wideFormat = isWideFormat(targetWidth, targetHeight);

  const scored = [...deduped.values()].map((s) => {
    const widthMatch = Math.max(0, 1 - Math.abs(s.width - targetWidth) / targetWidth);
    const heightMatch = Math.max(0, 1 - Math.abs(s.height - targetHeight) / targetHeight);
    const ratio = s.width / Math.max(1, s.height);
    const ratioMatch = Math.max(0, 1 - Math.abs(ratio - targetRatio));
    const area = s.width * s.height;
    const areaMatch = Math.max(0, 1 - Math.abs(area - targetArea) / targetArea);

    let score = 0;
    score += widthMatch * 35;
    score += heightMatch * 35;
    score += ratioMatch * 20;
    score += areaMatch * 10;
    score += s.viewportRatio * 15;

    if (s.isAd) score += 28;
    if (s.type === 'gpt') score += 18;
    else if (s.type === 'iframe') score += 14;
    else if (s.type === 'size-match') score += 6;

    if (s.textLength > 80) score -= 25;
    if (s.textLength > 220) score -= 40;
    if (s.headingCount > 0) score -= 30;
    if (s.paragraphCount > 2) score -= 15;
    if (s.hasArticleSignals) score -= 45;

    if (!s.isAd && s.type === 'iframe') score -= 20;
    if (!s.isAd && s.type === 'div') score -= 50;

    if (s.y >= 60 && s.y < 3200) score += 10;
    if (s.y > 6500) score -= 25;
    if (area < targetArea * 0.5) score -= 30;
    if (area > targetArea * 4) score -= 18;

    if (tallFormat) {
      if (s.height < Math.max(260, targetHeight * 0.65)) score -= 90;
      if (s.width > Math.max(targetWidth + 120, targetWidth * 1.65)) score -= 90;
      if (ratio > (device === 'mobile' ? 0.95 : 0.82)) score -= 70;
      if (device === 'desktop' && s.x >= Math.round(DESKTOP_VIEWPORT.width * 0.52)) score += 12;
    }

    if (wideFormat) {
      if (s.width < Math.max(320, targetWidth * 0.65)) score -= 60;
      if (s.height > Math.max(targetHeight + 90, targetHeight * 1.8)) score -= 55;
      if (ratio < 1.6) score -= 40;
    }

    return { ...s, score: Math.round(score) };
  });

  scored.sort((a, b) => b.score - a.score);
  const candidates = scored
    .filter((c) => c.score >= 55)
    .filter((c) => c.isAd || c.type === 'iframe' || c.type === 'gpt')
    .filter((c) => isFormatCompatibleSlot(c, targetWidth, targetHeight, device))
    .filter((c) => c.y >= 0 && c.y <= maxCandidateY)
    .slice(0, 8)
    .map((c) => ({
      slotId: c.slotId,
      x: Math.round(c.x),
      y: Math.round(c.y),
      slotWidth: Math.round(c.width),
      slotHeight: Math.round(c.height),
      score: c.score,
      type: c.type,
      isAd: c.isAd,
    }));

  const best = candidates[0] || null;

  if (best) {
    console.log(
      `Detected ad slot: ${best.type} at (${best.x}, ${best.y}) size ${best.slotWidth}x${best.slotHeight}, score=${best.score}`
    );
  }

  if (options.returnCandidates) {
    return { bestSlot: best, candidates };
  }

  return best;
}

function buildDataUri(imageBuffer, mimeType = 'image/png') {
  return `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
}

function buildAdTagSrcDoc(adTag, width, height) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: #fff; }
    #adframe-slot { width: 100%; height: 100%; overflow: hidden; }
  </style>
</head>
<body>
  <div id="adframe-slot">${adTag}</div>
</body>
</html>`;
}

function buildWrappedAdHtml(adTag, width, height) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:${width}px;height:${height}px;overflow:hidden;background:#fff}body{position:relative}#ad{width:${width}px;height:${height}px;overflow:hidden}</style>
</head><body>
<div id="ad">${adTag}</div>
</body></html>`;
}

function classifyAdTag(adTagHtml = '') {
  const trimmed = adTagHtml.trim();
  if (!trimmed) return 'html';
  if (/<iframe[^>]+src\s*=/i.test(trimmed)) return 'iframe';
  if (/VAST|vpaid|ima3\.js/i.test(trimmed)) return 'video';
  if (/googletag|gpt\.js|securepubads/i.test(trimmed)) return 'gpt';
  if (/document\.write\s*\(/i.test(trimmed)) return 'docwrite';
  if (/safeframe|\$sf\./i.test(trimmed)) return 'safeframe';
  if (/<script[\s>]/i.test(trimmed)) return 'generic-script';
  return 'html';
}

async function createTagPlaceholder(width, height, label) {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="#f4f4f5" stroke="#d4d4d8" stroke-width="1"/>
    <text x="${width / 2}" y="${height / 2 - 8}" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#3f3f46">${label}</text>
    <text x="${width / 2}" y="${height / 2 + 16}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#71717a">${width} x ${height}</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function installTagStrategyStubs(page, adTagType) {
  if (adTagType === 'gpt') {
    await page.evaluateOnNewDocument(() => {
      window.googletag = window.googletag || {};
      window.googletag.cmd = window.googletag.cmd || [];
      window.googletag.defineSlot = () => ({
        addService: () => ({}),
        setTargeting: () => ({}),
      });
      window.googletag.enableServices = () => {};
      window.googletag.display = () => {};
      window.googletag.pubads = () => ({
        enableSingleRequest: () => {},
        collapseEmptyDivs: () => {},
        setTargeting: () => ({}),
        addEventListener: () => {},
      });
    });
  }

  if (adTagType === 'safeframe') {
    await page.evaluateOnNewDocument(() => {
      window.$sf = window.$sf || {};
      window.$sf.ext = window.$sf.ext || {
        register: () => {},
        geom: () => ({
          self: { iv: 1, t: 0, l: 0, r: window.innerWidth, b: window.innerHeight, w: window.innerWidth, h: window.innerHeight },
          exp: { t: 0, l: 0, r: 0, b: 0 },
          par: { t: 0, l: 0, r: window.innerWidth, b: window.innerHeight, w: window.innerWidth, h: window.innerHeight },
        }),
      };
    });
  }
}

async function captureClipBuffer(page, clip) {
  const safeClip = {
    x: Math.max(0, Math.round(clip.x)),
    y: Math.max(0, Math.round(clip.y)),
    width: Math.max(1, Math.round(clip.width)),
    height: Math.max(1, Math.round(clip.height)),
  };

  return Buffer.from(await page.screenshot({ type: 'png', clip: safeClip }));
}

async function analyzeImageUniformity(imageBuffer) {
  const { data, info } = await sharp(imageBuffer)
    .resize(24, 24, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels || 3;
  let min = 255;
  let max = 0;
  let total = 0;

  for (let index = 0; index < data.length; index += channels) {
    const value = Math.round((data[index] + data[index + 1] + data[index + 2]) / 3);
    if (value < min) min = value;
    if (value > max) max = value;
    total += value;
  }

  const average = total / Math.max(1, data.length / channels);
  const spread = max - min;
  const nearWhite = average >= 248 && spread <= 6;
  const uniform = spread <= 6;

  return {
    average,
    spread,
    nearWhite,
    uniform,
  };
}

async function compareClipDifference(beforeBuffer, afterBuffer) {
  const [before, after] = await Promise.all([
    sharp(beforeBuffer).resize(48, 48, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(afterBuffer).resize(48, 48, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);

  const channels = before.info.channels || 3;
  let changed = 0;
  let pixels = 0;

  for (let index = 0; index < before.data.length; index += channels) {
    const delta =
      Math.abs(before.data[index] - after.data[index]) +
      Math.abs(before.data[index + 1] - after.data[index + 1]) +
      Math.abs(before.data[index + 2] - after.data[index + 2]);
    if (delta > 48) changed++;
    pixels++;
  }

  return pixels > 0 ? changed / pixels : 0;
}

async function getCreativeDomState(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll('img, canvas, video, svg, iframe, div, ins')];
    const visibleRenderableNodes = nodes.filter((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 10 && rect.height > 10 && style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.05;
    });

    return {
      domNodeCount: document.querySelectorAll('*').length,
      visibleRenderableNodes: visibleRenderableNodes.length,
      iframeCount: document.querySelectorAll('iframe').length,
      imageCount: document.querySelectorAll('img, svg, canvas, video').length,
      textLength: ((document.body?.innerText || '') + '').replace(/\s+/g, ' ').trim().length,
    };
  });
}

async function waitForCreativeRender(page, width, height, diagnostics) {
  const deadline = Date.now() + ADTAG_RENDER_MAX_WAIT_MS;
  const centerClip = {
    x: Math.max(0, Math.floor(width / 2) - 25),
    y: Math.max(0, Math.floor(height / 2) - 25),
    width: Math.min(50, width),
    height: Math.min(50, height),
  };

  while (Date.now() <= deadline) {
    const domState = await getCreativeDomState(page);
    const sampleBuffer = await captureClipBuffer(page, centerClip);
    const sample = await analyzeImageUniformity(sampleBuffer);
    const hasStrongDomSignal =
      domState.iframeCount > 0 ||
      domState.imageCount > 0 ||
      domState.visibleRenderableNodes > 1 ||
      domState.textLength > 24;

    if (hasStrongDomSignal && !(sample.nearWhite && domState.imageCount === 0 && domState.iframeCount === 0)) {
      return {
        renderConfidence: 'high',
        diagnostics: {
          ...domState,
          pendingRequests: diagnostics.getPendingRequests(),
          consoleErrors: diagnostics.consoleErrors.slice(-5),
        },
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  const domState = await getCreativeDomState(page);
  const timeoutDiagnostics = {
    ...domState,
    pendingRequests: diagnostics.getPendingRequests(),
    consoleErrors: diagnostics.consoleErrors.slice(-10),
  };

  console.warn('Ad tag render timed out', timeoutDiagnostics);

  return {
    renderConfidence: 'low',
    diagnostics: timeoutDiagnostics,
  };
}

async function getSlotVisualState(page, slotId, maxCaptureHeight) {
  return page.evaluate((candidateSlotId, clipHeight) => {
    const slotEl = document.querySelector(`[data-adframe-slot-id="${candidateSlotId}"]`);
    if (!slotEl) {
      return { visible: false, reason: 'slot-not-found' };
    }

    const rect = slotEl.getBoundingClientRect();
    const style = getComputedStyle(slotEl);
    const opacity = parseFloat(style.opacity || '1');
    const zIndexValue = Number.parseInt(style.zIndex, 10);
    const zIndex = Number.isFinite(zIndexValue) ? zIndexValue : 0;
    const absoluteTop = rect.top + window.scrollY;
    const absoluteLeft = rect.left + window.scrollX;

    if (rect.width < 20 || rect.height < 20) {
      return { visible: false, reason: 'slot-too-small' };
    }
    if (style.display === 'none' || style.visibility === 'hidden' || opacity <= 0.1) {
      return { visible: false, reason: 'slot-hidden' };
    }
    if (zIndex < 0) {
      return { visible: false, reason: 'slot-behind-content' };
    }
    if (absoluteTop >= clipHeight) {
      return { visible: false, reason: 'slot-outside-capture' };
    }

    let clippedByAncestor = false;
    let ancestor = slotEl.parentElement;
    while (ancestor) {
      const ancestorStyle = getComputedStyle(ancestor);
      if (ancestorStyle.overflow === 'hidden' || ancestorStyle.overflowY === 'hidden' || ancestorStyle.overflowX === 'hidden') {
        const ancestorRect = ancestor.getBoundingClientRect();
        if (rect.bottom > ancestorRect.bottom + 1 || rect.right > ancestorRect.right + 1) {
          clippedByAncestor = true;
          break;
        }
      }
      ancestor = ancestor.parentElement;
    }

    if (clippedByAncestor) {
      return { visible: false, reason: 'slot-clipped' };
    }

    return {
      visible: true,
      x: Math.max(0, Math.round(absoluteLeft)),
      y: Math.max(0, Math.round(absoluteTop)),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
      isIframe: slotEl.tagName === 'IFRAME',
    };
  }, slotId, maxCaptureHeight);
}

function buildPageScreenshotOptions(rawDimensions, viewport, referenceY, referenceHeight) {
  const normalizedReferenceY = referenceY > rawDimensions.viewportHeight * 3
    ? Math.floor(rawDimensions.viewportHeight * 1.2)
    : referenceY;

  const desiredBottom = Math.max(
    rawDimensions.viewportHeight + 100,
    Math.round(normalizedReferenceY + referenceHeight + 260)
  );
  const clipHeight = Math.max(
    Math.min(rawDimensions.viewportHeight, MAX_CAPTURE_HEIGHT),
    Math.min(rawDimensions.height, Math.min(MAX_CAPTURE_HEIGHT, desiredBottom))
  );

  return {
    type: 'png',
    clip: {
      x: 0,
      y: 0,
      width: Math.max(1, Math.min(rawDimensions.width, viewport.width)),
      height: Math.max(320, clipHeight),
    },
  };
}

function isTimeoutError(err) {
  return err?.name === 'TimeoutError' || /timeout/i.test(err?.message || '');
}

function isSslError(err) {
  const message = err?.message || '';
  return /ERR_SSL_VERSION_OR_CIPHER_MISMATCH|ERR_SSL_PROTOCOL_ERROR|ERR_CERT_/i.test(message);
}

function isRetryableNetworkError(err) {
  const message = err?.message || '';
  return /ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED|ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_ABORTED|ERR_TUNNEL_CONNECTION_FAILED/i.test(message);
}

function buildNavigationCandidates(initialUrl) {
  try {
    const parsed = new URL(initialUrl);
    const hostname = parsed.hostname;
    const bareHost = hostname.replace(/^www\./i, '');
    const hostWithWww = bareHost.startsWith('www.') ? bareHost : `www.${bareHost}`;
    const protocol = parsed.protocol === 'http:' ? 'http:' : 'https:';

    const basePath = `${parsed.pathname || '/'}${parsed.search || ''}${parsed.hash || ''}`;
    const candidates = [];

    const pushUrl = (proto, host) => {
      if (!host) return;
      const value = `${proto}//${host}${basePath}`;
      if (!candidates.includes(value)) candidates.push(value);
    };

    pushUrl(protocol, hostname);
    if (protocol === 'https:') {
      pushUrl('https:', hostWithWww);
      pushUrl('http:', hostname);
      pushUrl('http:', hostWithWww);
    } else {
      pushUrl('http:', hostWithWww);
      pushUrl('https:', hostname);
      pushUrl('https:', hostWithWww);
    }

    return candidates;
  } catch {
    return [initialUrl];
  }
}

async function navigatePage(page, url) {
  if (IS_PRODUCTION) {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 22000,
    });
    await new Promise(r => setTimeout(r, 1200));
    return page.url();
  }

  try {
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 25000,
    });
    return page.url();
  } catch (err) {
    if (!isTimeoutError(err)) throw err;
    console.warn(`Primary navigation timed out for ${url}, retrying with domcontentloaded`);
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await new Promise(r => setTimeout(r, 1500));
    return page.url();
  }
}

async function navigateWithFallbacks(page, initialUrl) {
  const candidates = buildNavigationCandidates(initialUrl);
  let lastError = null;

  for (const candidateUrl of candidates) {
    try {
      await setConsentCookies(page, candidateUrl);
      const finalUrl = await navigatePage(page, candidateUrl);
      return finalUrl;
    } catch (err) {
      lastError = err;
      const canRetry = candidateUrl !== candidates[candidates.length - 1];
      if ((isSslError(err) || isRetryableNetworkError(err) || isTimeoutError(err)) && canRetry) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error(`Failed to navigate to ${initialUrl}`);
}

async function injectCreativeIntoDetectedSlot(
  page,
  detectedSlot,
  { adTag = null, adImageBuffer = null, adWidth = 300, adHeight = 250, device = 'desktop', slotCandidates = null } = {}
) {
  const mode = adImageBuffer ? 'image' : adTag ? 'adtag' : null;
  if (!mode) {
    return { succeeded: false, reason: 'no-creative' };
  }

  const candidates = Array.isArray(slotCandidates) && slotCandidates.length > 0
    ? slotCandidates
    : detectedSlot ? [detectedSlot] : [];

  if (candidates.length === 0) {
    return { succeeded: false, reason: 'no-slot' };
  }

  const eligible = candidates
    .filter((c) => c?.slotId)
    .filter((c) => c.isAd || c.type === 'iframe' || c.type === 'gpt')
    .filter((c) => (c.slotWidth || 0) >= Math.max(120, adWidth * 0.55))
    .filter((c) => (c.slotHeight || 0) >= Math.max(60, adHeight * 0.5))
    .filter((c) => isFormatCompatibleSlot(c, adWidth, adHeight, device))
    .slice(0, 5);

  if (eligible.length === 0) {
    return { succeeded: false, reason: 'no-eligible-slot' };
  }

  const sharedPayload = {
    mode,
    adWidth,
    adHeight,
    imageDataUrl: adImageBuffer ? buildDataUri(adImageBuffer) : null,
    srcdoc: adTag ? buildAdTagSrcDoc(adTag, adWidth, adHeight) : null,
  };

  for (let index = 0; index < eligible.length; index++) {
    const candidate = eligible[index];
    const visualState = await getSlotVisualState(page, candidate.slotId, MAX_CAPTURE_HEIGHT);
    if (!visualState.visible) {
      continue;
    }

    const preScreenshot = visualState.isIframe
      ? null
      : await captureClipBuffer(page, {
          x: visualState.x,
          y: visualState.y,
          width: visualState.width,
          height: visualState.height,
        });

    const payload = {
      ...sharedPayload,
      slotId: candidate.slotId,
      fallbackWidth: candidate.slotWidth || adWidth,
      fallbackHeight: candidate.slotHeight || adHeight,
    };

    const result = await page.evaluate((p) => {
      const slotEl = document.querySelector(`[data-adframe-slot-id="${p.slotId}"]`);
      if (!slotEl) {
        return { succeeded: false, reason: 'slot-not-found' };
      }

      let hostEl = slotEl;
      if (slotEl.tagName === 'IFRAME') {
        const rect = slotEl.getBoundingClientRect();
        const replacement = document.createElement('div');
        replacement.setAttribute('data-adframe-slot-id', p.slotId);
        replacement.style.width = `${Math.max(1, Math.round(rect.width || p.fallbackWidth))}px`;
        replacement.style.height = `${Math.max(1, Math.round(rect.height || p.fallbackHeight))}px`;
        replacement.style.display = 'block';
        replacement.style.overflow = 'hidden';
        slotEl.replaceWith(replacement);
        hostEl = replacement;
      }

      const rectBefore = hostEl.getBoundingClientRect();
      const styleBefore = getComputedStyle(hostEl);
      if (styleBefore.display === 'none' || styleBefore.visibility === 'hidden' || rectBefore.width < 20 || rectBefore.height < 20) {
        return { succeeded: false, reason: 'slot-not-visible' };
      }

      const signature = `${hostEl.id || ''} ${hostEl.className || ''}`.toLowerCase();
      const adLike = /(ad|gpt|banner|sponsor|billboard|rectangle|skyscraper|iqadtile|adtile)/.test(signature);
      const text = ((hostEl.textContent || '') + '').replace(/\s+/g, ' ').trim();
      const hasEditorialSignals =
        text.length > 160 ||
        Boolean(hostEl.querySelector('h1, h2, h3, h4, p, article, time')) ||
        hostEl.matches('article, main, [role="main"]') ||
        Boolean(hostEl.closest('article, main, [role="main"]'));
      if (hasEditorialSignals && !adLike) {
        return { succeeded: false, reason: 'content-like-slot' };
      }

      // Lock explicit dimensions before clearing children so the slot
      // does not collapse when its content-derived height is removed.
      hostEl.style.width = `${Math.max(1, Math.round(rectBefore.width || p.fallbackWidth))}px`;
      hostEl.style.height = `${Math.max(1, Math.round(rectBefore.height || p.fallbackHeight))}px`;

      while (hostEl.firstChild) {
        hostEl.removeChild(hostEl.firstChild);
      }

      if (styleBefore.position === 'static') {
        hostEl.style.position = 'relative';
      }
      hostEl.style.overflow = 'hidden';

      const creative = document.createElement('div');
      creative.style.width = '100%';
      creative.style.height = '100%';
      creative.style.background = 'transparent';
      creative.setAttribute('data-adframe-injected', 'true');

      if (p.mode === 'image') {
        const img = document.createElement('img');
        img.src = p.imageDataUrl;
        img.alt = 'Ad creative';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.display = 'block';
        img.style.objectFit = 'fill';
        creative.appendChild(img);
      } else {
        const iframe = document.createElement('iframe');
        iframe.srcdoc = p.srcdoc;
        iframe.setAttribute('scrolling', 'no');
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
        iframe.setAttribute('data-adframe-injected', 'true');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = '0';
        iframe.style.display = 'block';
        creative.appendChild(iframe);
      }

      hostEl.appendChild(creative);

      const rectAfter = hostEl.getBoundingClientRect();
      return {
        succeeded: true,
        mode: p.mode,
        x: Math.round(rectAfter.left + window.scrollX),
        y: Math.round(rectAfter.top + window.scrollY),
        slotWidth: Math.round(rectAfter.width),
        slotHeight: Math.round(rectAfter.height),
      };
    }, payload);

    if (!result?.succeeded) {
      continue;
    }

    if (mode === 'adtag') {
      await page.evaluate((slotId) => {
        return new Promise((resolve) => {
          const host = document.querySelector(`[data-adframe-slot-id="${slotId}"]`);
          const iframe = host?.querySelector('iframe[data-adframe-injected="true"]');
          if (!iframe) {
            resolve(false);
            return;
          }
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            resolve(true);
          };
          iframe.addEventListener('load', done, { once: true });
          setTimeout(done, 3000);
        });
      }, candidate.slotId);
    }

    await new Promise((r) => setTimeout(r, mode === 'adtag' ? 1200 : 350));

    const postVisualState = await getSlotVisualState(page, candidate.slotId, MAX_CAPTURE_HEIGHT);
    if (!postVisualState.visible) {
      continue;
    }

    const postScreenshot = await captureClipBuffer(page, {
      x: postVisualState.x,
      y: postVisualState.y,
      width: postVisualState.width,
      height: postVisualState.height,
    });
    const postUniformity = await analyzeImageUniformity(postScreenshot);
    let changedRatio = 1;

    if (preScreenshot) {
      changedRatio = await compareClipDifference(preScreenshot, postScreenshot);
      if (changedRatio < 0.15) {
        continue;
      }
    }

    if (postUniformity.nearWhite && mode !== 'image') {
      continue;
    }

    return {
      ...result,
      succeeded: true,
      selectedSlotId: candidate.slotId,
      selectedSlotScore: candidate.score,
      selectedSlotType: candidate.type,
      attempts: index + 1,
      visuallyVerified: true,
      visualDiffRatio: Number(changedRatio.toFixed(3)),
    };
  }

  return { succeeded: false, reason: 'all-candidates-failed' };
}

/**
 * Capture a screenshot of a website with consent handling.
 * Also detects ad slot positions for placement.
 */
async function captureWebsite(
  url,
  device = 'desktop',
  adWidth = 300,
  adHeight = 250,
  onProgress = () => {},
  injectionOptions = null
) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    const viewport = device === 'mobile' ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT;
    const ua = device === 'mobile' ? MOBILE_UA : DESKTOP_UA;

    await page.setViewport(viewport);
    await page.setUserAgent(ua);

    // Block heavy resources but keep ads-related stuff for slot detection
    await page.setRequestInterception(true);
    page.on('request', req => {
      const type = req.resourceType();
      if (['media', 'font'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    onProgress('Loading page...');

    const finalUrl = await navigateWithFallbacks(page, url);

    onProgress('Handling consent banners...');

    const consentHandled = await handleConsent(page, finalUrl);

    onProgress('Scrolling page...');

    // Limit scroll depth in production to avoid loading very long pages into memory.
    await autoScroll(page, DEFAULT_SCROLL_SCAN_PX);
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 1000));

    onProgress('Detecting ad positions...');

    let slotDetection = await detectAdSlots(page, adWidth, adHeight, device, { returnCandidates: true });

    // Second pass deeper in-page when top-of-page pass finds no suitable slot.
    if (!slotDetection.bestSlot) {
      await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.2));
      await new Promise(r => setTimeout(r, 500));
      const secondPass = await detectAdSlots(page, adWidth, adHeight, device, { returnCandidates: true });
      await page.evaluate(() => window.scrollTo(0, 0));
      await new Promise(r => setTimeout(r, 300));

      if (secondPass.bestSlot) {
        const merged = [...(slotDetection.candidates || []), ...(secondPass.candidates || [])];
        const deduped = new Map();
        for (const candidate of merged) {
          const current = deduped.get(candidate.slotId);
          if (!current || (candidate.score || 0) > (current.score || 0)) {
            deduped.set(candidate.slotId, candidate);
          }
        }
        slotDetection = {
          bestSlot: secondPass.bestSlot,
          candidates: [...deduped.values()].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 8),
        };
      }
    }

    let detectedSlot = slotDetection.bestSlot;
    let slotCandidates = slotDetection.candidates || [];

    if (injectionOptions?.slotId && slotCandidates.length > 0) {
      const selectedCandidate = slotCandidates.find((candidate) => candidate.slotId === injectionOptions.slotId);
      if (selectedCandidate) {
        detectedSlot = selectedCandidate;
        slotCandidates = [
          selectedCandidate,
          ...slotCandidates.filter((candidate) => candidate.slotId !== injectionOptions.slotId),
        ];
      }
    }
    const rawDimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    }));
    const baseReferenceY = detectedSlot?.y ?? Math.floor(rawDimensions.viewportHeight * 0.6);
    const baseReferenceHeight = detectedSlot?.slotHeight ?? adHeight;
    const baseScreenshotOptions = buildPageScreenshotOptions(rawDimensions, viewport, baseReferenceY, baseReferenceHeight);
    const baseScreenshot = await page.screenshot(baseScreenshotOptions);

    let domInjection = { succeeded: false, reason: 'not-attempted' };
    let preparedCreative = injectionOptions
      ? {
          adTag: injectionOptions.adTag || null,
          adImageBuffer: injectionOptions.adImageBuffer || null,
          adTagRendered: false,
          adTagType: null,
          renderStrategy: injectionOptions.adImageBuffer ? 'image-upload' : null,
          renderConfidence: injectionOptions.adImageBuffer ? 'high' : null,
          diagnostics: null,
        }
      : null;
    if (injectionOptions) {
      // Pre-render ad tags to a static image before DOM injection.
      // Ad libraries (e.g. Adition) use document.write() which breaks inside
      // srcdoc iframes because the document is already fully parsed.
      // Rendering to PNG first via a data-URL page avoids this entirely.
      const effectiveOptions = { ...injectionOptions };
      if (effectiveOptions.adTag && !effectiveOptions.adImageBuffer) {
        onProgress('Rendering ad tag...');
        const renderedCreative = await renderAdTag(effectiveOptions.adTag, adWidth, adHeight);
        if (renderedCreative?.imageBuffer) {
          effectiveOptions.adImageBuffer = renderedCreative.imageBuffer;
          effectiveOptions.adTag = null;
          preparedCreative = {
            adTag: null,
            adImageBuffer: renderedCreative.imageBuffer,
            adTagRendered: true,
            adTagType: renderedCreative.adTagType,
            renderStrategy: renderedCreative.renderStrategy,
            renderConfidence: renderedCreative.renderConfidence,
            diagnostics: renderedCreative.diagnostics || null,
          };
        }
      }

      if (!preparedCreative) {
        preparedCreative = {
          adTag: effectiveOptions.adTag || null,
          adImageBuffer: effectiveOptions.adImageBuffer || null,
          adTagRendered: false,
          adTagType: null,
          renderStrategy: effectiveOptions.adImageBuffer ? 'image-upload' : null,
          renderConfidence: effectiveOptions.adImageBuffer ? 'high' : null,
          diagnostics: null,
        };
      }

      onProgress('Injecting ad creative...');
      domInjection = await injectCreativeIntoDetectedSlot(page, detectedSlot, {
        ...effectiveOptions,
        adWidth,
        adHeight,
        device,
        slotCandidates,
      });
    }

    onProgress('Taking screenshot...');

    const referenceY = domInjection.succeeded
      ? domInjection.y
      : detectedSlot?.y ?? Math.floor(rawDimensions.viewportHeight * 0.6);
    const referenceHeight = domInjection.succeeded
      ? domInjection.slotHeight
      : detectedSlot?.slotHeight ?? adHeight;

    const screenshotOptions = buildPageScreenshotOptions(rawDimensions, viewport, referenceY, referenceHeight);
    const screenshot = await page.screenshot(screenshotOptions);

    const dimensions = {
      ...rawDimensions,
      fullHeight: rawDimensions.height,
      height: screenshotOptions.clip.height,
      truncated: screenshotOptions.clip.height < rawDimensions.height,
      viewportCropped: true,
    };

    return {
      baseScreenshot: Buffer.from(baseScreenshot),
      screenshot: Buffer.from(screenshot),
      dimensions,
      consentHandled,
      finalUrl,
      device,
      detectedSlot,
      slotCandidates,
      domInjection,
      preparedCreative,
    };
  } finally {
    try {
      await page.close();
    } catch (err) {
      console.warn('Failed to close capture page cleanly:', err?.message || err);
    }
  }
}

/**
 * Render an ad tag in an isolated Puppeteer page.
 * Returns a structured response with render diagnostics for downstream placement logic.
 */
async function renderAdTag(adTag, width, height) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  const adTagType = classifyAdTag(adTag);
  const wrappedHtml = buildWrappedAdHtml(adTag, width, height);

  const consoleErrors = [];
  const pendingRequests = new Set();
  const requestIds = new WeakMap();
  let requestCounter = 0;

  const getRequestId = (request) => {
    if (!requestIds.has(request)) {
      requestIds.set(request, `${++requestCounter}`);
    }
    return requestIds.get(request);
  };

  const diagnostics = {
    consoleErrors,
    getPendingRequests: () => pendingRequests.size,
  };

  const clearRequest = (request) => {
    const requestId = requestIds.get(request);
    if (requestId) {
      pendingRequests.delete(requestId);
    }
  };

  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(error?.message || String(error));
  });
  page.on('request', (request) => {
    const requestId = getRequestId(request);
    pendingRequests.add(requestId);
    const type = request.resourceType();
    if (['media', 'font'].includes(type)) {
      clearRequest(request);
      request.abort();
      return;
    }
    request.continue();
  });
  page.on('requestfinished', clearRequest);
  page.on('requestfailed', clearRequest);

  try {
    await page.setViewport({ width: width + 20, height: height + 20 });
    await page.setRequestInterception(true);
    await installTagStrategyStubs(page, adTagType);

    let renderStrategy = 'plain-html';

    if (adTagType === 'video') {
      console.log('Ad tag classified as video, returning placeholder');
      return {
        imageBuffer: await createTagPlaceholder(width, height, 'Video Ad'),
        adTagType,
        renderStrategy: 'video-placeholder',
        renderConfidence: 'high',
        diagnostics: {
          pendingRequests: 0,
          consoleErrors: [],
        },
      };
    }

    if (adTagType === 'iframe') {
      const srcMatch = adTag.trim().match(/<iframe[^>]+src\s*=\s*["']([^"']+)["']/i);
      if (srcMatch?.[1]) {
        renderStrategy = 'iframe-direct';
        console.log(`Ad tag classified as iframe; navigating directly: ${srcMatch[1].slice(0, 120)}`);
        await page.goto(srcMatch[1], {
          waitUntil: 'domcontentloaded',
          timeout: ADTAG_NAV_TIMEOUT_MS,
        });
      } else {
        renderStrategy = 'iframe-fallback-html';
        await page.setContent(wrappedHtml, {
          waitUntil: 'domcontentloaded',
          timeout: ADTAG_NAV_TIMEOUT_MS,
        });
      }
    } else if (adTagType === 'gpt') {
      renderStrategy = 'gpt-stub';
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(wrappedHtml)}`;
      await page.goto(dataUrl, {
        waitUntil: 'networkidle0',
        timeout: Math.min(6000, ADTAG_NAV_TIMEOUT_MS),
      });
    } else if (adTagType === 'docwrite') {
      renderStrategy = 'document-write';
      await page.goto('about:blank', {
        waitUntil: 'domcontentloaded',
        timeout: ADTAG_NAV_TIMEOUT_MS,
      });
      await page.evaluate((html) => {
        document.open();
        document.write(html);
        document.close();
      }, wrappedHtml);
    } else if (adTagType === 'safeframe') {
      renderStrategy = 'safeframe-stub';
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(wrappedHtml)}`;
      await page.goto(dataUrl, {
        waitUntil: 'domcontentloaded',
        timeout: ADTAG_NAV_TIMEOUT_MS,
      });
    } else if (adTagType === 'generic-script') {
      renderStrategy = 'data-url-script';
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(wrappedHtml)}`;
      await page.goto(dataUrl, {
        waitUntil: 'domcontentloaded',
        timeout: ADTAG_NAV_TIMEOUT_MS,
      });
    } else {
      renderStrategy = 'plain-html';
      await page.setContent(wrappedHtml, {
        waitUntil: 'domcontentloaded',
        timeout: ADTAG_NAV_TIMEOUT_MS,
      });
    }

    if (adTagType !== 'docwrite') {
      await new Promise((resolve) => setTimeout(resolve, Math.min(250, ADTAG_WAIT_MS)));
    }

    const verification = await waitForCreativeRender(page, width, height, diagnostics);
    const imageBuffer = Buffer.from(await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width, height },
    }));

    const screenshotUniformity = await analyzeImageUniformity(imageBuffer);
    const renderConfidence = screenshotUniformity.nearWhite && verification.renderConfidence === 'high'
      ? 'low'
      : verification.renderConfidence;

    console.log(`Ad tag classified as ${adTagType}, strategy=${renderStrategy}, confidence=${renderConfidence}`);

    return {
      imageBuffer,
      adTagType,
      renderStrategy,
      renderConfidence,
      diagnostics: {
        ...verification.diagnostics,
        screenshotUniformity,
      },
    };
  } catch (err) {
    console.error('Ad tag rendering failed:', err.message);
    return null;
  } finally {
    try {
      await page.close();
    } catch (err) {
      console.warn('Failed to close adtag page cleanly:', err?.message || err);
    }
  }
}

/**
 * Auto-scroll the page to trigger lazy-loaded content.
 */
async function autoScroll(page, maxScrollPx = 2400) {
  await page.evaluate(async (maxPx) => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        const scrollHeight = document.documentElement.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight || totalHeight >= maxPx) {
          clearInterval(timer);
          resolve();
        }
      }, 120);
    });
  }, maxScrollPx);
}

async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

module.exports = {
  captureWebsite,
  renderAdTag,
  closeBrowser,
  getBrowser,
  detectAdSlots,
  injectCreativeIntoDetectedSlot,
};
