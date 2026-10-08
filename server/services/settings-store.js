const fs = require('fs');
const path = require('path');

let runtimeConfig = {
  dataDir: process.env.ADFRAME_DATA_DIR || path.join(__dirname, '..', 'data'),
  defaultOutputDir: process.env.ADFRAME_OUTPUT_DIR || path.join(__dirname, '..', 'output'),
  appVersion: require('../../package.json').version,
};

function configureSettingsStore(config = {}) {
  runtimeConfig = { ...runtimeConfig, ...Object.fromEntries(Object.entries(config).filter(([, value]) => value != null)) };
  fs.mkdirSync(getUploadDir(), { recursive: true });
  fs.mkdirSync(getEffectiveOutputDir(), { recursive: true });
}

function getEffectiveOutputDir() { return runtimeConfig.defaultOutputDir; }
function getUploadDir() {
  const dir = path.join(runtimeConfig.dataDir, 'tmp', 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function getGeminiApiKey() { return process.env.GEMINI_API_KEY || ''; }
function getPublicSettings() {
  return {
    appVersion: runtimeConfig.appVersion,
    geminiApiKeyConfigured: Boolean(getGeminiApiKey()),
    suggestionSource: process.env.SUGGESTION_DISCOVERY === 'gemini' ? 'discovery' : 'curated',
    downloads: 'browser',
  };
}

module.exports = { configureSettingsStore, getEffectiveOutputDir, getUploadDir, getGeminiApiKey, getPublicSettings };
