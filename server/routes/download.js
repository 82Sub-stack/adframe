const express = require('express');
const router = express.Router();
const fs = require('fs');

// Reference to mockup store (set by server.js)
let mockupStore = null;

router.setMockupStore = (store) => {
  mockupStore = store;
};

// Download mockup image: /api/download-mockup/:id
router.get('/download-mockup/:id', (req, res) => {
  const { id } = req.params;

  if (!mockupStore || !mockupStore.has(id)) {
    return res.status(404).json({ error: 'Mockup not found' });
  }

  const entry = mockupStore.get(id);
  if (!entry.path || !fs.existsSync(entry.path)) {
    return res.status(404).json({ error: 'Mockup file not found' });
  }

  const filename = `adframe-mockup-${entry.metadata.adSize}-${Date.now()}.png`;
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.sendFile(entry.path);
});

// Serve mockup image (inline, for preview): /api/download-mockup/:id/preview
router.get('/download-mockup/:id/preview', (req, res) => {
  const { id } = req.params;

  if (!mockupStore || !mockupStore.has(id)) {
    return res.status(404).json({ error: 'Mockup not found' });
  }

  const entry = mockupStore.get(id);
  if (!entry.path || !fs.existsSync(entry.path)) {
    return res.status(404).json({ error: 'Mockup file not found' });
  }

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(entry.path);
});

// Download ad tag as HTML file: /api/download-adtag/:id
router.get('/download-adtag/:id', (req, res) => {
  const { id } = req.params;
  const adTagKey = `adtag-${id}`;

  if (!mockupStore || !mockupStore.has(adTagKey)) {
    return res.status(404).json({ error: 'Ad tag not found' });
  }

  const entry = mockupStore.get(adTagKey);
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ad Tag Preview</title>
  <style>
    body { margin: 0; padding: 20px; font-family: Arial, sans-serif; background: #f5f5f5; }
    .ad-container { display: inline-block; border: 1px solid #ddd; background: white; }
  </style>
</head>
<body>
  <div class="ad-container">
    ${entry.adTag}
  </div>
</body>
</html>`;

  const filename = `adframe-adtag-${Date.now()}.html`;
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(html);
});

module.exports = router;
