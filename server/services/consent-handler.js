/**
 * Multi-layer consent banner handler for European publisher sites.
 * Handles Sourcepoint, OneTrust, Didomi, Usercentrics, Quantcast, Cookiebot, and generic CMPs.
 * Container-aware CMP strategies sourced from consent_config.yaml.
 */

// Structured CMP strategies: detect container first, then click accept.
// This avoids clicking wrong buttons on pages without a particular CMP.
const CMP_STRATEGIES = [
  { name: 'OneTrust',        container: '#onetrust-banner-sdk',              accept: '#onetrust-accept-btn-handler' },
  { name: 'Didomi',          container: '#didomi-host',                      accept: '#didomi-notice-agree-button' },
  { name: 'SourcePoint',     container: "[id^='sp_message_container']",      accept: "button[title='Agree'], button[title='Akzeptieren'], button.sp_choice_type_11" },
  { name: 'Cookiebot',       container: '#CybotCookiebotDialog',             accept: '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll' },
  { name: 'Usercentrics',    container: '#usercentrics-root',                accept: "button[data-testid='uc-accept-all-button']" },
  { name: 'Usercentrics-Alt',container: '#usercentrics-root',                accept: '#uc-btn-accept-banner' },
  { name: 'Usercentrics-Cls',container: '#usercentrics-root',                accept: '.uc-list-button__accept-all' },
  { name: 'Quantcast',       container: '.qc-cmp2-container',               accept: "button[mode='primary']" },
  { name: 'ConsentManager',  container: '#cmpwrapper, .cmpwrapper',         accept: "button, a, [role='button']" },
];

const CONSENT_COOKIES = [
  // Sourcepoint CMP (Spiegel, Bild, many German publishers)
  {
    name: 'euconsent-v2',
    value: 'CPzqYkAPzqYkAAGABCENB-CoAP_AAH_AAAAAHftf_X_fb3_j-_59__t0eY1f9_7_v-0zjhfdt-8N2f_X_L8X_2M7vF36pq4KuR4Eu3LBIQdlHOHcTUmw6okVrzPsbk2Mr7NKJ7PEmnMbO2dYGH9_n93TuZKY7______z_v-v_v____f_7-3_3__5_X---_e_V399zLv9____39nP___9v-_9_____4IhgEmGpeQBdiWODJtGlUKIEYVhIdAKACigGFoisIHVwU7K4CfUELABCagJwIgQYgowYBAAIJAEhEQEgB4IBEARAIAAQAqQEIACNgEFgBYGAQACgGhYARRBKBIQZHBUcpgQFSLRQT2ViCUHexphCGWeBFAo_oqEBGs0ks2BySsmRpKJSIKmnkpIBO',
  },
  // OneTrust CMP
  {
    name: 'OptanonAlertBoxClosed',
    value: new Date().toISOString(),
  },
  {
    name: 'OptanonConsent',
    value: 'isGpcEnabled=0&datestamp=' + encodeURIComponent(new Date().toISOString()) + '&version=202309.1.0&groups=C0001:1,C0002:1,C0003:1,C0004:1',
  },
  // Didomi CMP
  {
    name: 'didomi_token',
    value: 'eyJ1c2VyX2lkIjoiMThhMTRiY2ItZWMzNy02YWNlLWJhNTgtMjcyYTFlMDBiODQ1IiwiY3JlYXRlZCI6IjIwMjQtMDEtMDFUMDA6MDA6MDAuMDAwWiIsInVwZGF0ZWQiOiIyMDI0LTAxLTAxVDAwOjAwOjAwLjAwMFoiLCJ2ZW5kb3JzIjp7ImVuYWJsZWQiOlsiZ29vZ2xlIl19LCJwdXJwb3NlcyI6eyJlbmFibGVkIjpbImNvb2tpZXMiXX19',
  },
  // Quantcast
  {
    name: '.AspNet.Consent',
    value: 'yes',
  },
  // Generic GDPR consent
  {
    name: 'cookieconsent_status',
    value: 'dismiss',
  },
  {
    name: 'cookie_consent',
    value: 'accepted',
  },
  {
    name: 'gdpr_consent',
    value: '1',
  },
];

