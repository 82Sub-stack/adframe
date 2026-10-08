const express = require('express');
const router = express.Router();
const { suggestWebsites } = require('../services/gemini');
const { preflightSuggestions } = require('../services/preflight');
const { probeWebsiteAdSlots } = require('../services/puppeteer');
const { FAILURE_CODES } = require('../services/failure-codes');
const { CURATED_SOURCE, getGermanyCuratedPublishers } = require('../services/curated-germany-publishers');
const queue = require('../utils/queue');
const { runWithDeadline } = require('../services/job-deadline');

const CURATED_DISPLAY_LIMIT = 5;
const CURATED_CANDIDATE_COUNT = 10;
const USE_GEMINI_DISCOVERY = process.env.SUGGESTION_DISCOVERY === 'gemini';
const CURATED_SLOT_PROBE_ENABLED = process.env.CURATED_SLOT_PROBE !== 'false';
const CURATED_SLOT_PROBE_CONCURRENCY = Math.max(
  1,
  Math.min(Number.parseInt(process.env.CURATED_SLOT_PROBE_CONCURRENCY || '', 10) || 2, 4)
);

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 24;
  return Math.min(parsed, 30);
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

function getProbeRankScore(site) {
  const probe = site.slotProbe;
  const generationBoost = site.generationProven && probe?.status === 'ok' ? 50 : 0;
  const curatedBoost = Number.isFinite(site.curatedRankBoost) ? site.curatedRankBoost : 0;
  if (!probe || probe.status === 'failed') {
    return -1000 + (site.preflight?.score || 0) + generationBoost + curatedBoost;
  }

  let score = (site.preflight?.score || 0) + generationBoost + curatedBoost;
  if (probe.status === 'ok') score += 1000;
  if (probe.bestSlot?.confidence === 'high') score += 240;
  else if (probe.bestSlot?.confidence === 'medium') score += 160;
  else if (probe.bestSlot?.confidence === 'low') score += 60;
  score += Math.min(120, (probe.bestSlot?.score || 0));
  score += Math.min(40, (probe.candidateCount || 0) * 8);
  if (probe.bestSlot?.type === 'iframe' || probe.bestSlot?.type === 'gpt') score += 35;
  return score;
}

async function attachSlotProbes(sites, { device, adSize }) {
  if (!CURATED_SLOT_PROBE_ENABLED || sites.length === 0) return sites;
  const [adWidth, adHeight] = String(adSize || '300x250').split('x').map(Number);

  const enriched = [...sites];
  try {
    await runWithDeadline(batchSignal => mapWithConcurrency(
    sites,
    CURATED_SLOT_PROBE_CONCURRENCY,
    async (site, index) => {
      try {
        const slotProbe = await runWithDeadline(signal => queue.run(() => probeWebsiteAdSlots(
          site.preflight?.finalUrl || site.url,
          device || 'desktop',
          Number.isFinite(adWidth) ? adWidth : 300,
          Number.isFinite(adHeight) ? adHeight : 250,
          { signal }
        ), { signal }), 20000, batchSignal);
        enriched[index] = { ...site, slotProbe };
      } catch (error) {
        enriched[index] = { ...site, slotProbe: { status: 'failed', candidateCount: 0, failureCode: error.code || 'slot_probe_failed' } };
      }
    }), 45000);
  } catch (error) {
    if (error.code !== 'MOCKUP_TIMEOUT') throw error;
  }
  return enriched;
}

router.post('/', async (req, res) => {
  try {
    const { topic, country, adSize, device, limit } = req.body;

    if (!topic || !country) {
      return res.status(400).json({ error: 'Topic and country are required', failureCode: FAILURE_CODES.INVALID_INPUT });
    }

    if (!USE_GEMINI_DISCOVERY) {
      if (country !== 'Germany') {
        return res.status(422).json({
          error: 'Curated publisher selection is currently available for Germany only.',
          failureCode: FAILURE_CODES.INVALID_INPUT,
          metadata: {
            source: CURATED_SOURCE,
            supportedCountries: ['Germany'],
          },
        });
      }

      const curated = getGermanyCuratedPublishers(topic);
      if (!curated.topic) {
        return res.status(422).json({
          error: 'Curated publisher selection supports sports, finance, news, tech, automotive, lifestyle, cooking, and travel.',
          failureCode: FAILURE_CODES.INVALID_INPUT,
          metadata: {
            source: CURATED_SOURCE,
            supportedTopics: ['sports', 'finance', 'news', 'tech', 'automotive', 'lifestyle', 'cooking', 'travel'],
          },
        });
      }

      const scored = await preflightSuggestions(curated.candidates, {
        topic: curated.topic,
        country,
        adSize,
        device,
        limit: CURATED_CANDIDATE_COUNT,
      });
      const viable = scored.filter((site) => site.preflight?.status !== 'failed');
      const probed = await attachSlotProbes(viable, { device, adSize });
      const ranked = [...probed].sort((a, b) => getProbeRankScore(b) - getProbeRankScore(a));
      const suggestions = ranked.slice(0, CURATED_DISPLAY_LIMIT);
      const backupSuggestions = ranked.slice(CURATED_DISPLAY_LIMIT);

      return res.json({
        suggestions,
        backupSuggestions,
        metadata: {
          source: CURATED_SOURCE,
          preflighted: true,
          topic: curated.topic,
          candidateCount: curated.candidates.length,
          displayLimit: CURATED_DISPLAY_LIMIT,
          count: suggestions.length,
          backupCount: backupSuggestions.length,
          slotProbed: CURATED_SLOT_PROBE_ENABLED,
        },
      });
    }

    const suggestionLimit = parseLimit(limit);
    const rawSuggestions = await suggestWebsites(topic, country, {
      limit: Math.max(suggestionLimit, 24),
    });
    const suggestions = await preflightSuggestions(rawSuggestions, {
      topic,
      country,
      adSize,
      device,
      limit: suggestionLimit,
    });

    res.json({
      suggestions,
      backupSuggestions: [],
      metadata: {
        source: 'gemini',
        preflighted: true,
        count: suggestions.length,
      },
    });
  } catch (err) {
    console.error('Website suggestion error:', err);
    res.status(500).json({ error: 'Failed to suggest websites. Please try again.', failureCode: FAILURE_CODES.UNKNOWN });
  }
});

module.exports = router;
