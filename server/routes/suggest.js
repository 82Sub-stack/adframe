const express = require('express');
const router = express.Router();
const { suggestWebsites } = require('../services/gemini');

router.post('/', async (req, res) => {
  try {
    const { topic, country } = req.body;

    if (!topic || !country) {
      return res.status(400).json({ error: 'Topic and country are required' });
    }

    const suggestions = await suggestWebsites(topic, country);
    res.json({ suggestions });
  } catch (err) {
    console.error('Website suggestion error:', err);
    res.status(500).json({ error: 'Failed to suggest websites. Please try again.' });
  }
});

module.exports = router;
