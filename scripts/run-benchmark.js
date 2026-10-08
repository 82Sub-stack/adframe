#!/usr/bin/env node

process.env.NODE_ENV = 'production';
process.env.MOCKUP_CONCURRENCY ||= '1';
const fs = require('fs');
const path = require('path');
const { once } = require('events');

const sharp = require('../server/node_modules/sharp');
const { createApp } = require('../server/app');
const { closeBrowser } = require('../server/services/puppeteer');

const ROOT_DIR = path.join(__dirname, '..');
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const BENCHMARK_DIR = path.join(ROOT_DIR, 'server', 'output', 'benchmarks', RUN_ID);
const DATA_DIR = path.join(BENCHMARK_DIR, 'data');
const GENERATED_DIR = path.join(BENCHMARK_DIR, 'generated');

const BASELINE_MATRIX = [
  { topic: 'sports', country: 'Germany', adSize: '300x250', device: 'desktop', mockups: 3, maxAttempts: 5 },
  { topic: 'finance', country: 'Germany', adSize: '300x250', device: 'desktop', mockups: 3, maxAttempts: 5 },
  { topic: 'news', country: 'Germany', adSize: '300x250', device: 'desktop', mockups: 3, maxAttempts: 5 },
  { topic: 'tech', country: 'Germany', adSize: '300x250', device: 'desktop', mockups: 3, maxAttempts: 5 },
  { topic: 'automotive', country: 'Germany', adSize: '300x250', device: 'desktop', mockups: 3, maxAttempts: 5 },
  { topic: 'lifestyle', country: 'Germany', adSize: '300x250', device: 'desktop', mockups: 3, maxAttempts: 5 },
  { topic: 'cooking', country: 'Germany', adSize: '300x250', device: 'desktop', mockups: 3, maxAttempts: 5 },
  { topic: 'travel', country: 'Germany', adSize: '300x250', device: 'desktop', mockups: 3, maxAttempts: 5 },
];

const EXTENDED_MATRIX = [
  ['300x600','desktop'], ['728x90','desktop'], ['160x600','desktop'], ['970x250','desktop'], ['300x250','mobile'], ['300x600','mobile'],
].map(([adSize,device]) => ({topic:'news', country:'Germany', adSize, device, mockups:1, maxAttempts:3}));
const requestedTopics = process.env.BENCHMARK_TOPICS?.split(',');
const MATRIX = [...BASELINE_MATRIX, ...EXTENDED_MATRIX].filter(entry => !requestedTopics || requestedTopics.includes(entry.topic));
function isVerified(mockup) { return mockup.ok && mockup.quality?.status === 'passed' && mockup.quality?.creativeVerification?.passed === true; }


function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

async function createCreativePng(width, height, label) {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#143D5A"/>
    <rect x="8" y="8" width="${width - 16}" height="${height - 16}" fill="#F2C14E"/>
    <text x="${width / 2}" y="${height / 2 - 4}" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#143D5A">AdFrame</text>
    <text x="${width / 2}" y="${height / 2 + 18}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#143D5A">${label}</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function postJson(baseUrl, pathname, body) {
  const startedAt = nowMs();
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    durationMs: nowMs() - startedAt,
    payload,
  };
}

async function postMockup(baseUrl, request, creativeBuffer) {
  const form = new FormData();
  form.append('websiteUrl', request.websiteUrl);
  form.append('topic', request.topic);
  form.append('adSize', request.adSize);
  form.append('device', request.device);
  form.append('allowHeuristicFallback', 'false');
  form.append('adImage', new Blob([creativeBuffer], { type: 'image/png' }), 'benchmark.png');

  const startedAt = nowMs();
  const response = await fetch(`${baseUrl}/api/generate-mockup`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(90000),
  });
  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    durationMs: nowMs() - startedAt,
    payload,
  };
}

function summarizeSuggestion(site) {
  return {
    name: site.name,
    url: site.url,
    score: site.preflight?.score ?? null,
    status: site.preflight?.status || null,
    confidence: site.preflight?.confidence || null,
    failureCode: site.preflight?.failureCode || null,
    reachable: Boolean(site.preflight?.reachable),
    topicScore: site.preflight?.topicScore ?? null,
    countryScore: site.preflight?.countryScore ?? null,
    adSignalCount: site.preflight?.adSignalCount ?? null,
    slotProbe: site.slotProbe ? {
      status: site.slotProbe.status,
      candidateCount: site.slotProbe.candidateCount,
      bestSlotScore: site.slotProbe.bestSlot?.score ?? null,
      bestSlotConfidence: site.slotProbe.bestSlot?.confidence || null,
      bestSlotType: site.slotProbe.bestSlot?.type || null,
    } : null,
    reasons: site.preflight?.reasons || [],
    warnings: site.preflight?.warnings || [],
  };
}

function summarizeMockup(result) {
  const placement = result.payload?.metadata?.placement || {};
  return {
    ok: result.ok,
    status: result.status,
    durationMs: result.durationMs,
    mockupId: result.payload?.mockupId || null,
    error: result.payload?.error || null,
    failureCode: result.payload?.failureCode || placement.failureCode || null,
    finalUrl: result.payload?.metadata?.websiteUrl || null,
    method: placement.method || null,
    slotId: placement.slotId || null,
    detectionScore: placement.detectionScore ?? null,
    renderConfidence: placement.renderConfidence || null,
    visuallyVerified: Boolean(placement.visuallyVerified),
    quality: result.payload?.metadata?.quality || null,
    diagnostics: result.payload?.metadata?.diagnostics || null,
  };
}