const CONSENT_CLICK_SELECTORS = [
  // Sourcepoint CMP
  'button[title="Alle akzeptieren"]',
  'button[title="Accept All"]',
  'button[title="Zustimmen und weiter"]',
  'button[title="Einwilligen & weiter"]',
  'button[title="Einwilligen und weiter"]',
  'button[title="Weiter mit Werbung"]',
  'button[title="Weiter mit Werbung ..."]',
  'button[title="AGREE"]',
  '.sp_choice_type_11',
  '.message-button.sp_choice_type_11',

  // OneTrust CMP
  '#onetrust-accept-btn-handler',
  '.onetrust-close-btn-handler',

  // Didomi CMP
  '#didomi-notice-agree-button',
  '.didomi-continue-without-agreeing',

  // Quantcast / TCF generic
  '.qc-cmp2-summary-buttons button[mode="primary"]',
  'button.css-47sehv',

  // Usercentrics CMP
  '#uc-btn-accept-banner',
  'button[data-testid="uc-accept-all-button"]',

  // Cookiebot
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',

  // Generic patterns (fallback)
  'button[id*="accept"]',
  'button[class*="accept"]',
  'button[class*="agree"]',
  'button[id*="agree"]',
  '[data-testid*="accept"]',
  '[data-testid*="consent"]',
  '[data-testid*="cmp"]',
  'button[aria-label*="accept"]',
  'button[aria-label*="Accept"]',
  'button[aria-label*="Akzeptieren"]',
  'button[aria-label*="Zustimmen"]',
  'button[aria-label*="Einwilligen"]',
  'button[aria-label*="Werbung"]',
  'button[aria-label*="agree"]',
  'button[aria-label*="Agree"]',

  // Text-based matches (last resort)
  'button:has-text("Accept All")',
  'button:has-text("Alle akzeptieren")',
  'button:has-text("Tout accepter")',
  'button:has-text("Aceptar todo")',
  'button:has-text("Accetta tutto")',
];

const CONSENT_ACCEPT_TEXTS = [
  'Accept All',
  'Accept all',
  'Alle akzeptieren',
  'Alles akzeptieren',
  'Alle zulassen',
  'Auswahl akzeptieren',
  'Akzeptieren',
  'Zustimmen',
  'Zustimmen und weiter',
  'Einwilligen',
  'Einwilligen & weiter',
  'Einwilligen und weiter',
  'Weiter mit Werbung',
  'Weiter mit Werbung ...',
  'Mit Werbung weiter',
  'Mit Werbung fortfahren',
  'Consent and continue',
  'Agree',
  'AGREE',
  'I Accept',
  'OK',
  'Tout accepter',
  'Aceptar todo',
  'Accetta tutto',
  'Alle accepteren',
  'Zaakceptuj wszystko',
];

const OVERLAY_TEXT_MARKERS = [
  'cookies entgeltfrei',
  'consentpass',
  'contentpass',
  'weiter mit werbung',
  'mit werbung weiter',
  'einwilligen & weiter',
  'einwilligen und weiter',
  'ablehnen & abonnieren',
  'personalisierte werbung',
  'datenschutzeinstellungen',
  'privacy settings',
  'consent layer',
];

/**
 * Set consent cookies for the target domain before navigation.
 */
async function setConsentCookies(page, url) {
  const parsedUrl = new URL(url);

  const cookies = CONSENT_COOKIES.map(cookie => ({
    ...cookie,
    url: parsedUrl.origin,
    httpOnly: false,
    secure: parsedUrl.protocol === 'https:',
    sameSite: 'Lax',
  }));

  try {
    await page.setCookie(...cookies);
  } catch (err) {
    console.warn('Failed to set some consent cookies:', err.message);
  }
}

/**
 * Handle Shadow DOM consent banners (Usercentrics and similar).
 */
async function handleShadowDOMConsent(page) {
  try {
    return await page.evaluate((acceptTexts) => {
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const targets = acceptTexts.map(normalize);
      const shadowHosts = [...document.querySelectorAll('*')].filter((host) => host.shadowRoot);

      for (const host of shadowHosts) {
        const shadow = host.shadowRoot;
        const candidates = shadow.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]');

        for (const btn of candidates) {
          const style = getComputedStyle(btn);
          const rect = btn.getBoundingClientRect();
          if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            parseFloat(style.opacity || '1') < 0.05 ||
            rect.width < 20 ||
            rect.height < 10
          ) {
            continue;
          }

          const text = normalize(
            btn.textContent ||
            btn.value ||
            btn.getAttribute('aria-label') ||
            btn.getAttribute('title')
          );
          if (targets.some((target) => text === target || text.startsWith(target) || text.includes(target))) {
            btn.click();
            return true;
          }
        }
      }

      return false;
    }, CONSENT_ACCEPT_TEXTS);
  } catch (err) {
    // Shadow DOM not present or not accessible
    return false;
  }
}

/**
 * Container-aware CMP detection: check if a known CMP container is present,
 * then click its specific accept button. More reliable than brute-force selectors.
 */
