require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const suggestRoutes = require('./routes/suggest');
const mockupRoutes = require('./routes/mockup');
const downloadRoutes = require('./routes/download');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // Allow inline scripts for ad tag rendering
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? true // Allow same-origin in production (served from same domain)
    : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  message: { error: 'Too many requests, please try again in a minute.' },
});

const mockupLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: { error: 'Too many mockup requests. Please wait a moment.' },
});

// API routes
app.use('/api/suggest-websites', apiLimiter, suggestRoutes);
app.use('/api/generate-mockup', mockupLimiter, mockupRoutes);

// Wire up mockup store to download routes
downloadRoutes.setMockupStore(mockupRoutes.mockupStore);
app.use('/api', downloadRoutes);

// Serve static frontend in production
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDistPath));

// SPA fallback — serve index.html for non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV !== 'production' ? err.message : undefined,
  });
});

app.listen(PORT, () => {
  console.log(`AdFrame server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down...');
  const { closeBrowser } = require('./services/puppeteer');
  await closeBrowser();
  process.exit(0);
});