async function runCase(baseUrl, entry) {
  const [width, height] = entry.adSize.split('x').map(Number);
  const creativeBuffer = await createCreativePng(width, height, entry.adSize);
  const suggestionResult = await postJson(baseUrl, '/api/suggest-websites', {
    topic: entry.topic,
    country: entry.country,
    adSize: entry.adSize,
    device: entry.device,
    limit: 5,
  });

  const suggestions = suggestionResult.payload?.suggestions || [];
  const backupSuggestions = suggestionResult.payload?.backupSuggestions || [];
  const allCandidates = [...suggestions, ...backupSuggestions];
  const viable = allCandidates.filter((site) => site.preflight?.status !== 'failed');
  const mockups = [];

  const targetSuccesses = entry.mockups || 1;
  const maxAttempts = Math.min(viable.length, entry.maxAttempts || Math.max(targetSuccesses + 3, 4));

  for (const site of viable.slice(0, maxAttempts)) {
    if (mockups.filter(isVerified).length >= targetSuccesses) break;
    let mockupResult;
    try { mockupResult = await postMockup(baseUrl, {
      websiteUrl: site.url,
      topic: entry.topic,
      adSize: entry.adSize,
      device: entry.device,
    }, creativeBuffer);
    } catch (error) { mockupResult = { ok:false, status:0, durationMs:0, payload:{error:error.message, failureCode:'benchmark_request_failed'} }; }

    mockups.push({
      websiteUrl: site.url,
      ...summarizeMockup(mockupResult),
    });
  }

  return {
    input: entry,
    suggestions: {
      ok: suggestionResult.ok,
      status: suggestionResult.status,
      durationMs: suggestionResult.durationMs,
      count: suggestions.length,
      backupCount: backupSuggestions.length,
      viableCount: viable.length,
      metadata: suggestionResult.payload?.metadata || null,
      top: suggestions.slice(0, 5).map(summarizeSuggestion),
      backups: backupSuggestions.map(summarizeSuggestion),
    },
    mockups,
  };
}

async function main() {
  ensureDir(DATA_DIR);
  ensureDir(GENERATED_DIR);

  process.env.ADFRAME_DATA_DIR = DATA_DIR;
  process.env.ADFRAME_OUTPUT_DIR = GENERATED_DIR;

  const app = createApp({
    dataDir: DATA_DIR,
    outputDir: GENERATED_DIR,
  });
  const server = app.listen(0);
  await once(server, 'listening');

  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const startedAt = new Date().toISOString();
  const results = [];

  try {
    for (const entry of MATRIX) {
      console.log(`Benchmarking ${entry.country} / ${entry.topic} / ${entry.adSize} / ${entry.device}`);
      try { results.push(await runCase(baseUrl, entry)); }
      catch (error) { results.push({input:entry,suggestions:{ok:false,error:error.message},mockups:[]}); }
      fs.writeFileSync(path.join(BENCHMARK_DIR,'partial-results.json'),JSON.stringify(results,null,2));
    }
  } finally {
    await closeBrowser();
    await new Promise((resolve) => server.close(resolve));
  }

  const failures = results.flatMap((result) => (
    result.mockups
      .filter((mockup) => !isVerified(mockup))
      .map((mockup) => mockup.failureCode || mockup.quality?.code || 'unknown')
  ));
  const failureCounts = failures.reduce((acc, code) => {
    acc[code] = (acc[code] || 0) + 1;
    return acc;
  }, {});

  const report = {
    runId: RUN_ID,
    startedAt,
    finishedAt: new Date().toISOString(),
    benchmarkDir: BENCHMARK_DIR,
    generatedDir: GENERATED_DIR,
    configuration: {mode:'production',viewportWidth:process.env.CAPTURE_VIEWPORT_WIDTH || 1366,maxCaptureHeight:process.env.CAPTURE_MAX_HEIGHT || 3400,maxScrollPx:process.env.CAPTURE_MAX_SCROLL_PX || 1600,creativeInput:'uploaded-image'},
    summary: {
      cases: results.length,
      mockupsAttempted: results.reduce((sum, result) => sum + result.mockups.length, 0),
      httpSucceeded: results.reduce((sum, result) => sum + result.mockups.filter((mockup) => mockup.ok).length, 0),
      mockupsSucceeded: results.reduce((sum, result) => sum + result.mockups.filter(isVerified).length, 0),
      qualityWarnings: results.reduce((sum, result) => sum + result.mockups.filter(mockup => mockup.quality?.status === 'warning').length, 0),
      casesMeetingTarget: results.filter(result => result.mockups.filter(isVerified).length >= result.input.mockups).length,
      failureCounts,
    },
    results,
  };

  const reportPath = path.join(BENCHMARK_DIR, 'benchmark-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Benchmark report: ${reportPath}`);
  process.exitCode = report.summary.casesMeetingTarget === results.length ? 0 : 1;
}

main().catch(async (error) => {
  console.error(error);
  await closeBrowser().catch(() => {});
  process.exitCode = 1;
});