async function handleKnownCMPs(page) {
  for (const strategy of CMP_STRATEGIES) {
    try {
      const container = await page.$(strategy.container);
      if (!container) continue;

      // For Usercentrics with Shadow DOM, handle separately
      if (strategy.name.startsWith('Usercentrics')) {
        const clicked = await page.evaluate((strat) => {
          const host = document.querySelector(strat.container);
          if (!host) return false;
          // Try shadow DOM first
          const shadow = host.shadowRoot;
          if (shadow) {
            const btn = shadow.querySelector(strat.accept);
            if (btn) { btn.click(); return true; }
          }
          // Fallback to regular DOM
          const btn = document.querySelector(strat.accept);
          if (btn) { btn.click(); return true; }
          return false;
        }, strategy);
        if (clicked) {
          console.log(`Consent handled via ${strategy.name} (container-aware)`);
          return true;
        }
        continue;
      }

      // For SourcePoint which may use iframes
      if (strategy.name === 'SourcePoint') {
        // SourcePoint wraps its UI in iframes — try both regular DOM and iframe
        const clicked = await page.evaluate((acceptSel) => {
          // Try each selector (comma-separated)
          const selectors = acceptSel.split(',').map(s => s.trim());
          for (const sel of selectors) {
            const btn = document.querySelector(sel);
            if (btn && btn.offsetHeight > 0) { btn.click(); return true; }
          }
          return false;
        }, strategy.accept);
        if (clicked) {
          console.log(`Consent handled via ${strategy.name} (container-aware)`);
          return true;
        }
        // Also try inside iframes
        const frames = page.frames();
        for (const frame of frames) {
          try {
            const selectors = strategy.accept.split(',').map(s => s.trim());
            for (const sel of selectors) {
              const btn = await frame.$(sel);
              if (btn) {
                await btn.click();
                console.log(`Consent handled via ${strategy.name} in iframe`);
                return true;
              }
            }
          } catch { /* frame may be cross-origin */ }
        }
        continue;
      }

      // Standard CMP: click the accept button directly
      const selectors = strategy.accept.split(',').map(s => s.trim());
      for (const sel of selectors) {
        const btn = await page.$(sel);
        if (btn) {
          const isVisible = await btn.evaluate(el => {
            const style = getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetHeight > 0;
          });
          if (isVisible) {
            await btn.click();
            console.log(`Consent handled via ${strategy.name} (container-aware)`);
            return true;
          }
        }
      }
    } catch (err) {
      // Strategy failed, try next
    }
  }
  return false;
}

/**
 * Try clicking consent buttons using known selectors (brute-force fallback).
 */
async function clickConsentButtons(page) {
  for (const selector of CONSENT_CLICK_SELECTORS) {
    try {
      // Skip :has-text pseudo-selectors (not native CSS)
      if (selector.includes(':has-text')) continue;

      const element = await page.$(selector);
      if (element) {
        const isVisible = await element.evaluate(el => {
          const style = getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetHeight > 0;
        });
        if (isVisible) {
          await element.click();
          await new Promise(r => setTimeout(r, 500));
          return true;
        }
      }
    } catch (err) {
      // Selector didn't match, continue
    }
  }

  return clickConsentByTextInFrames(page);
}

