/**
 * Puppeteer screenshot engine for capturing publisher websites.
 * Also detects existing ad slots on the page for realistic ad placement.
 */

const puppeteer = require('puppeteer');
const sharp = require('sharp');
const { handleConsent, setConsentCookies } = require('./consent-handler');
const { FAILURE_CODES } = require('./failure-codes');
const { injectCreativeIntoDetectedSlot } = require('./placement');
const { verifyFinalCreative } = require('./image-verification');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DESKTOP_VIEWPORT = {
  width: Number.parseInt(process.env.CAPTURE_VIEWPORT_WIDTH, 10) || 1366,
  height: Number.parseInt(process.env.CAPTURE_VIEWPORT_HEIGHT, 10) || 900,
};
const MOBILE_VIEWPORT = { width: 390, height: 844, isMobile: true, hasTouch: true };

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const MAX_CAPTURE_HEIGHT = Number.parseInt(
  process.env.CAPTURE_MAX_HEIGHT,
  10
) || 3400;
const DEFAULT_SCROLL_SCAN_PX = Number.parseInt(
  process.env.CAPTURE_MAX_SCROLL_PX,
  10
) || 1600;
const GENERIC_SLOT_SCAN_LIMIT = Number.parseInt(
  process.env.SLOT_SCAN_LIMIT,
  10
) || 900;
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
const BROWSER_RECYCLE_EVERY = Number.parseInt(
  process.env.BROWSER_RECYCLE_EVERY || '',
  10
) || (IS_PRODUCTION ? 1 : 0);

let browserInstance = null;
let browserLaunchPromise = null;
let activeBrowserJobs = 0;
let completedBrowserJobs = 0;

function isTallFormat(width, height) {
  return height / Math.max(1, width) >= 1.7;
}

function isWideFormat(width, height) {
  return width / Math.max(1, height) >= 1.7;
}

