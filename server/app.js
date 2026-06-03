require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const suggestRoutes = require('./routes/suggest');
const mockupRoutes = require('./routes/mockup');
const downloadRoutes = require('./routes/download');
const settingsRoutes = require('./routes/settings');
const { configureSettingsStore } = require('./services/settings-store');

function createApp(options = {}) {
  const app = express();
  const isDesktop = Boolean(options.isDesktop || process.env.ADFRAME_DESKTOP === 'true');
  const dataDir = options.dataDir || process.env.ADFRAME_DATA_DIR || path.join(__dirname, 'data');
  const defaultOutputDir = options.outputDir ||
    process.env.ADFRAME_OUTPUT_DIR ||
    (isDesktop ? path.join(dataDir, 'mockups') : path.join(__dirname, 'output'));
  const clientDistPath = options.staticDir || path.join(__dirname, '..', 'client', 'dist');

  configureSettingsStore({
    dataDir,
    defaultOutputDir,
    isDesktop,
    chromiumMode: process.env.ADFRAME_CHROMIUM_MODE || (isDesktop ? 'bundled' : 'system'),
    appVersion: process.env.ADFRAME_APP_VERSION,
  });

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  }));

  app.use(cors({
    origin: process.env.NODE_ENV === 'production' || isDesktop
      ? true
      : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  }));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: isDesktop ? 120 : 30,
    message: { error: 'Too many requests, please try again in a minute.' },
  });

  const mockupLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: isDesktop ? 30 : 10,
    message: { error: 'Too many mockup requests. Please wait a moment.' },
  });

  app.use('/api/settings', apiLimiter, settingsRoutes);
  app.use('/api/suggest-websites', apiLimiter, suggestRoutes);
  app.use('/api/generate-mockup', mockupLimiter, mockupRoutes);

  downloadRoutes.setMockupStore(mockupRoutes.mockupStore);
  app.use('/api', downloadRoutes);

  app.use(express.static(clientDistPath));

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });

  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  });

  return app;
}

module.exports = {
  createApp,
};
