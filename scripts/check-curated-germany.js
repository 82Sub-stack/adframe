#!/usr/bin/env node

const assert = require('assert');
const express = require('../server/node_modules/express');
const suggestRoutes = require('../server/routes/suggest');
const {
  CURATED_SOURCE,
  GERMANY_CURATED_PUBLISHERS,
  getGermanyCuratedPublishers,
} = require('../server/services/curated-germany-publishers');

const EXPECTED_TOPICS = [
  'sports',
  'finance',
  'news',
  'tech',
  'automotive',
  'lifestyle',
  'cooking',
  'travel',
];

function assertCatalogShape() {
  assert.deepStrictEqual(
    Object.keys(GERMANY_CURATED_PUBLISHERS).sort(),
    EXPECTED_TOPICS.slice().sort(),
    'Curated Germany catalog topic set changed'
  );

  for (const topic of EXPECTED_TOPICS) {
    const candidates = GERMANY_CURATED_PUBLISHERS[topic];
    assert.strictEqual(candidates.length, 10, `${topic} must have exactly 10 candidates`);
    assert.strictEqual(new Set(candidates.map((candidate) => candidate.url)).size, 10, `${topic} URLs must be unique`);

    for (const candidate of candidates) {
      assert(candidate.name, `${topic} candidate is missing a name`);
      assert(/^https?:\/\//.test(candidate.url), `${topic} candidate ${candidate.name} must use an absolute URL`);
    }
  }
}

function assertCookingProvenCandidates() {
  const cooking = GERMANY_CURATED_PUBLISHERS.cooking;
  const proven = cooking.filter((candidate) => candidate.generationProven);
  assert(
    proven.length >= 5,
    `cooking should keep at least 5 generation-proven candidates, found ${proven.length}`
  );
}

function assertGeminiOptInGuard() {
  assert.notStrictEqual(
    process.env.SUGGESTION_DISCOVERY,
    'gemini',
    'Default curated check should run without Gemini discovery enabled'
  );
}

async function postJson(baseUrl, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    payload: await response.json(),
  };
}

async function assertUnsupportedRouteBehavior() {
  const app = express();
  app.use(express.json());
  app.use('/api/suggest-websites', suggestRoutes);

  const server = app.listen(0);
  const port = await new Promise((resolve) => server.once('listening', () => resolve(server.address().port)));
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const countryResult = await postJson(baseUrl, '/api/suggest-websites', {
      topic: 'sports',
      country: 'France',
      adSize: '300x250',
      device: 'desktop',
    });
    assert.strictEqual(countryResult.status, 422, 'Unsupported country should return 422');
    assert.strictEqual(countryResult.payload.metadata?.source, CURATED_SOURCE, 'Unsupported country should report curated source');

    const topicResult = await postJson(baseUrl, '/api/suggest-websites', {
      topic: 'gardening',
      country: 'Germany',
      adSize: '300x250',
      device: 'desktop',
    });
    assert.strictEqual(topicResult.status, 422, 'Unsupported topic should return 422');
    assert.strictEqual(topicResult.payload.metadata?.source, CURATED_SOURCE, 'Unsupported topic should report curated source');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  assertGeminiOptInGuard();
  assertCatalogShape();
  assertCookingProvenCandidates();
  assert.strictEqual(getGermanyCuratedPublishers('wirtschaft').topic, 'finance', 'Topic aliases should resolve');
  assert.strictEqual(getGermanyCuratedPublishers('recipes').topic, 'cooking', 'Topic aliases should resolve');
  await assertUnsupportedRouteBehavior();
  console.log('Curated Germany checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
