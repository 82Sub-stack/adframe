/**
 * Lightweight publisher preflight checks for ranked website suggestions.
 * This avoids spending a full Puppeteer mockup run on obviously weak targets.
 */

const { BLOCKED_DOMAINS } = require('./blocked-domains');
const { FAILURE_CODES } = require('./failure-codes');

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const PREFLIGHT_TIMEOUT_MS = Number.parseInt(process.env.SUGGESTION_PREFLIGHT_TIMEOUT_MS || '', 10) || 4500;
const PREFLIGHT_CONCURRENCY = Number.parseInt(process.env.SUGGESTION_PREFLIGHT_CONCURRENCY || '', 10) || 4;
const MAX_HTML_CHARS = 160000;

const TOPIC_HINTS = {
  sports: ['sport', 'sports', 'soccer', 'football', 'fussball'],
  soccer: ['soccer', 'football', 'fussball', 'sport'],
  finance: ['finance', 'money', 'wirtschaft', 'boerse', 'business'],
  news: ['news', 'politik', 'world', 'nachrichten'],
  tech: ['tech', 'technology', 'it', 'digital', 'ki', 'ai'],
  automotive: ['auto', 'automotive', 'cars', 'mobilitaet'],
  travel: ['travel', 'reisen', 'urlaub'],
  cooking: ['cooking', 'rezepte', 'food', 'recipe', 'essen'],
  lifestyle: ['lifestyle', 'leben', 'style'],
};

const COUNTRY_HINTS = {
  germany: {
    tlds: ['.de'],
    terms: ['germany', 'deutschland', 'deutsch', 'german'],
    languages: ['de'],
  },
  austria: {
    tlds: ['.at'],
    terms: ['austria', 'oesterreich', 'österreich'],
    languages: ['de'],
  },
  switzerland: {
    tlds: ['.ch'],
    terms: ['switzerland', 'schweiz', 'suisse', 'svizzera'],
    languages: ['de', 'fr', 'it'],
  },
  'united kingdom': {
    tlds: ['.uk', '.co.uk'],
    terms: ['united kingdom', 'uk', 'britain', 'british'],
    languages: ['en'],
  },
  france: {
    tlds: ['.fr'],
    terms: ['france', 'francais', 'français'],
    languages: ['fr'],
  },
  italy: {
    tlds: ['.it'],
    terms: ['italy', 'italia', 'italiano'],
    languages: ['it'],
  },
  spain: {
    tlds: ['.es'],
    terms: ['spain', 'espana', 'españa', 'espanol', 'español'],
    languages: ['es'],
  },
  netherlands: {
    tlds: ['.nl'],
    terms: ['netherlands', 'nederland', 'dutch'],
    languages: ['nl'],
  },
  poland: {
    tlds: ['.pl'],
    terms: ['poland', 'polska', 'polski'],
    languages: ['pl'],
  },
};

const AD_PATTERNS = [
  /googletag/g,
  /gpt\.js/g,
  /securepubads/g,
  /doubleclick/g,
  /googlesyndication/g,
  /amazon-adsystem/g,
  /adform/g,
  /adition/g,
  /data-ad[-_a-z]*/g,
  /ad-slot/g,
  /adslot/g,
  /ad-container/g,
  /ad-unit/g,
  /advertisement/g,
  /leaderboard/g,
  /billboard/g,
  /skyscraper/g,
  /medium-rectangle/g,
];

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function normalizeUrl(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isBlockedDomain(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return BLOCKED_DOMAINS.some((blocked) => {
      if (blocked.includes('*')) {
        return hostname.startsWith(blocked.replace('.*', ''));
      }
      return hostname === blocked || hostname.endsWith(`.${blocked}`);
    });
  } catch {
    return true;
  }
}