async function clickConsentByTextInFrame(frame) {
  try {
    const candidates = await frame.$$('button, a, a[role="button"], [role="button"], input[type="button"], input[type="submit"]');
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const targets = CONSENT_ACCEPT_TEXTS.map(normalize);

    for (const candidate of candidates) {
      const match = await candidate.evaluate((btn, targetTexts) => {
        const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const style = getComputedStyle(btn);
        const rect = btn.getBoundingClientRect();
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          parseFloat(style.opacity || '1') < 0.05 ||
          rect.width < 20 ||
          rect.height < 10
        ) {
          return false;
        }

        const text = normalizeText(
          btn.textContent ||
          btn.value ||
          btn.getAttribute('aria-label') ||
          btn.getAttribute('title')
        );
        if (!text) return false;

        const context = btn.closest('dialog,[role="dialog"],[aria-modal="true"],[id*="consent"],[class*="consent"],[id*="cmp"],[class*="cmp"],[id*="didomi"],[id*="onetrust"],[id*="sp_message"]');
        const inCmpFrame = /consent|cmp|privacy|sp_message/.test(location.href);
        if (!context && !inCmpFrame) return false;
        return targetTexts.some((target) => text === target || (target.length >= 10 && text.startsWith(target)));
      }, targets);

      if (match) {
        await candidate.click({ delay: 50 });
        await new Promise(r => setTimeout(r, 500));
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

async function clickConsentByTextInFrames(page) {
  if (await clickConsentByTextInFrame(page.mainFrame())) {
    console.log('Consent handled via text match');
    return true;
  }

  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    if (await clickConsentByTextInFrame(frame)) {
      console.log('Consent handled via text match in iframe');
      return true;
    }
  }

  return false;
}

/**
 * Force-remove consent overlay elements as a last resort.
 */
async function removeConsentOverlays(page) {
  return page.evaluate((markers) => {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const protectedContent = el => el.matches('html,body,main,article,#app,#root,#__next,#__nuxt') || Boolean(el.querySelector('main,article,[role="main"]'));
    const isConsentDialog = el => {
      if (protectedContent(el)) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width < 1 || rect.height < 1) return false;
      const signature = normalize(`${el.id} ${el.className} ${el.getAttribute('src') || ''}`);
      const knownCmp = /onetrust|didomi|sp_message|usercentrics|cybotcookiebot|qc-cmp|cmpwrapper/.test(signature);
      const consentSignature = /(?:^|[\s_-])(?:consent|cookie-banner|cookie-notice|cmp-modal|privacy-wall)(?:$|[\s_-])/.test(signature);
      const text = normalize(`${el.textContent || ''} ${el.shadowRoot?.textContent || ''}`).slice(0, 2000);
      const marker = markers.some(value => text.includes(value));
      const modal = el.matches('dialog,[role="dialog"],[aria-modal="true"]');
      const blocking = style.position === 'fixed' || (style.position === 'absolute' && Number(style.zIndex) > 100);
      // Large publisher wrappers and consent links in footers are never sufficient evidence.
      return knownCmp || (modal && (marker || consentSignature)) || (blocking && consentSignature && marker);
    };
    let removed = 0;
    const roots = [...document.querySelectorAll('dialog,[role="dialog"],[aria-modal="true"],body *')];
    for (const el of roots) {
      if (el.isConnected && isConsentDialog(el)) { el.remove(); removed++; }
    }
    if (removed) {
      for (const el of document.querySelectorAll('[class*="backdrop"],[class*="cmp-overlay"],.message-overlay')) {
        if (!protectedContent(el) && getComputedStyle(el).position === 'fixed') el.remove();
      }
    }
    for (const el of [document.body, document.documentElement]) {
      if (!el) continue;
      el.style.overflow = '';
      el.style.overflowY = '';
      el.classList.remove('sp-message-open','modal-open','no-scroll','overflow-hidden');
    }
    return removed;
  }, OVERLAY_TEXT_MARKERS);
}

async function forcePageRepaint(page) {
  try {
    await page.evaluate(() => {
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      window.scrollTo(scrollX, scrollY + 1);
      window.scrollTo(scrollX, scrollY);

    });
    await new Promise(r => setTimeout(r, 250));
  } catch {
    // Page may be navigating or detached; repaint is best-effort only.
  }
}

/**
 * Full consent handling pipeline. Returns whether consent was likely handled.
 */
async function handleConsent(page, url) {
  let consentHandled = false;

  // Layer 1: Pre-set cookies
  await setConsentCookies(page, url);

  // Wait for CMP to initialize after page load
  await new Promise(r => setTimeout(r, 2000));

  // Layer 2: Container-aware CMP strategies (most reliable)
  const cmpHandled = await handleKnownCMPs(page);
  if (cmpHandled) {
    consentHandled = true;
    await new Promise(r => setTimeout(r, 1000));
  }

  // Layer 3: Shadow DOM handling (Usercentrics etc.) — if not already handled
  if (!consentHandled) {
    const shadowHandled = await handleShadowDOMConsent(page);
    if (shadowHandled) {
      consentHandled = true;
      console.log('Consent handled via Shadow DOM');
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Layer 4: Brute-force click-based dismissal
  if (!consentHandled) {
    const clicked = await clickConsentButtons(page);
    if (clicked) {
      consentHandled = true;
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Some CMPs render a second confirmation/contentpass layer after the first click.
  const delayedClick = await clickConsentByTextInFrames(page);
  if (delayedClick) {
    consentHandled = true;
    await new Promise(r => setTimeout(r, 1000));
  }

  // Layer 5: Force-remove remaining overlays
  const removed = await removeConsentOverlays(page);
  if (removed > 0) {
    consentHandled = true;
  }

  // Final wait for page to settle
  await new Promise(r => setTimeout(r, 500));
  await forcePageRepaint(page);

  return consentHandled;
}

module.exports = {
  handleConsent,
  setConsentCookies,
  handleKnownCMPs,
  handleShadowDOMConsent,
  clickConsentButtons,
  removeConsentOverlays,
  forcePageRepaint,
};
