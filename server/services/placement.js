const { compareCreativePixels } = require('./image-verification');

async function getSlotVisualState(page, slotId, captureHeight, width, height) {
  return page.evaluate((id, limit, adWidth, adHeight) => {
    const host = document.querySelector(`[data-adframe-slot-id="${CSS.escape(id)}"]`);
    if (!host) return { visible: false, reason: 'slot-not-found' };
    const creative = host.querySelector('[data-adframe-creative]') || host;
    const rect = creative.getBoundingClientRect();
    const style = getComputedStyle(creative);
    const x = rect.left + window.scrollX;
    const y = rect.top + window.scrollY;
    if (rect.width < adWidth - 1 || rect.height < adHeight - 1) return { visible: false, reason: 'slot-too-small' };
    if (x < 0 || rect.right > window.innerWidth + 1 || y < 0 || y + adHeight > limit) return { visible: false, reason: 'slot-outside-capture' };
    if (style.display === 'none' || style.visibility === 'hidden') return { visible: false, reason: 'slot-hidden' };
    let current = creative;
    while (current) {
      const computed = getComputedStyle(current);
      if (computed.display === 'none' || computed.visibility === 'hidden' || Number(computed.opacity) < 0.99) return { visible: false, reason: 'slot-hidden' };
      const bounds = current.getBoundingClientRect();
      if (current !== creative && /hidden|clip|auto|scroll/.test(`${computed.overflowX} ${computed.overflowY}`) &&
          (rect.left < bounds.left - 1 || rect.top < bounds.top - 1 || rect.right > bounds.right + 1 || rect.bottom > bounds.bottom + 1)) {
        return { visible: false, reason: 'slot-clipped' };
      }
      current = current.parentElement;
    }
    const points = [[0.1, 0.1], [0.9, 0.1], [0.5, 0.5], [0.1, 0.9], [0.9, 0.9]];
    for (const [px, py] of points) {
      const vx = rect.left + adWidth * px;
      const vy = rect.top + adHeight * py;
      if (vx < 0 || vy < 0 || vx >= innerWidth || vy >= innerHeight) return { visible: false, reason: 'slot-outside-viewport' };
      const top = document.elementFromPoint(vx, vy);
      if (!top || (top !== host && !host.contains(top))) return { visible: false, reason: 'slot-occluded' };
    }
    return { visible: true, x: Math.round(x), y: Math.round(y), width: adWidth, height: adHeight };
  }, slotId, captureHeight, width, height);
}

async function rollbackPlacement(page, slotId) {
  await page.evaluate((id) => {
    const saved = window.__adframePlacementBackups?.get(id);
    if (!saved) return;
    if (saved.replacement) {
      saved.replacement.replaceWith(saved.original);
    } else {
      saved.original.replaceChildren(...saved.children);
      if (saved.style == null) saved.original.removeAttribute('style');
      else saved.original.setAttribute('style', saved.style);
    }
    window.__adframePlacementBackups.delete(id);
  }, slotId);
}