function getEffectiveCaptureHeightLimit(adWidth, adHeight) {
  if (IS_PRODUCTION && isTallFormat(adWidth, adHeight)) {
    return Math.min(MAX_CAPTURE_HEIGHT, 2600);
  }
  return MAX_CAPTURE_HEIGHT;
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

function summarizeReasons(items = []) {
  return items.reduce((acc, item) => {
    const reasons = item.rejectionReasons || item.reasons || [];
    for (const reason of reasons) {
      acc[reason] = (acc[reason] || 0) + 1;
    }
    return acc;
  }, {});
}

async function getBrowser() {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  if (browserLaunchPromise) return browserLaunchPromise;

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

  browserLaunchPromise = puppeteer.launch({
    headless: 'new',
    args: launchArgs,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    timeout: 30000,
  });
  try { browserInstance = await browserLaunchPromise; }
  finally { browserLaunchPromise = null; }

  browserInstance.on('disconnected', () => {
    browserInstance = null;
  });

  return browserInstance;
}

async function openBrowserJob(signal) {
  signal?.throwIfAborted();
  const browser = await getBrowser();
  signal?.throwIfAborted();
  const context = await browser.createBrowserContext();
  const onAbort = () => { context.close().catch(() => {}); };
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();
  let page;
  try { page = await context.newPage(); signal?.throwIfAborted(); }
  catch (error) { signal?.removeEventListener('abort', onAbort); await context.close().catch(() => {}); throw error; }
  beginBrowserJob();
  return { page, async release() {
    signal?.removeEventListener('abort', onAbort);
    await context.close().catch(() => {});
    await endBrowserJob();
  } };
}

async function waitForPageAssets(page) {
  await page.evaluate(async () => {
    const visibleImages = [...document.images].filter(img => {
      const rect = img.getBoundingClientRect();
      return rect.bottom >= 0 && rect.top < innerHeight && rect.width > 0;
    });
    await Promise.race([
      Promise.allSettled([document.fonts.ready, ...visibleImages.map(img => img.decode())]),
      new Promise(resolve => setTimeout(resolve, 1500)),
    ]);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function readPublisherState(page) {
  return page.evaluate(() => {
    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const images = [...document.images].filter(img => img.complete && img.naturalWidth > 0).length;
    const headings = document.querySelectorAll('h1,h2,h3').length;
    const challenge = text.length < 1500 && /access denied|verify you are human|checking your browser|just a moment|enable javascript and cookies/i.test(text);
    return { textLength: text.length, images, headings, usable: !challenge && (text.length >= 120 || (headings > 0 && images > 0)) };
  });
}

function beginBrowserJob() {
  activeBrowserJobs += 1;
}

async function endBrowserJob() {
  activeBrowserJobs = Math.max(0, activeBrowserJobs - 1);
  completedBrowserJobs += 1;

  if (
    BROWSER_RECYCLE_EVERY > 0 &&
    completedBrowserJobs >= BROWSER_RECYCLE_EVERY &&
    activeBrowserJobs === 0 &&
    browserInstance
  ) {
    // A caller may hold a page outside the managed capture contexts.
    const remainingPages = await browserInstance.pages();
    if (remainingPages.length > 1 || remainingPages.some(page => page.url() !== 'about:blank')) return;
    console.log(`Recycling browser after ${completedBrowserJobs} completed jobs`);
    await closeBrowser();
    completedBrowserJobs = 0;
  }
}

/**
 * Detect existing ad slots/iframes and return ranked candidates.
 */
async function detectAdSlots(page, targetWidth, targetHeight, device, options = {}) {
  const maxCandidateY = options.maxCandidateY || Math.min(MAX_CAPTURE_HEIGHT - targetHeight - 40, device === 'mobile' ? 2800 : 3200);
  const scanLimit = options.scanLimit || GENERIC_SLOT_SCAN_LIMIT;
  const slots = await page.evaluate((tw, th, maxScanned) => {
    const results = [];
    const slotIds = new WeakMap();
    window.__adframeSlotOwners ||= new Map();
    const getSlotId = (el) => {
      if (slotIds.has(el)) return slotIds.get(el);
      let id = el.getAttribute('data-adframe-slot-id');
      if (!id || (window.__adframeSlotOwners.has(id) && window.__adframeSlotOwners.get(id) !== el)) {
        if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
          id = `adf-id-${encodeURIComponent(el.id)}`;
        } else {
          const path = [];
          let node = el;
          while (node && node !== document.body) {
            const siblings = [...node.parentElement.children].filter(child => child.tagName === node.tagName);
            path.unshift(`${node.tagName.toLowerCase()}:${siblings.indexOf(node) + 1}`);
            node = node.parentElement;
          }
          id = `adf-path-${path.join('/')}`;
        }
        while (window.__adframeSlotOwners.has(id) && window.__adframeSlotOwners.get(id) !== el) id += '-new';
        el.setAttribute('data-adframe-slot-id', id);
      }
      window.__adframeSlotOwners.set(id, el);
      slotIds.set(el, id);
      return id;
    };
    const adToken = /(?:^|[\s_-])(?:ads?|advert(?:isement|ising)?|gpt|banner|sponsor(?:ed)?|billboard|leaderboard|skyscraper|rectangle|adslot|iqadtile|adtile)(?:$|[\s_-]|\d)/i;
    const hasAdEvidence = el => {
      if (el.matches('[data-ad], [data-ad-slot], [data-google-query-id]')) return true;
      if (adToken.test(`${el.id || ''} ${String(el.className || '')}`)) return true;
      if (el.tagName === 'IFRAME') {
        try {
          const host = new URL(el.src || el.dataset.src, location.href).hostname;
          return /(^|\.)(doubleclick\.net|googlesyndication\.com|amazon-adsystem\.com|flashtalking\.com|adform\.net|adition\.com)$/.test(host);
        } catch { return false; }
      }
      return [...el.querySelectorAll('iframe')].some(frame => hasAdEvidence(frame));
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

    const hasStickyAncestor = (el) => {
      let current = el.parentElement;
      let depth = 0;
      while (current && depth < 5) {
        const style = getComputedStyle(current);
        if (style.position === 'fixed' || style.position === 'sticky') return true;
        current = current.parentElement;
        depth += 1;
      }
      return false;
    };

    const pushSlot = (el, rect, type, isAdLikely) => {
      if (!isVisible(el, rect)) return;
      if (rect.width < 50 || rect.height < 30) return;

      const style = getComputedStyle(el);
      const signature = `${el.id || ''} ${String(el.className || '')}`.toLowerCase();
      const text = ((el.textContent || '') + '').replace(/\s+/g, ' ').trim();
      const textLength = Math.min(500, text.length);
      const headingCount = el.querySelectorAll('h1, h2, h3, h4').length;
      const paragraphCount = el.querySelectorAll('p').length;
      const hasArticleSignals =
        el.matches('article, main, [role="main"]') ||
        Boolean(el.querySelector('article, time, header h1, header h2'));
      const insideArticle = Boolean(el.closest('article, main, [role="main"]'));
      const insideHeader = Boolean(el.closest('header, [role="banner"], nav, [role="navigation"]'));
      const insideFooter = Boolean(el.closest('footer, [role="contentinfo"]'));
      const insideSidebar = Boolean(
        el.closest('aside, [class*="sidebar"], [id*="sidebar"], [class*="rail"], [id*="rail"], [class*="column-right"], [id*="column-right"]')
      );
      const isFixedOrSticky = style.position === 'fixed' || style.position === 'sticky';
      const iframeCount = (el.tagName === 'IFRAME' ? 1 : 0) + el.querySelectorAll('iframe').length;
      const visualChildCount = iframeCount + el.querySelectorAll('img, picture, svg, canvas, video').length;
      const hasAdHints = hasAdEvidence(el);
      const looksLikePlaceholder = textLength < 40 && headingCount === 0 && paragraphCount === 0 && visualChildCount <= 1;

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
        insideArticle,
        insideHeader,
        insideFooter,
        insideSidebar,
        isFixedOrSticky,
        hasStickyAncestor: hasStickyAncestor(el),
        iframeCount,
        visualChildCount,
        hasAdHints,
        looksLikePlaceholder,
      });
    };

    // 1) Iframes are strong ad indicators.
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      const rect = iframe.getBoundingClientRect();
      const isAdLikely = hasAdEvidence(iframe);
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
          pushSlot(el, rect, 'div', hasAdEvidence(el));
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

      const hasAdHints = hasAdEvidence(el);

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
  const maxTrustedY = device === 'mobile' ? 2400 : maxCandidateY;

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
    const widthScale = s.width / Math.max(1, targetWidth);
    const heightScale = s.height / Math.max(1, targetHeight);
    const aspectScaleDelta = Math.abs((ratio / Math.max(0.01, targetRatio)) - 1);

    let score = 0;
    const reasons = [];
    score += widthMatch * 35;
    score += heightMatch * 35;
    score += ratioMatch * 20;
    score += areaMatch * 10;
    score += s.viewportRatio * 15;

    if (s.isAd) {
      score += 28;
      reasons.push('ad-signals');
    }
    if (s.hasAdHints) {
      score += 16;
      reasons.push('selector-hints');
    }
    if (s.type === 'gpt') {
      score += 18;
      reasons.push('gpt-slot');
    } else if (s.type === 'iframe') {
      score += 14;
      reasons.push('iframe-slot');
    } else if (s.type === 'size-match') {
      score += 6;
      reasons.push('size-match');
    }

    if (s.insideSidebar) {
      score += 18;
      reasons.push('sidebar');
    }
    if (s.iframeCount > 0) {
      score += 10;
      reasons.push('nested-iframe');
    }
    if (s.looksLikePlaceholder) {
      score += 8;
      reasons.push('placeholder-like');
    }

    const isNearExactSize =
      widthScale >= 0.9 && widthScale <= 1.12 &&
      heightScale >= 0.9 && heightScale <= 1.12 &&
      aspectScaleDelta <= 0.12;
    const isCompatibleSize =
      widthScale >= 0.75 && widthScale <= 1.35 &&
      heightScale >= 0.75 && heightScale <= 1.35 &&
      aspectScaleDelta <= 0.22;
    const isOversizedContainer =
      widthScale >= 0.85 && widthScale <= 1.2 &&
      heightScale > 1.35 && heightScale <= 2.2;
    const hasHardSizeMismatch =
      widthScale < 0.7 || widthScale > 1.45 ||
      heightScale < 0.7 || heightScale > 1.45 ||
      aspectScaleDelta > 0.28;

    if (isNearExactSize) {
      score += 26;
      reasons.push('near-exact-size');
    } else if (isCompatibleSize) {
      score += 10;
      reasons.push('compatible-size');
    } else if (isOversizedContainer) {
      score -= 30;
      reasons.push('oversized-slot');
    }

    if (s.textLength > 80) score -= 25;
    if (s.textLength > 220) score -= 40;
    if (s.headingCount > 0) score -= 30;
    if (s.paragraphCount > 2) score -= 15;
    if (s.hasArticleSignals) score -= 45;
    if (s.visualChildCount > 4 && !s.isAd) score -= 12;

    if (s.insideHeader) {
      score -= 48;
      reasons.push('header-penalty');
    }
    if (s.insideFooter) {
      score -= 32;
      reasons.push('footer-penalty');
    }
    if (s.isFixedOrSticky) {
      score -= 42;
      reasons.push('sticky-slot');
    }
    if (s.hasStickyAncestor) {
      score -= 28;
      reasons.push('sticky-ancestor');
    }
    if (s.insideArticle && !s.isAd && !s.hasAdHints) {
      score -= 40;
      reasons.push('editorial-context');
    }

    if (!s.isAd && s.type === 'iframe') score -= 20;
    if (!s.isAd && s.type === 'div') score -= 50;

    if (s.y >= 60 && s.y < maxTrustedY) score += 10;
    if (s.y > 6500) score -= 25;
    if (area < targetArea * 0.5) score -= 30;
    if (area > targetArea * 4) score -= 18;
    if (hasHardSizeMismatch) {
      score -= 55;
      reasons.push('dimension-mismatch');
    }

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

    const roundedScore = Math.round(score);
    const structuralReject = (
      s.insideHeader ||
      s.isFixedOrSticky ||
      s.hasStickyAncestor ||
      (s.hasArticleSignals || s.headingCount > 0 || s.paragraphCount > 0 || (!s.isAd && s.insideArticle))
    );
    const dimensionReject = hasHardSizeMismatch || isOversizedContainer || s.width < targetWidth - 1 || s.height < targetHeight - 1;

    let confidence = 'low';
    if (roundedScore >= 105) confidence = 'high';
    else if (roundedScore >= 85) confidence = 'medium';

    const rejectionReasons = [];
    if (roundedScore < 65) rejectionReasons.push('low-score');
    if (!s.isAd && s.type !== 'iframe' && s.type !== 'gpt') rejectionReasons.push('weak-ad-evidence');
    if (!isFormatCompatibleSlot(s, targetWidth, targetHeight, device)) rejectionReasons.push('format-incompatible');
    if (structuralReject) rejectionReasons.push('unsafe-structure');
    if (dimensionReject) rejectionReasons.push('dimension-reject');
    if (s.y < 0 || s.y > maxCandidateY) rejectionReasons.push('outside-capture-range');

    return {
      ...s,
      score: roundedScore,
      confidence,
      structuralReject,
      dimensionReject,
      reasons,
      rejectionReasons,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const rejectedCandidates = scored
    .filter((c) => c.rejectionReasons.length > 0)
    .slice(0, 12)
    .map((c) => ({
      slotId: c.slotId,
      score: c.score,
      type: c.type,
      x: Math.round(c.x),
      y: Math.round(c.y),
      slotWidth: Math.round(c.width),
      slotHeight: Math.round(c.height),
      reasons: c.rejectionReasons,
    }));
  const candidates = scored
    .filter((c) => c.score >= 65)
    .filter((c) => c.isAd)
    .filter((c) => isFormatCompatibleSlot(c, targetWidth, targetHeight, device))
    .filter((c) => !c.structuralReject)
    .filter((c) => !c.dimensionReject)
    .filter((c) => c.y >= 0 && c.y <= maxCandidateY)
    .slice(0, 8)
    .map((c) => ({
      slotId: c.slotId,
      x: Math.round(c.x),
      y: Math.round(c.y),
      slotWidth: Math.round(c.width),
      slotHeight: Math.round(c.height),
      score: c.score,
      confidence: c.confidence,
      type: c.type,
      isAd: c.isAd,
      reasons: c.reasons.slice(0, 4),
    }));

  const best = candidates.find((candidate) => candidate.confidence !== 'low') || null;

  if (best) {
    console.log(
      `Detected ad slot: ${best.type} at (${best.x}, ${best.y}) size ${best.slotWidth}x${best.slotHeight}, score=${best.score}, confidence=${best.confidence}`
    );
  } else if (candidates[0]) {
    console.log(
      `No trusted ad slot found; best weak candidate score=${candidates[0].score}, confidence=${candidates[0].confidence}`
    );
  }

  if (options.returnCandidates) {
    return {
      bestSlot: best,
      candidates,
      rejectedCandidates,
      rejectionSummary: summarizeReasons(rejectedCandidates),
      weakBestScore: scored[0]?.score ?? null,
    };
  }

  return best;
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
      imageCount: [...document.images].filter(img => img.complete && img.naturalWidth > 0).length + document.querySelectorAll('svg,canvas').length,
      textLength: ((document.body?.innerText || '') + '').replace(/\s+/g, ' ').trim().length,
    };
  });
}

async function waitForCreativeRender(page, width, height, diagnostics) {
  const deadline = Date.now() + ADTAG_RENDER_MAX_WAIT_MS;
  const centerClip = { x: 0, y: 0, width, height };

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

function buildPageScreenshotOptions(rawDimensions, viewport, referenceY, referenceHeight, maxCaptureHeight = MAX_CAPTURE_HEIGHT) {
  const desiredBottom = Math.max(
    rawDimensions.viewportHeight + 100,
    Math.round(referenceY + referenceHeight + 260)
  );
  const clipHeight = Math.max(
    Math.min(rawDimensions.viewportHeight, maxCaptureHeight),
    Math.min(rawDimensions.height, Math.min(maxCaptureHeight, desiredBottom))
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

function getErrorCode(err) {
  const message = err?.message || '';
  if (isTimeoutError(err)) return FAILURE_CODES.MOCKUP_TIMEOUT;
  if (isSslError(err)) return FAILURE_CODES.SSL_ERROR;
  if (isRetryableNetworkError(err)) return FAILURE_CODES.CAPTURE_NAVIGATION_FAILED;
  return err?.code || FAILURE_CODES.UNKNOWN;
}

function createCaptureDiagnostics(url, device, adWidth, adHeight) {
  const startedAt = Date.now();
  return {
    requestedUrl: url,
    device,
    adSize: `${adWidth}x${adHeight}`,
    startedAt: new Date(startedAt).toISOString(),
    timingsMs: {},
    navigationAttempts: [],
    consent: null,
    slotDetection: null,
    dimensions: null,
    screenshot: null,
    domInjection: null,
  };
}

function finishTiming(diagnostics, key, startedAt) {
  if (!diagnostics?.timingsMs) return;
  diagnostics.timingsMs[key] = Date.now() - startedAt;
}

function buildNavigationCandidates(initialUrl) {
  try {
    const parsed = new URL(initialUrl);
    const hostname = parsed.hostname;
    if (hostname === 'localhost' || hostname.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return [initialUrl];
    const bareHost = hostname.replace(/^www\./i, '');
    const hostWithWww = bareHost.startsWith('www.') ? bareHost : `www.${bareHost}`;
    const protocol = parsed.protocol === 'http:' ? 'http:' : 'https:';

    const basePath = `${parsed.pathname || '/'}${parsed.search || ''}${parsed.hash || ''}`;
    const candidates = [];

    const pushUrl = (proto, host) => {
      if (!host) return;
      const value = `${proto}//${host}${parsed.port ? `:${parsed.port}` : ''}${basePath}`;
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
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 22000 });
  if (response && response.status() >= 400) {
    const error = new Error(`Publisher returned HTTP ${response.status()}`);
    error.code = FAILURE_CODES.CAPTURE_NAVIGATION_FAILED;
    throw error;
  }
  await waitForPageAssets(page);
  return page.url();
}

async function navigateWithFallbacks(page, initialUrl, diagnostics = null) {
  const candidates = buildNavigationCandidates(initialUrl);
  let lastError = null;

  for (const candidateUrl of candidates) {
    const attempt = {
      url: candidateUrl,
      startedAt: new Date().toISOString(),
    };
    const startedAt = Date.now();
    try {
      await setConsentCookies(page, candidateUrl);
      const finalUrl = await navigatePage(page, candidateUrl);
      attempt.status = 'ok';
      attempt.finalUrl = finalUrl;
      attempt.durationMs = Date.now() - startedAt;
      diagnostics?.navigationAttempts?.push(attempt);
      return finalUrl;
    } catch (err) {
      lastError = err;
      attempt.status = 'failed';
      attempt.failureCode = getErrorCode(err);
      attempt.message = err?.message || String(err);
      attempt.durationMs = Date.now() - startedAt;
      diagnostics?.navigationAttempts?.push(attempt);
      const canRetry = candidateUrl !== candidates[candidates.length - 1];
      if ((isSslError(err) || isRetryableNetworkError(err) || isTimeoutError(err)) && canRetry) {
        continue;
      }
      err.code = err.code || FAILURE_CODES.CAPTURE_NAVIGATION_FAILED;
      throw err;
    }
  }

  const error = lastError || new Error(`Failed to navigate to ${initialUrl}`);
  error.code = error.code || FAILURE_CODES.CAPTURE_NAVIGATION_FAILED;
  throw error;
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
  const signal = injectionOptions?.signal;
  const job = await openBrowserJob(signal);
  const { page } = job;
  const diagnostics = createCaptureDiagnostics(url, device, adWidth, adHeight);

  try {
    const viewport = device === 'mobile' ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT;
    const ua = device === 'mobile' ? MOBILE_UA : DESKTOP_UA;
    const captureHeightLimit = getEffectiveCaptureHeightLimit(adWidth, adHeight);

    await page.setViewport(viewport);
    await page.setUserAgent(ua);

    await page.setRequestInterception(true);
    page.on('request', req => {
      const action = req.resourceType() === 'media' ? req.abort() : req.continue();
      action.catch(() => {});
    });

    onProgress('Loading page...');

    let phaseStartedAt = Date.now();
    const finalUrl = await navigateWithFallbacks(page, url, diagnostics);
    finishTiming(diagnostics, 'navigation', phaseStartedAt);

    onProgress('Handling consent banners...');

    phaseStartedAt = Date.now();
    const beforeConsent = await readPublisherState(page);
    const consentHandled = await handleConsent(page, finalUrl);
    const pageState = await readPublisherState(page);
    if (!pageState.usable || (beforeConsent.textLength > 500 && pageState.textLength < beforeConsent.textLength * 0.1)) {
      const error = new Error('The publisher page is empty or blocked after consent handling. Try another publisher.');
      error.code = FAILURE_CODES.CAPTURE_CONTENT_MISSING;
      throw error;
    }
    diagnostics.pageState = pageState;
    diagnostics.consent = { handled: Boolean(consentHandled), contentRetained: pageState.usable };
    finishTiming(diagnostics, 'consent', phaseStartedAt);

    onProgress('Scrolling page...');

    // Limit scroll depth in production to avoid loading very long pages into memory.
    phaseStartedAt = Date.now();
    await autoScroll(page, DEFAULT_SCROLL_SCAN_PX);
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForPageAssets(page);
    finishTiming(diagnostics, 'scroll', phaseStartedAt);

    onProgress('Detecting ad positions...');

    phaseStartedAt = Date.now();
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
          rejectedCandidates: [
            ...(slotDetection.rejectedCandidates || []),
            ...(secondPass.rejectedCandidates || []),
          ].slice(0, 12),
          rejectionSummary: summarizeReasons([
            ...(slotDetection.rejectedCandidates || []),
            ...(secondPass.rejectedCandidates || []),
          ]),
          weakBestScore: Math.max(slotDetection.weakBestScore || 0, secondPass.weakBestScore || 0),
        };
      }
    }

    let detectedSlot = slotDetection.bestSlot;
    let slotCandidates = slotDetection.candidates || [];
    diagnostics.slotDetection = {
      bestSlotId: detectedSlot?.slotId || null,
      candidateCount: slotCandidates.length,
      rejectedCount: slotDetection.rejectedCandidates?.length || 0,
      rejectionSummary: slotDetection.rejectionSummary || {},
      weakBestScore: slotDetection.weakBestScore ?? null,
    };
    finishTiming(diagnostics, 'slotDetection', phaseStartedAt);

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
    let rawDimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    }));
    diagnostics.dimensions = { ...rawDimensions };
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
        phaseStartedAt = Date.now();
        const renderedCreative = await renderAdTag(effectiveOptions.adTag, adWidth, adHeight, { signal });
        if (!renderedCreative?.imageBuffer || renderedCreative.renderConfidence !== 'high') {
          const error = new Error('The ad tag did not produce a verifiable creative. Upload an image or try a different tag.');
          error.code = FAILURE_CODES.ADTAG_RENDER_FAILED;
          throw error;
        }
        finishTiming(diagnostics, 'adTagRender', phaseStartedAt);
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
      phaseStartedAt = Date.now();
      domInjection = await injectCreativeIntoDetectedSlot(page, detectedSlot, {
        ...effectiveOptions,
        adWidth,
        adHeight,
        device,
        slotCandidates,
        captureHeightLimit,
        selectedSlotId: injectionOptions.slotId,
        signal,
      });
      diagnostics.domInjection = {
        succeeded: Boolean(domInjection.succeeded),
        reason: domInjection.reason || null,
        attempts: domInjection.attempts || 0,
        selectedSlotId: domInjection.selectedSlotId || null,
        rejectedCandidates: domInjection.rejectedCandidates || [],
        rejectionSummary: domInjection.rejectionSummary || summarizeReasons(domInjection.rejectedCandidates || []),
      };
      finishTiming(diagnostics, 'domInjection', phaseStartedAt);
    }

    signal?.throwIfAborted();
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForPageAssets(page);
    rawDimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, viewportHeight: innerHeight }));
    if (domInjection.succeeded) {
      const finalPosition = await page.evaluate(id => {
        const creative = document.querySelector(`[data-adframe-slot-id="${CSS.escape(id)}"] [data-adframe-creative]`);
        if (!creative) return null;
        const rect = creative.getBoundingClientRect();
        return { x: Math.round(rect.left + scrollX), y: Math.round(rect.top + scrollY), width: Math.round(rect.width), height: Math.round(rect.height) };
      }, domInjection.selectedSlotId);
      if (!finalPosition || finalPosition.width !== adWidth || finalPosition.height !== adHeight) {
        const error = new Error('The publisher changed the creative placement during capture. Try another publisher.');
        error.code = FAILURE_CODES.OUTPUT_QUALITY_FAILED;
        throw error;
      }
      Object.assign(domInjection, finalPosition);
    }
    onProgress('Taking screenshot...');
    phaseStartedAt = Date.now();

    const referenceY = domInjection.succeeded
      ? domInjection.y
      : detectedSlot?.y ?? Math.floor(rawDimensions.viewportHeight * 0.6);
    const referenceHeight = domInjection.succeeded
      ? domInjection.slotHeight
      : detectedSlot?.slotHeight ?? adHeight;

    const screenshotOptions = buildPageScreenshotOptions(
      rawDimensions,
      viewport,
      referenceY,
      referenceHeight,
      captureHeightLimit
    );
    const screenshot = await page.screenshot(screenshotOptions);
    if (domInjection.succeeded) {
      const verification = await verifyFinalCreative(Buffer.from(screenshot), preparedCreative.adImageBuffer, domInjection, adWidth, adHeight);
      diagnostics.finalCreativeVerification = verification;
      if (!verification.passed) {
        const error = new Error('The creative is not fully visible in the final screenshot. Try another placement or publisher.');
        error.code = FAILURE_CODES.OUTPUT_QUALITY_FAILED;
        throw error;
      }
    }
    signal?.throwIfAborted();
    finishTiming(diagnostics, 'screenshot', phaseStartedAt);

    const dimensions = {
      ...rawDimensions,
      fullHeight: rawDimensions.height,
      height: screenshotOptions.clip.height,
      truncated: screenshotOptions.clip.height < rawDimensions.height,
      viewportCropped: true,
    };
    diagnostics.screenshot = {
      width: screenshotOptions.clip.width,
      height: screenshotOptions.clip.height,
      truncated: dimensions.truncated,
      referenceY,
      referenceHeight,
    };
    diagnostics.finishedAt = new Date().toISOString();
    diagnostics.durationMs = Date.now() - Date.parse(diagnostics.startedAt);

    return {
      screenshot: Buffer.from(screenshot),
      dimensions,
      consentHandled,
      finalUrl,
      device,
      detectedSlot,
      slotCandidates,
      domInjection,
      preparedCreative,
      diagnostics,
    };
  } finally {
    await job.release();
  }
}

