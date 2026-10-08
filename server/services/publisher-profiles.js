// Selectors verified against publisher pages on 2026-10-08. These identify ad
// hosts only; visibility, editorial-content, clipping and pixel checks still apply.
const PROFILES = [
  { id: 'sport1', hosts: ['sport1.de', 'www.sport1.de'],
    selectors: ['.sport1-ad', 'iframe[id^="google_ads_iframe_"][id*="/sport1.de_web/"]'],
    maxWidth: 1120, maxHeight: 650, readinessTimeoutMs: 3000 },
  { id: 'finanznachrichten', hosts: ['finanznachrichten.de', 'www.finanznachrichten.de'],
    selectors: ['#dban1', '#dmr1', '#dmr3', '#dmr4', '#dmr5', 'iframe[id^="google_ads_iframe_"][id*="/finanznachrichten/"]'],
    maxWidth: 1032, maxHeight: 650, readinessTimeoutMs: 3000 },
];

function getPublisherProfile(url) {
  try { const host = new URL(url).hostname.toLowerCase(); return PROFILES.find(profile => profile.hosts.includes(host)) || null; }
  catch { return null; }
}

function fitsProfileContainer(slot, profile, width, height) {
  return Boolean(profile && slot.profileMatch && slot.isAd &&
    slot.width >= width - 1 && slot.height >= height - 1 &&
    slot.width <= profile.maxWidth && slot.height <= profile.maxHeight);
}

async function waitForPublisherSlots(page, profile, width, height) {
  if (!profile) return { status: 'generic' };
  try {
    const handle = await page.waitForFunction((selectors, w, h, maxW, maxH) => {
      const dimensions = [...document.querySelectorAll(selectors.join(','))].map(el => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (rect.width < w - 1 || rect.height < h - 1 || rect.width > maxW || rect.height > maxH || style.display === 'none' || style.visibility === 'hidden') return null;
        return [rect.x, rect.y, rect.width, rect.height].map(value => Math.round(value)).join(':');
      }).filter(Boolean).join('|');
      const stable = dimensions && window.__adframeProfileGeometry === dimensions;
      window.__adframeProfileGeometry = dimensions;
      return Boolean(stable);
    }, { polling: 250, timeout: profile.readinessTimeoutMs }, profile.selectors, width, height, profile.maxWidth, profile.maxHeight);
    await handle.dispose();
    return { status: 'stable' };
  } catch (error) {
    if (error.name !== 'TimeoutError') throw error;
    return { status: 'readiness-timeout' };
  } finally {
    await page.evaluate(() => { delete window.__adframeProfileGeometry; }).catch(() => {});
  }
}

module.exports = { getPublisherProfile, fitsProfileContainer, waitForPublisherSlots };
