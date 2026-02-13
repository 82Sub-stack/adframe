/**
 * Puppeteer screenshot engine for capturing publisher websites.
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

  // On Render, use single-process mode
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
 * Capture a screenshot of a website with consent handling.
 * Returns a Buffer of the screenshot PNG.
 */
async function captureWebsite(url, device = 'desktop', onProgress = () => {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    const viewport = device === 'mobile' ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT;
    const ua = device === 'mobile' ? MOBILE_UA : DESKTOP_UA;

    await page.setViewport(viewport);
    await page.setUserAgent(ua);

    // Block unnecessary resources for speed
    await page.setRequestInterception(true);
    page.on('request', req => {
      const type = req.resourceType();
      // Block video and large media, but allow images/css/js for proper rendering
      if (['media', 'font'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    onProgress('Loading page...');

    // Navigate with timeout
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    onProgress('Handling consent banners...');

    // Handle consent banners
    const consentHandled = await handleConsent(page, url);

    onProgress('Scrolling page...');

    // Scroll to trigger lazy loading
    await autoScroll(page);

    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 1000));

    onProgress('Taking screenshot...');

    // Take full-page screenshot
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: true,
    });

    // Get page dimensions for placement calculation
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
    };
  } finally {
    await page.close();
  }
}

/**
 * Render an ad tag in an isolated viewport and return a screenshot of it.
 */
async function renderAdTag(adTag, width, height) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width, height });

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: ${width}px; height: ${height}px; overflow: hidden; background: transparent; }
    .ad-container { width: ${width}px; height: ${height}px; overflow: hidden; }
    iframe { border: none; }
  </style>
</head>
<body>
  <div class="ad-container">
    <iframe
      sandbox="allow-scripts allow-same-origin"
      width="${width}"
      height="${height}"
      srcdoc="${adTag.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"
      style="border:none;"
    ></iframe>
  </div>
</body>
</html>`;

    // Use a simpler approach: set content with the ad tag directly
    const safeHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: ${width}px; height: ${height}px; overflow: hidden; background: white; }
  </style>
</head>
<body>
  <div style="width:${width}px;height:${height}px;overflow:hidden;">
    ${adTag}
  </div>
</body>
</html>`;

    await page.setContent(safeHtml, { waitUntil: 'networkidle2', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000)); // Wait for ad to render

    const screenshot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width, height },
    });

    return Buffer.from(screenshot);
  } catch (err) {
    console.error('Ad tag rendering failed:', err.message);
    return null; // Caller should use placeholder fallback
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

/**
 * Close the browser instance gracefully.
 */
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
};
