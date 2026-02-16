/**
 * Puppeteer screenshot engine for capturing publisher websites.
 * Also detects existing ad slots on the page for realistic ad placement.
 */

const puppeteer = require('puppeteer');
const { handleConsent, setConsentCookies } = require('./consent-handler');

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844, isMobile: true, hasTouch: true };

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const MAX_CAPTURE_HEIGHT = 10000;

let browserInstance = null;

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

  if (process.env.NODE_ENV === 'production') {
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
  const slots = await page.evaluate((tw, th) => {
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
      if (scanned > 1800) break;
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
  }, targetWidth, targetHeight);

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

    return { ...s, score: Math.round(score) };
  });

  scored.sort((a, b) => b.score - a.score);
  const candidates = scored
    .filter((c) => c.score >= 55)
    .filter((c) => c.isAd || c.type === 'iframe' || c.type === 'gpt')
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

async function injectCreativeIntoDetectedSlot(
  page,
  detectedSlot,
  { adTag = null, adImageBuffer = null, adWidth = 300, adHeight = 250, slotCandidates = null } = {}
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

    return {
      ...result,
      succeeded: true,
      selectedSlotId: candidate.slotId,
      selectedSlotScore: candidate.score,
      selectedSlotType: candidate.type,
      attempts: index + 1,
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

    // Set consent cookies before first navigation to reduce CMP blocking.
    await setConsentCookies(page, url);

    try {
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 25000,
      });
    } catch (err) {
      const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout');
      if (!isTimeout) throw err;
      console.warn(`Primary navigation timed out for ${url}, retrying with domcontentloaded`);
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await new Promise(r => setTimeout(r, 1500));
    }

    onProgress('Handling consent banners...');

    const consentHandled = await handleConsent(page, url);

    onProgress('Scrolling page...');

    await autoScroll(page);
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

    const detectedSlot = slotDetection.bestSlot;
    const slotCandidates = slotDetection.candidates || [];

    let domInjection = { succeeded: false, reason: 'not-attempted' };
    if (injectionOptions) {
      onProgress('Injecting ad creative...');
      domInjection = await injectCreativeIntoDetectedSlot(page, detectedSlot, {
        ...injectionOptions,
        adWidth,
        adHeight,
        slotCandidates,
      });
    }

    onProgress('Taking screenshot...');

    const rawDimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    }));

    const referenceY = domInjection.succeeded
      ? domInjection.y
      : detectedSlot?.y ?? Math.floor(rawDimensions.viewportHeight * 0.6);
    const referenceHeight = domInjection.succeeded
      ? domInjection.slotHeight
      : detectedSlot?.slotHeight ?? adHeight;

    const desiredBottom = Math.max(
      rawDimensions.viewportHeight + 100,
      Math.round(referenceY + referenceHeight + 260)
    );
    const clipHeight = Math.max(
      Math.min(rawDimensions.viewportHeight, MAX_CAPTURE_HEIGHT),
      Math.min(rawDimensions.height, Math.min(MAX_CAPTURE_HEIGHT, desiredBottom))
    );

    const screenshotOptions = {
      type: 'png',
      clip: {
        x: 0,
        y: 0,
        width: Math.max(1, Math.min(rawDimensions.width, viewport.width)),
        height: Math.max(320, clipHeight),
      },
    };
    const screenshot = await page.screenshot(screenshotOptions);

    const dimensions = {
      ...rawDimensions,
      fullHeight: rawDimensions.height,
      height: screenshotOptions.clip.height,
      truncated: screenshotOptions.clip.height < rawDimensions.height,
      viewportCropped: true,
    };

    return {
      screenshot: Buffer.from(screenshot),
      dimensions,
      consentHandled,
      device,
      detectedSlot,
      slotCandidates,
      domInjection,
    };
  } finally {
    await page.close();
  }
}

/**
 * Render an ad tag in an isolated Puppeteer page.
 * Handles <script> tags, <iframe> tags, and raw HTML creatives.
 */
async function renderAdTag(adTag, width, height) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: width + 20, height: height + 20 });

    // Determine the ad tag type
    const trimmed = adTag.trim();
    const hasScript = /<script[\s>]/i.test(trimmed);
    const hasIframeSrc = /<iframe[^>]+src\s*=/i.test(trimmed);

    if (hasIframeSrc) {
      // Extract the iframe src and navigate to it directly
      const srcMatch = trimmed.match(/<iframe[^>]+src\s*=\s*["']([^"']+)["']/i);
      if (srcMatch) {
        const iframeSrc = srcMatch[1];
        console.log(`Ad tag: rendering iframe src directly: ${iframeSrc.substring(0, 80)}...`);
        await page.goto(iframeSrc, { waitUntil: 'networkidle2', timeout: 15000 });
        await new Promise(r => setTimeout(r, 2000));

        const screenshot = await page.screenshot({
          type: 'png',
          clip: { x: 0, y: 0, width, height },
        });
        return Buffer.from(screenshot);
      }
    }

    // For script tags or raw HTML: use a data URL to allow external script loading
    if (hasScript) {
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>*{margin:0;padding:0;box-sizing:border-box}body{width:${width}px;height:${height}px;overflow:hidden;background:#fff}</style>
</head><body>
<div id="ad" style="width:${width}px;height:${height}px;overflow:hidden;">${adTag}</div>
</body></html>`;

      // Navigate to a data URL so scripts can execute (setContent blocks some script execution)
      const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
      console.log('Ad tag: rendering via data URL (has scripts)');
      await page.goto(dataUrl, { waitUntil: 'networkidle2', timeout: 15000 });
      await new Promise(r => setTimeout(r, 3000)); // Extra wait for ad scripts

    } else {
      // Plain HTML creative (images, divs, etc.)
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>*{margin:0;padding:0;box-sizing:border-box}body{width:${width}px;height:${height}px;overflow:hidden;background:#fff}</style>
</head><body>
<div style="width:${width}px;height:${height}px;overflow:hidden;">${adTag}</div>
</body></html>`;

      console.log('Ad tag: rendering plain HTML creative');
      await page.setContent(html, { waitUntil: 'networkidle2', timeout: 15000 });
      await new Promise(r => setTimeout(r, 2000));
    }

    // Check if anything actually rendered (not just a white box)
    const hasContent = await page.evaluate((w, h) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      // Check if body has visible children
      const body = document.body;
      if (!body) return false;
      const children = body.querySelectorAll('img, canvas, video, svg, div, iframe');
      for (const child of children) {
        const rect = child.getBoundingClientRect();
        if (rect.width > 10 && rect.height > 10) return true;
      }
      return false;
    }, width, height);

    if (!hasContent) {
      console.log('Ad tag: no visible content detected after render');
    }

    const screenshot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width, height },
    });

    return Buffer.from(screenshot);
  } catch (err) {
    console.error('Ad tag rendering failed:', err.message);
    return null;
  } finally {
    await page.close();
  }
}

/**
 * Auto-scroll the page to trigger lazy-loaded content.
 */
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        const scrollHeight = document.documentElement.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight || totalHeight > 8000) {
          clearInterval(timer);
          resolve();
        }
      }, 150);
    });
  });
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
