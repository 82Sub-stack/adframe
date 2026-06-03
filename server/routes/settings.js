const express = require('express');
const {
  getPublicSettings,
  updateSettings,
} = require('../services/settings-store');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ settings: getPublicSettings() });
});

router.put('/', (req, res) => {
  try {
    const settings = updateSettings(req.body || {});
    res.json({ settings });
  } catch (err) {
    console.error('Settings update error:', err);
    res.status(500).json({
      error: 'Failed to update settings.',
      details: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
});

module.exports = router;