async function injectCreativeIntoDetectedSlot(page, detectedSlot, {
  adImageBuffer, adWidth = 300, adHeight = 250, slotCandidates, captureHeightLimit = 3400, selectedSlotId, signal,
} = {}) {
  if (!adImageBuffer) return { succeeded: false, reason: 'creative-not-rendered' };
  const all = slotCandidates?.length ? slotCandidates : detectedSlot ? [detectedSlot] : [];
  const candidates = selectedSlotId ? all.filter(candidate => candidate.slotId === selectedSlotId) : all;
  const rejectedCandidates = [];
  let attempts = 0;
  for (const candidate of candidates.slice(0, 5)) {
    signal?.throwIfAborted();
    attempts++;
    let committed = false;
    try {
      if (!candidate.isAd || candidate.slotWidth < adWidth - 1 || candidate.slotHeight < adHeight - 1) {
        rejectedCandidates.push({ slotId: candidate.slotId, reasons: ['incompatible-or-unproven-slot'] });
        continue;
      }
      const ready = await page.evaluate((id) => {
        const host = document.querySelector(`[data-adframe-slot-id="${CSS.escape(id)}"]`);
        if (!host) return false;
        const rect = host.getBoundingClientRect();
        window.scrollTo(0, Math.max(0, rect.top + scrollY - 100));
        return true;
      }, candidate.slotId);
      if (!ready) {
        rejectedCandidates.push({ slotId: candidate.slotId, reasons: ['slot-not-found'] });
        continue;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      const before = await getSlotVisualState(page, candidate.slotId, captureHeightLimit, adWidth, adHeight);
      if (!before.visible) {
        rejectedCandidates.push({ slotId: candidate.slotId, reasons: [before.reason] });
        continue;
      }
      const injected = await page.evaluate(async (p) => {
        const original = document.querySelector(`[data-adframe-slot-id="${CSS.escape(p.id)}"]`);
        if (!original) return { succeeded: false, reason: 'slot-not-found' };
        if (original.matches('article, main, header, nav, footer') || original.closest('nav, header, footer') ||
            (original.tagName !== 'IFRAME' && (original.querySelector('h1,h2,h3,h4,article,time,p') || (original.textContent || '').trim().length > 160))) {
          return { succeeded: false, reason: 'content-like-slot' };
        }
        const rect = original.getBoundingClientRect();
        if (rect.width < p.width - 1 || rect.height < p.height - 1) return { succeeded: false, reason: 'slot-too-small' };
        window.__adframePlacementBackups ||= new Map();
        let host = original;
        const saved = { original, style: original.getAttribute('style'), children: [...original.childNodes] };
        if (original.tagName === 'IFRAME') {
          host = document.createElement('div');
          for (const attribute of original.attributes) {
            if (!['src', 'srcdoc', 'sandbox', 'name', 'onload'].includes(attribute.name)) host.setAttribute(attribute.name, attribute.value);
          }
          const computed = getComputedStyle(original);
          for (const property of ['position', 'top', 'right', 'bottom', 'left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
            'padding', 'border', 'transform', 'transform-origin', 'vertical-align', 'float', 'z-index', 'flex', 'align-self', 'grid-area', 'order']) {
            host.style.setProperty(property, computed.getPropertyValue(property));
          }
          host.style.display = computed.display === 'inline' ? 'inline-block' : computed.display;
          saved.replacement = host;
          original.replaceWith(host);
        }
        window.__adframePlacementBackups.set(p.id, saved);
        host.style.boxSizing = 'border-box';
        host.style.width = `${rect.width}px`;
        host.style.height = `${rect.height}px`;
        host.style.minWidth = `${rect.width}px`;
        host.style.minHeight = `${rect.height}px`;
        host.replaceChildren();
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        const creative = document.createElement('div');
        creative.setAttribute('data-adframe-creative', 'true');
        creative.setAttribute('data-adframe-injected', 'true');
        Object.assign(creative.style, { position: 'absolute', width: `${p.width}px`, height: `${p.height}px`, left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)', background: '#fff', overflow: 'hidden' });
        const img = document.createElement('img');
        img.src = p.src;
        img.alt = 'Ad creative';
        Object.assign(img.style, { display: 'block', width: `${p.width}px`, height: `${p.height}px`, maxWidth: 'none', maxHeight: 'none', objectFit: 'contain' });
        creative.append(img);
        host.append(creative);
        await Promise.race([img.decode(), new Promise((_, reject) => setTimeout(() => reject(new Error('creative-decode-timeout')), 1500))]);
        return { succeeded: true };
      }, { id: candidate.slotId, width: adWidth, height: adHeight, src: `data:image/png;base64,${adImageBuffer.toString('base64')}` });
      if (!injected.succeeded) {
        rejectedCandidates.push({ slotId: candidate.slotId, reasons: [injected.reason] });
        continue;
      }
      const after = await getSlotVisualState(page, candidate.slotId, captureHeightLimit, adWidth, adHeight);
      if (!after.visible) {
        rejectedCandidates.push({ slotId: candidate.slotId, reasons: [after.reason] });
        continue;
      }
      const rendered = await page.screenshot({ type: 'png', clip: { x: after.x, y: after.y, width: adWidth, height: adHeight } });
      const verification = await compareCreativePixels(adImageBuffer, Buffer.from(rendered));
      if (!verification.passed) {
        rejectedCandidates.push({ slotId: candidate.slotId, reasons: ['creative-pixel-mismatch'], verification });
        continue;
      }
      signal?.throwIfAborted();
      committed = true;
      return { succeeded: true, ...after, slotWidth: candidate.slotWidth, slotHeight: candidate.slotHeight,
        selectedSlotId: candidate.slotId, selectedSlotScore: candidate.score, selectedSlotType: candidate.type,
        attempts, visuallyVerified: true, creativeVerification: verification, rejectedCandidates };
    } catch (error) {
      signal?.throwIfAborted();
      if (page.isClosed()) throw error;
      rejectedCandidates.push({ slotId: candidate.slotId, reasons: ['creative-injection-error'], message: error.message });
    } finally {
      if (!committed && !page.isClosed()) await rollbackPlacement(page, candidate.slotId);
    }
  }
  return { succeeded: false, reason: candidates.length ? 'all-candidates-failed' : 'no-slot', attempts, rejectedCandidates };
}

module.exports = { injectCreativeIntoDetectedSlot, getSlotVisualState };
