const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { getEffectiveOutputDir } = require('./settings-store');

const artifacts = new Map();
const MAX_DIAGNOSTICS = 20;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function prune(directory) {
  const reports = fs.readdirSync(directory).filter(name => /^[a-f0-9-]+\.json$/.test(name))
    .map(name => ({ name, mtime: fs.statSync(path.join(directory, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const [index, file] of reports.entries()) {
    if (index < MAX_DIAGNOSTICS && Date.now() - file.mtime < MAX_AGE_MS) continue;
    const id = file.name.slice(0, -5);
    for (const extension of ['json', 'png']) fs.rmSync(path.join(directory, `${id}.${extension}`), { force: true });
    artifacts.delete(id);
  }
}

function summarize(diagnostics, failureCode) {
  if (failureCode === 'adtag_render_failed') return 'The ad tag did not produce a verifiable image. Upload an image or try another tag.';
  if (failureCode === 'capture_navigation_failed') return 'The publisher could not be loaded. Try again or choose another publisher.';
  if (!diagnostics.pageState?.usable) return 'The page was empty or blocked. Check the captured page or choose another publisher.';
  if (diagnostics.finalCreativeVerification?.passed === false) return 'The ad is not fully visible in the final image. Check the diagnostic page before retrying.';
  const reasons = diagnostics.slotDetection?.rejectionSummary || {};
  if (diagnostics.domInjection?.rejectionSummary?.['slot-occluded']) return 'An overlay covers the ad position. Check the captured page before retrying.';
  if (reasons['outside-capture-range']) return 'The detected ad positions are below the captured section of the page. Try another format or publisher.';
  if (reasons['dimension-reject']) return 'The detected ad positions do not fit this format. Try a different ad size or publisher.';
  return 'No safe ad position could be verified. The captured page and report show what was detected.';
}

function storeFailureDiagnostic(error) {
  if (!error.captureDiagnostics || error.code === 'MOCKUP_TIMEOUT') return null;
  try {
    const directory = path.join(getEffectiveOutputDir(), 'diagnostics');
    fs.mkdirSync(directory, { recursive: true });
    const id = randomUUID();
    const report = { kind: 'failed-capture-diagnostic', failureCode: error.code || 'capture_failed',
      createdAt: new Date().toISOString(), summary: summarize(error.captureDiagnostics, error.code), diagnostics: error.captureDiagnostics };
    fs.writeFileSync(path.join(directory, `${id}.json`), JSON.stringify(report, null, 2));
    if (error.diagnosticScreenshot) fs.writeFileSync(path.join(directory, `${id}.png`), error.diagnosticScreenshot);
    artifacts.set(id, { directory, createdAt: Date.now(), hasPreview: Boolean(error.diagnosticScreenshot) });
    prune(directory);
    return { id, summary: report.summary, reportUrl: `/api/capture-diagnostics/${id}/report`,
      previewUrl: error.diagnosticScreenshot ? `/api/capture-diagnostics/${id}/preview` : null };
  } catch (error) {
    console.warn('Could not store capture diagnostic:', error.message);
    return null;
  }
}

function getFailureDiagnostic(id, kind) {
  const artifact = artifacts.get(id);
  if (artifact) prune(artifact.directory);
  if (!artifacts.has(id) || !artifact || !['report', 'preview'].includes(kind) || Date.now() - artifact.createdAt >= MAX_AGE_MS) return null;
  const filename = path.join(artifact.directory, `${id}.${kind === 'report' ? 'json' : 'png'}`);
  if (!fs.existsSync(filename) || (kind === 'preview' && !artifact.hasPreview)) return null;
  return kind === 'report' ? JSON.parse(fs.readFileSync(filename, 'utf8')) : filename;
}

module.exports = { storeFailureDiagnostic, getFailureDiagnostic };
