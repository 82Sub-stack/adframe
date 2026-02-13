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
  'button[aria-label*="accept"]',
  'button[aria-label*="Accept"]',
  'button[aria-label*="Akzeptieren"]',
  'button[aria-label*="Zustimmen"]',
  'button[aria-label*="agree"]',
  'button[aria-label*="Agree"]',

  // Text-based matches (last resort)
  'button:has-text("Accept All")',
  'button:has-text("Alle akzeptieren")',
  'button:has-text("Tout accepter")',
  'button:has-text("Aceptar todo")',
  'button:has-text("Accetta tutto")',
];

const OVERLAY_SELECTORS = [
  '[class*="consent"]',
  '[id*="consent"]',
  '[class*="cookie-banner"]',
  '[id*="cookie-banner"]',
  '[id*="cookie"]',
  '.cmp-modal',
  '.cmp-overlay',
  '[class*="privacy-wall"]',
  '[class*="gdpr"]',
  '[id*="gdpr"]',
  '#usercentrics-root',
  '[id*="sp_message"]',
  '.message-overlay',
  '[class*="cookie-notice"]',
  '[id*="cookie-notice"]',
];

/**
 * Set consent cookies for the target domain before navigation.
 */
async function setConsentCookies(page, url) {
  const domain = new URL(url).hostname;
  const baseDomain = domain.replace(/^www\./, '');

  const cookies = CONSENT_COOKIES.map(cookie => ({
    ...cookie,
    domain: `.${baseDomain}`,
    path: '/',
    httpOnly: false,
    secure: true,
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
    await page.evaluate(() => {
      const shadowHosts = document.querySelectorAll(
        '#usercentrics-root, [id*="usercentrics"], #shadow-root-container'
      );
      shadowHosts.forEach(host => {
        const shadow = host.shadowRoot;
        if (shadow) {
          const acceptBtn =
            shadow.querySelector('button[data-testid="uc-accept-all-button"]') ||
            shadow.querySelector('button[contains="Accept All"]') ||
            shadow.querySelector('button.accept-all');
          if (acceptBtn) acceptBtn.click();
        }
      });
    });
  } catch (err) {
    // Shadow DOM not present or not accessible
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

  // Text-based matching fallback
  try {
    const clicked = await page.evaluate(() => {
      const acceptTexts = [
        'Accept All', 'Accept all', 'Alle akzeptieren', 'Alles akzeptieren',
        'Tout accepter', 'Aceptar todo', 'Accetta tutto', 'Alle accepteren',
        'Zaakceptuj wszystko', 'AGREE', 'Agree', 'I Accept', 'OK',
        'Zustimmen', 'Einverstanden', 'Akzeptieren',
      ];
      const buttons = document.querySelectorAll('button, a[role="button"], [role="button"]');
      for (const btn of buttons) {
        const text = btn.textContent.trim();
        if (acceptTexts.some(t => text === t || text.startsWith(t))) {
          btn.click();
          return true;
        }
      }
      return false;
    });
    return clicked;
  } catch (err) {
    return false;
  }
}

/**
 * Force-remove consent overlay elements as a last resort.
 */
async function removeConsentOverlays(page) {
  try {
    const removed = await page.evaluate((selectors) => {
      let removedCount = 0;
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          const style = getComputedStyle(el);
          const isOverlay =
            el.offsetHeight > 200 ||
            style.position === 'fixed' ||
            style.position === 'absolute' ||
            parseInt(style.zIndex) > 999;
          if (isOverlay) {
            el.remove();
            removedCount++;
          }
        });
      });

      // Also remove any high z-index fixed elements that look like overlays
      document.querySelectorAll('div, section, aside').forEach(el => {
        const style = getComputedStyle(el);
        if (
          (style.position === 'fixed' || style.position === 'sticky') &&
          parseInt(style.zIndex) > 9000 &&
          el.offsetHeight > 100
        ) {
          el.remove();
          removedCount++;
        }
      });

      // Restore scrolling
      document.body.style.overflow = '';
      document.body.style.overflowY = '';
      document.documentElement.style.overflow = '';
      document.documentElement.style.overflowY = '';
      document.body.classList.remove('sp-message-open', 'modal-open', 'no-scroll');

      return removedCount;
    }, OVERLAY_SELECTORS);

    return removed;
  } catch (err) {
    console.warn('Failed to remove overlays:', err.message);
    return 0;
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
    await handleShadowDOMConsent(page);
    await new Promise(r => setTimeout(r, 500));
  }

  // Layer 4: Brute-force click-based dismissal
  if (!consentHandled) {
    const clicked = await clickConsentButtons(page);
    if (clicked) {
      consentHandled = true;
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Layer 5: Force-remove remaining overlays
  const removed = await removeConsentOverlays(page);
  if (removed > 0) {
    consentHandled = true;
  }

  // Final wait for page to settle
  await new Promise(r => setTimeout(r, 500));

  return consentHandled;
}

module.exports = {
  handleConsent,
  setConsentCookies,
  handleKnownCMPs,
  handleShadowDOMConsent,
  clickConsentButtons,
  removeConsentOverlays,
};
