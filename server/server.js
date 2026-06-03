const { createApp } = require('./app');

const PORT = process.env.PORT || 3001;
const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`AdFrame server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

async function shutdown() {
  console.log('Shutting down...');
  const { closeBrowser } = require('./services/puppeteer');
  await closeBrowser();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