async function probeWebsiteAdSlots(
  url,
  device = 'desktop',
  adWidth = 300,
  adHeight = 250,
  { signal } = {}
) {
  const job = await openBrowserJob(signal);
  const { page } = job;
  const diagnostics = createCaptureDiagnostics(url, device, adWidth, adHeight);

  try {
    const viewport = device === 'mobile' ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT;
    const ua = device === 'mobile' ? MOBILE_UA : DESKTOP_UA;

    await page.setViewport(viewport);
    await page.setUserAgent(ua);
    await page.setRequestInterception(true);
    page.on('request', req => {
      const action = req.resourceType() === 'media' ? req.abort() : req.continue();
      action.catch(() => {});
    });

    let phaseStartedAt = Date.now();
    const finalUrl = await navigateWithFallbacks(page, url, diagnostics);
    finishTiming(diagnostics, 'navigation', phaseStartedAt);

    phaseStartedAt = Date.now();
    const beforeConsent = await readPublisherState(page);
    const consentHandled = await handleConsent(page, finalUrl);
    const pageState = await readPublisherState(page);
    if (!pageState.usable || (beforeConsent.textLength > 500 && pageState.textLength < beforeConsent.textLength * 0.1)) {
      const error = new Error('The publisher page is empty or blocked after consent handling. Try another publisher.');
      error.code = FAILURE_CODES.CAPTURE_CONTENT_MISSING;
      throw error;
    }
    diagnostics.pageState = pageState;
    diagnostics.consent = { handled: Boolean(consentHandled), contentRetained: pageState.usable };
    finishTiming(diagnostics, 'consent', phaseStartedAt);

    phaseStartedAt = Date.now();
    await autoScroll(page, Math.min(DEFAULT_SCROLL_SCAN_PX, 3200));
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 500));
    finishTiming(diagnostics, 'scroll', phaseStartedAt);

    phaseStartedAt = Date.now();
    let slotDetection = await detectAdSlots(page, adWidth, adHeight, device, { returnCandidates: true });

    if (!slotDetection.bestSlot) {
      await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.2));
      await new Promise(r => setTimeout(r, 400));
      const secondPass = await detectAdSlots(page, adWidth, adHeight, device, { returnCandidates: true });
      await page.evaluate(() => window.scrollTo(0, 0));

      if (secondPass.bestSlot || (secondPass.candidates || []).length > (slotDetection.candidates || []).length) {
        const merged = [...(slotDetection.candidates || []), ...(secondPass.candidates || [])];
        const deduped = new Map();
        for (const candidate of merged) {
          const current = deduped.get(candidate.slotId);
          if (!current || (candidate.score || 0) > (current.score || 0)) {
            deduped.set(candidate.slotId, candidate);
          }
        }
        slotDetection = {
          bestSlot: secondPass.bestSlot || slotDetection.bestSlot,
          candidates: [...deduped.values()].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 8),
          rejectedCandidates: [
            ...(slotDetection.rejectedCandidates || []),
            ...(secondPass.rejectedCandidates || []),
          ].slice(0, 12),
          rejectionSummary: summarizeReasons([
            ...(slotDetection.rejectedCandidates || []),
            ...(secondPass.rejectedCandidates || []),
          ]),
          weakBestScore: Math.max(slotDetection.weakBestScore || 0, secondPass.weakBestScore || 0),
        };
      }
    }

    const candidates = slotDetection.candidates || [];
    const bestCandidate = slotDetection.bestSlot || candidates[0] || null;
    diagnostics.slotDetection = {
      bestSlotId: bestCandidate?.slotId || null,
      candidateCount: candidates.length,
      rejectedCount: slotDetection.rejectedCandidates?.length || 0,
      rejectionSummary: slotDetection.rejectionSummary || {},
      weakBestScore: slotDetection.weakBestScore ?? null,
    };
    finishTiming(diagnostics, 'slotDetection', phaseStartedAt);
    diagnostics.finishedAt = new Date().toISOString();
    diagnostics.durationMs = Date.now() - Date.parse(diagnostics.startedAt);

    return {
      status: bestCandidate ? 'ok' : 'warning',
      finalUrl,
      consentHandled,
      candidateCount: candidates.length,
      bestSlot: bestCandidate ? {
        slotId: bestCandidate.slotId,
        score: bestCandidate.score,
        confidence: bestCandidate.confidence,
        type: bestCandidate.type,
        width: bestCandidate.slotWidth,
        height: bestCandidate.slotHeight,
        x: bestCandidate.x,
        y: bestCandidate.y,
        reasons: bestCandidate.reasons || [],
      } : null,
      rejectionSummary: slotDetection.rejectionSummary || {},
      diagnostics: {
        timingsMs: diagnostics.timingsMs,
        navigationAttempts: diagnostics.navigationAttempts,
      },
    };
  } catch (err) {
    return {
      status: 'failed',
      failureCode: signal?.aborted ? (signal.reason?.code || 'mockup_timeout') : getErrorCode(err),
      error: err?.message || String(err),
      candidateCount: 0,
      bestSlot: null,
      diagnostics: {
        timingsMs: diagnostics.timingsMs,
        navigationAttempts: diagnostics.navigationAttempts,
      },
    };
  } finally {
    await job.release();
  }
}

/**
 * Render an ad tag in an isolated Puppeteer page.
 * Returns a structured response with render diagnostics for downstream placement logic.
 */
async function renderAdTag(adTag, width, height, { signal } = {}) {
  const job = await openBrowserJob(signal);
  const { page } = job;
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
    if (type === 'media') {
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
        renderConfidence: 'low',
        diagnostics: {
          placeholder: true,
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
    signal?.throwIfAborted();
    console.error('Ad tag rendering failed:', err.message);
    return null;
  } finally {
    await job.release();
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
  activeBrowserJobs = 0;
  completedBrowserJobs = 0;
}

module.exports = {
  captureWebsite,
  renderAdTag,
  closeBrowser,
  getBrowser,
  detectAdSlots,
  probeWebsiteAdSlots,
  injectCreativeIntoDetectedSlot,
};
