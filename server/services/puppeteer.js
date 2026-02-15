/**
 * Puppeteer screenshot engine for capturing publisher websites.
 * Also detects existing ad slots on the page for realistic ad placement.
 */

const puppeteer = require('puppeteer');
const { handleConsent } = require('./consent-handler');

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844, isMobile: true, hasTouch: true };

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

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
 * Detect existing ad slots/iframes on the page and find the best one
 * matching the requested ad size. Returns {x, y} in page coordinates,
 * or null if no suitable slot is found.
 */
async function detectAdSlots(page, targetWidth, targetHeight, device) {
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

    // 1. Find ad iframes (most common ad delivery method)
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      const rect = iframe.getBoundingClientRect();
      const w = rect.width || parseInt(iframe.width) || 0;
      const h = rect.height || parseInt(iframe.height) || 0;
      if (w < 50 || h < 50) continue; // skip tracking pixels
      const src = (iframe.src || iframe.dataset.src || '').toLowerCase();
      const id = (iframe.id || '').toLowerCase();
      const cls = (iframe.className || '').toLowerCase();
      // Score by how well the size matches AND ad-relevance signals
      const isAdLikely = src.includes('ad') || src.includes('doubleclick') ||
        src.includes('googlesyndication') || src.includes('amazon-adsystem') ||
        src.includes('flashtalking') || src.includes('adform') ||
        id.includes('ad') || cls.includes('ad') ||
        id.includes('banner') || cls.includes('banner');
      const sizeDiff = Math.abs(w - tw) + Math.abs(h - th);
      results.push({
        slotId: getSlotId(iframe),
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY,
        width: w,
        height: h,
        sizeDiff,
        isAd: isAdLikely,
        type: 'iframe',
      });
    }

    // 2. Find divs that look like ad containers
    const adSelectors = [
      '[id*="ad-"][id*="container"]', '[id*="ad_"][id*="container"]',
      '[class*="ad-"][class*="container"]', '[class*="ad_"][class*="container"]',
      '[id*="ad-slot"]', '[class*="ad-slot"]', '[class*="adslot"]',
      '[data-ad]', '[data-ad-slot]', '[data-google-query-id]',
      '[id*="billboard"]', '[id*="leaderboard"]', '[id*="skyscraper"]',
      '[id*="rectangle"]', '[class*="billboard"]', '[class*="leaderboard"]',
      '.ad-wrapper', '.ad-container', '.ad-unit', '.ad-placement',
      '[id*="iqadtile"]', '[class*="iqadtile"]', // IQ Digital (heise, etc.)
      '[id*="adtile"]', '[class*="adtile"]',
    ];
    for (const sel of adSelectors) {
      try {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const rect = el.getBoundingClientRect();
          if (rect.width < 50 || rect.height < 30) continue;
          const sizeDiff = Math.abs(rect.width - tw) + Math.abs(rect.height - th);
          results.push({
            slotId: getSlotId(el),
            x: rect.left + window.scrollX,
            y: rect.top + window.scrollY,
            width: rect.width,
            height: rect.height,
            sizeDiff,
            isAd: true,
            type: 'div',
          });
        }
      } catch (e) { /* invalid selector */ }
    }

    // 3. Find Google Ads containers specifically
    const gptSlots = document.querySelectorAll('[id^="div-gpt-ad"]');
    for (const el of gptSlots) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 50 || rect.height < 10) continue;
      results.push({
        slotId: getSlotId(el),
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height,
        sizeDiff: Math.abs(rect.width - tw) + Math.abs(rect.height - th),
        isAd: true,
        type: 'gpt',
      });
    }

    return results;
  }, targetWidth, targetHeight);

  if (slots.length === 0) return null;

  // Score and sort: prefer (1) close size match, (2) ad-flagged elements, (3) visible position
  const scored = slots.map(s => {
    let score = 0;
    // Size match (lower diff = better) — most important
    if (s.sizeDiff < 20) score += 100;
    else if (s.sizeDiff < 80) score += 60;
    else if (s.sizeDiff < 200) score += 30;
    else score += Math.max(0, 10 - s.sizeDiff / 50);
    // Ad relevance
    if (s.isAd) score += 50;
    // Position: prefer slots in the visible area (above ~2000px)
    if (s.y < 2000) score += 20;
    if (s.y < 1000) score += 10;
    // Prefer GPT/iframe over generic divs
    if (s.type === 'gpt') score += 15;
    if (s.type === 'iframe') score += 10;
    return { ...s, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (best.score < 20) return null; // No good match

  console.log(`Detected ad slot: ${best.type} at (${Math.round(best.x)}, ${Math.round(best.y)}) size ${Math.round(best.width)}x${Math.round(best.height)}, score=${best.score}`);

  return {
    slotId: best.slotId,
    x: Math.round(best.x),
    y: Math.round(best.y),
    slotWidth: Math.round(best.width),
    slotHeight: Math.round(best.height),
  };
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
  { adTag = null, adImageBuffer = null, adWidth = 300, adHeight = 250 } = {}
) {
  if (!detectedSlot?.slotId) {
    return { succeeded: false, reason: 'no-slot' };
  }

  const mode = adImageBuffer ? 'image' : adTag ? 'adtag' : null;
  if (!mode) {
    return { succeeded: false, reason: 'no-creative' };
  }

  const payload = {
    slotId: detectedSlot.slotId,
    mode,
    adWidth,
    adHeight,
    imageDataUrl: adImageBuffer ? buildDataUri(adImageBuffer) : null,
    srcdoc: adTag ? buildAdTagSrcDoc(adTag, adWidth, adHeight) : null,
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
      replacement.style.width = `${Math.max(1, Math.round(rect.width || p.adWidth))}px`;
      replacement.style.height = `${Math.max(1, Math.round(rect.height || p.adHeight))}px`;
      replacement.style.display = 'block';
      replacement.style.overflow = 'hidden';
      slotEl.replaceWith(replacement);
      hostEl = replacement;
    }

    while (hostEl.firstChild) {
      hostEl.removeChild(hostEl.firstChild);
    }

    const computed = getComputedStyle(hostEl);
    if (computed.position === 'static') {
      hostEl.style.position = 'relative';
    }
    hostEl.style.overflow = 'hidden';
    if (hostEl.getBoundingClientRect().height < 20) {
      hostEl.style.minHeight = `${p.adHeight}px`;
    }
    if (hostEl.getBoundingClientRect().width < 20) {
      hostEl.style.minWidth = `${p.adWidth}px`;
    }

    const creative = document.createElement('div');
    creative.style.width = '100%';
    creative.style.height = '100%';
    creative.style.minWidth = `${p.adWidth}px`;
    creative.style.minHeight = `${p.adHeight}px`;
    creative.style.background = '#fff';

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

    const badge = document.createElement('div');
    badge.textContent = 'AD';
    badge.style.position = 'absolute';
    badge.style.top = '0';
    badge.style.left = '0';
    badge.style.padding = '2px 6px';
    badge.style.background = '#FF6B35';
    badge.style.color = '#fff';
    badge.style.fontFamily = 'Arial, sans-serif';
    badge.style.fontSize = '10px';
    badge.style.fontWeight = '700';
    badge.style.lineHeight = '1.2';
    badge.style.zIndex = '2147483647';
    badge.style.pointerEvents = 'none';
    hostEl.appendChild(badge);

    const rect = hostEl.getBoundingClientRect();
    return {
      succeeded: true,
      mode: p.mode,
      x: Math.round(rect.left + window.scrollX),
      y: Math.round(rect.top + window.scrollY),
      slotWidth: Math.round(rect.width),
      slotHeight: Math.round(rect.height),
    };
  }, payload);

  if (!result?.succeeded) {
    return result || { succeeded: false, reason: 'inject-failed' };
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
    }, detectedSlot.slotId);
  }

  await new Promise(r => setTimeout(r, mode === 'adtag' ? 1000 : 250));

  return result;
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

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    onProgress('Handling consent banners...');

    const consentHandled = await handleConsent(page, url);

    onProgress('Scrolling page...');

    await autoScroll(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 1000));

    onProgress('Detecting ad positions...');

    // Detect ad slots BEFORE taking the screenshot
    const detectedSlot = await detectAdSlots(page, adWidth, adHeight, device);

    let domInjection = { succeeded: false, reason: 'not-attempted' };
    if (injectionOptions) {
      onProgress('Injecting ad creative...');
      domInjection = await injectCreativeIntoDetectedSlot(page, detectedSlot, {
        ...injectionOptions,
        adWidth,
        adHeight,
      });
    }

    onProgress('Taking screenshot...');

    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: true,
    });

    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    }));

    return {
      screenshot: Buffer.from(screenshot),
      dimensions,
      consentHandled,
      device,
      detectedSlot,
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