function getSuggestionKey(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname.replace(/\/$/, '')}`;
  } catch {
    return url;
  }
}

function buildTopicKeywords(topic) {
  if (!topic || typeof topic !== 'string') return [];
  const tokens = topic.trim().toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const expanded = [...tokens];

  for (const token of tokens) {
    if (TOPIC_HINTS[token]) {
      expanded.push(...TOPIC_HINTS[token]);
    }
  }
  if (tokens.includes('ai')) {
    expanded.push('ki', 'artificial-intelligence');
  }

  return unique(expanded).slice(0, 10);
}

function getCountryHints(country) {
  if (!country || typeof country !== 'string') {
    return { tlds: [], terms: [], languages: [] };
  }
  return COUNTRY_HINTS[country.trim().toLowerCase()] || { tlds: [], terms: [], languages: [] };
}

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function getPathDepth(url) {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    return segments.length;
  } catch {
    return 0;
  }
}

async function fetchHtml(url, userAgent) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PREFLIGHT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    const contentType = response.headers.get('content-type') || '';
    const isHtml = /text\/html|application\/xhtml\+xml/i.test(contentType);
    const text = isHtml ? (await response.text()).slice(0, MAX_HTML_CHARS) : '';

    return {
      ok: response.ok && isHtml,
      status: response.status,
      finalUrl: response.url || url,
      contentType,
      html: text,
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractTagContent(html, pattern) {
  const match = html.match(pattern);
  return match?.[1] ? match[1].toLowerCase() : '';
}

function scoreCountryFit({ html, finalUrl, country }) {
  const hints = getCountryHints(country);
  if (hints.tlds.length === 0 && hints.terms.length === 0 && hints.languages.length === 0) {
    return { score: 0, matched: false, reasons: [], warnings: [] };
  }

  let hostname = '';
  let lowerUrl = '';
  try {
    const parsed = new URL(finalUrl);
    hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
    lowerUrl = parsed.href.toLowerCase();
  } catch {
    lowerUrl = String(finalUrl || '').toLowerCase();
  }

  const lowerHtml = html.toLowerCase();
  const head = lowerHtml.slice(0, 50000);
  const htmlLang = extractTagContent(html, /<html[^>]+\blang=["']?([a-z-]+)/i).split('-')[0];
  const ogLocale = extractTagContent(html, /<meta[^>]+property=["']og:locale["'][^>]+content=["']([^"']+)/i).split(/[_-]/)[0];
  const title = extractTagContent(html, /<title[^>]*>([^<]+)/i);
  const metaDescription = extractTagContent(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i);

  const reasons = [];
  const warnings = [];
  let score = 0;

  if (hints.tlds.some((tld) => hostname.endsWith(tld))) {
    score += 14;
    reasons.push('Country domain');
  }

  const languageMatches = [htmlLang, ogLocale].some((lang) => hints.languages.includes(lang));
  if (languageMatches) {
    score += 8;
    reasons.push('Language match');
  }

  const countryText = `${lowerUrl} ${title} ${metaDescription} ${head.slice(0, 8000)}`;
  if (hints.terms.some((term) => countryText.includes(term))) {
    score += 8;
    reasons.push('Country text');
  }

  const matched = score > 0;
  if (!matched) {
    warnings.push('Country fit unclear');
  }

  return {
    score: Math.min(22, score),
    matched,
    reasons,
    warnings,
  };
}

function scoreHtml({ html, finalUrl, topicKeywords, adSize, device, country }) {
  const lowerHtml = html.toLowerCase();
  const lowerUrl = finalUrl.toLowerCase();
  const head = lowerHtml.slice(0, 50000);
  const [adWidth, adHeight] = String(adSize || '300x250').split('x').map(Number);
  const title = extractTagContent(html, /<title[^>]*>([^<]+)/i);
  const metaDescription = extractTagContent(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i);
  const h1Text = [...html.matchAll(/<h1[^>]*>(.*?)<\/h1>/gis)]
    .map((match) => match[1].replace(/<[^>]+>/g, ' ').toLowerCase())
    .join(' ')
    .slice(0, 2000);

  let topicScore = 0;
  for (const keyword of topicKeywords) {
    if (lowerUrl.includes(keyword)) topicScore += 7;
    if (title.includes(keyword)) topicScore += 7;
    if (metaDescription.includes(keyword)) topicScore += 5;
    if (h1Text.includes(keyword)) topicScore += 4;
    if (head.includes(keyword)) topicScore += 2;
  }
  topicScore = Math.min(topicScore, 25);

  const adSignalCount = AD_PATTERNS.reduce((sum, pattern) => sum + countMatches(lowerHtml, pattern), 0);
  const adSlotLikely = adSignalCount >= 2;

  const sizeTokens = [
    `${adWidth}x${adHeight}`,
    `${adWidth} x ${adHeight}`,
    `width="${adWidth}"`,
    `width='${adWidth}'`,
    `width:${adWidth}px`,
    `height="${adHeight}"`,
    `height='${adHeight}'`,
    `height:${adHeight}px`,
  ];
  const adSizeCompatible = Number.isFinite(adWidth) && Number.isFinite(adHeight)
    ? sizeTokens.some((token) => lowerHtml.includes(token))
    : false;

  const mobileReady =
    /<meta[^>]+name=["']viewport["']/i.test(html) ||
    /responsive|mobile|@media|max-width|min-width/i.test(html);

  const paywallRisk = /paywall|subscribe to continue|subscription|registrieren|abonnement|premium article|metered/i.test(html);
  const sectionUrl = getPathDepth(finalUrl) > 0;
  const countryFit = scoreCountryFit({ html, finalUrl, country });

  return {
    topicScore,
    countryScore: countryFit.score,
    countryFit: countryFit.matched,
    countryReasons: countryFit.reasons,
    countryWarnings: countryFit.warnings,
    adSignalCount,
    adSlotLikely,
    adSizeCompatible,
    mobileReady: device === 'mobile' ? mobileReady : true,
    paywallRisk,
    sectionUrl,
  };
}

function buildPreflightResult({ suggestion, requestedUrl, fetchResult, checks, blocked, error }) {
  const reasons = [];
  const warnings = [];

  if (blocked) {
    return {
      ...suggestion,
      url: requestedUrl,
      preflight: {
        status: 'failed',
        score: 0,
        confidence: 'low',
        reachable: false,
        failureCode: FAILURE_CODES.PREFLIGHT_BLOCKED,
        finalUrl: requestedUrl,
        reasons: ['Blocked domain'],
        warnings: [],
      },
    };
  }

  if (error || !fetchResult?.ok) {
    return {
      ...suggestion,
      url: requestedUrl,
      preflight: {
        status: 'failed',
        score: 0,
        confidence: 'low',
        reachable: false,
        failureCode: error ? FAILURE_CODES.PREFLIGHT_ERROR : FAILURE_CODES.PREFLIGHT_UNREACHABLE,
        httpStatus: fetchResult?.status,
        finalUrl: fetchResult?.finalUrl || requestedUrl,
        reasons: [error ? 'Preflight request failed' : 'No reachable HTML page'],
        warnings: [],
      },
    };
  }

  let score = 30;
  score += checks.topicScore;
  score += checks.countryScore;
  score += Math.min(25, checks.adSignalCount * 3);
  if (checks.adSlotLikely) score += 12;
  if (checks.adSizeCompatible) score += 8;
  if (checks.mobileReady) score += 8;
  if (checks.sectionUrl) score += 5;
  if (checks.paywallRisk) score -= 12;

  if (checks.topicScore >= 10) reasons.push('Topic match');
  else warnings.push('Weak topic match');

  if (checks.countryFit) reasons.push(...checks.countryReasons);
  else warnings.push(...checks.countryWarnings);

  if (checks.adSlotLikely) reasons.push('Ad signals found');
  else warnings.push('Few ad signals');

  if (checks.adSizeCompatible) reasons.push(`${suggestion.adSize || 'Selected'} size hints`);
  if (checks.mobileReady) reasons.push('Mobile-ready markup');
  else warnings.push('Mobile readiness unclear');

  if (checks.paywallRisk) warnings.push('Possible paywall');

  const roundedScore = Math.max(0, Math.min(100, Math.round(score)));
  const confidence = roundedScore >= 72 ? 'high' : roundedScore >= 48 ? 'medium' : 'low';
  const status = roundedScore >= 48 ? 'ok' : 'warning';

  return {
    ...suggestion,
    url: fetchResult.finalUrl || requestedUrl,
    preflight: {
      status,
      score: roundedScore,
      confidence,
      reachable: true,
      httpStatus: fetchResult.status,
      finalUrl: fetchResult.finalUrl || requestedUrl,
      topicScore: checks.topicScore,
      countryScore: checks.countryScore,
      countryFit: checks.countryFit,
      adSignalCount: checks.adSignalCount,
      adSlotLikely: checks.adSlotLikely,
      adSizeCompatible: checks.adSizeCompatible,
      mobileReady: checks.mobileReady,
      paywallRisk: checks.paywallRisk,
      reasons,
      warnings,
      checkedAt: new Date().toISOString(),
    },
  };
}

async function preflightOne(suggestion, options) {
  const requestedUrl = normalizeUrl(suggestion.url);
  if (!requestedUrl) {
    return buildPreflightResult({
      suggestion,
      requestedUrl: suggestion.url,
      error: new Error('Invalid URL'),
    });
  }

  const blocked = isBlockedDomain(requestedUrl);
  if (blocked) {
    return buildPreflightResult({ suggestion, requestedUrl, blocked: true });
  }

  try {
    const fetchResult = await fetchHtml(
      requestedUrl,
      options.device === 'mobile' ? MOBILE_UA : DESKTOP_UA
    );
    const checks = scoreHtml({
      html: fetchResult.html || '',
      finalUrl: fetchResult.finalUrl || requestedUrl,
      topicKeywords: options.topicKeywords,
      adSize: options.adSize,
      device: options.device,
      country: options.country,
    });

    return buildPreflightResult({
      suggestion: { ...suggestion, adSize: options.adSize },
      requestedUrl,
      fetchResult,
      checks,
    });
  } catch (error) {
    return buildPreflightResult({ suggestion, requestedUrl, error });
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = [];
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function preflightSuggestions(suggestions, options = {}) {
  const limit = Math.max(1, Math.min(Number.parseInt(options.limit, 10) || 12, 20));
  const seen = new Set();
  const candidates = [];

  for (const suggestion of suggestions || []) {
    const normalized = normalizeUrl(suggestion.url);
    if (!normalized) continue;
    const key = getSuggestionKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ ...suggestion, url: normalized });
  }

  const scored = await mapWithConcurrency(
    candidates.slice(0, Math.max(limit, 12)),
    PREFLIGHT_CONCURRENCY,
    (suggestion) => preflightOne(suggestion, {
      topicKeywords: buildTopicKeywords(options.topic),
      country: options.country,
      adSize: options.adSize || '300x250',
      device: options.device || 'desktop',
    })
  );

  return scored
    .sort((a, b) => {
      const aFailed = a.preflight?.status === 'failed' ? 1 : 0;
      const bFailed = b.preflight?.status === 'failed' ? 1 : 0;
      if (aFailed !== bFailed) return aFailed - bFailed;
      return (b.preflight?.score || 0) - (a.preflight?.score || 0);
    })
    .slice(0, limit);
}

module.exports = {
  preflightSuggestions,
};
