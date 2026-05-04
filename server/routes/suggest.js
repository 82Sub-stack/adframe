const express = require('express');
const router = express.Router();
const { suggestWebsites } = require('../services/gemini');
const { preflightSuggestions } = require('../services/preflight');

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 12;
  return Math.min(parsed, 20);
}

router.post('/', async (req, res) => {
  try {
    const { topic, country, adSize, device, limit } = req.body;

    if (!topic || !country) {
      return res.status(400).json({ error: 'Topic and country are required' });
    }

    const suggestionLimit = parseLimit(limit);
    const rawSuggestions = await suggestWebsites(topic, country, {
      limit: Math.max(suggestionLimit, 12),
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
      metadata: {
        preflighted: true,
        count: suggestions.length,
      },
    });
  } catch (err) {
    console.error('Website suggestion error:', err);
    res.status(500).json({ error: 'Failed to suggest websites. Please try again.' });
  }
});

module.exports = router;
