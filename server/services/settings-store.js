const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_DATA_DIR = path.join(os.homedir(), '.adframe');

let runtimeConfig = {
  dataDir: process.env.ADFRAME_DATA_DIR || DEFAULT_DATA_DIR,
  defaultOutputDir: process.env.ADFRAME_OUTPUT_DIR || path.join(process.env.ADFRAME_DATA_DIR || DEFAULT_DATA_DIR, 'mockups'),
  isDesktop: process.env.ADFRAME_DESKTOP === 'true',
  chromiumMode: process.env.ADFRAME_CHROMIUM_MODE || (process.env.ADFRAME_DESKTOP === 'true' ? 'bundled' : 'system'),
  appVersion: process.env.ADFRAME_APP_VERSION || '1.0.0',
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function configureSettingsStore(config = {}) {
  runtimeConfig = {
    ...runtimeConfig,
    ...Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined && value !== null)),
  };

  ensureDir(runtimeConfig.dataDir);
  ensureDir(path.join(runtimeConfig.dataDir, 'tmp', 'uploads'));
  ensureDir(getDefaultOutputDir());
}

function getSettingsPath() {
  return path.join(runtimeConfig.dataDir, 'settings.json');
}

function readSettingsFile() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSettingsFile(settings) {
  ensureDir(runtimeConfig.dataDir);
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), {
    mode: 0o600,
  });
  try {
    fs.chmodSync(getSettingsPath(), 0o600);
  } catch {
    // Windows may ignore POSIX permissions.
  }
}

function getDefaultOutputDir() {
  return runtimeConfig.defaultOutputDir || path.join(runtimeConfig.dataDir, 'mockups');
}

function normalizeDirectory(value) {
  if (!value || typeof value !== 'string') return null;
  return path.resolve(value);
}

function canUseDirectory(dirPath) {
  try {
    ensureDir(dirPath);
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function getEffectiveOutputDir() {
  const settings = readSettingsFile();
  const configuredDir = normalizeDirectory(settings.outputDir);

  if (configuredDir && canUseDirectory(configuredDir)) {
    return configuredDir;
  }

  const defaultDir = getDefaultOutputDir();
  ensureDir(defaultDir);
  return defaultDir;
}

function getUploadDir() {
  const uploadDir = path.join(runtimeConfig.dataDir, 'tmp', 'uploads');
  ensureDir(uploadDir);
  return uploadDir;
}

function getGeminiApiKey() {
  const settings = readSettingsFile();
  return settings.geminiApiKey || process.env.GEMINI_API_KEY || '';
}

function getPublicSettings() {
  const settings = readSettingsFile();
  const configuredDir = normalizeDirectory(settings.outputDir);
  const effectiveOutputDir = getEffectiveOutputDir();
  const warnings = [];

  if (configuredDir && configuredDir !== effectiveOutputDir) {
    warnings.push('Configured output folder is not writable. Using the default output folder.');
  }

  return {
    geminiApiKeyConfigured: Boolean(getGeminiApiKey()),
    outputDir: effectiveOutputDir,
    configuredOutputDir: configuredDir,
    defaultOutputDir: getDefaultOutputDir(),
    dataDir: runtimeConfig.dataDir,
    isDesktop: Boolean(runtimeConfig.isDesktop),
    chromiumMode: runtimeConfig.chromiumMode,
    appVersion: runtimeConfig.appVersion,
    platform: process.platform,
    warnings,
  };
}

function updateSettings(nextSettings = {}) {
  const current = readSettingsFile();
  const updated = { ...current };
  const warnings = [];

  if (Object.prototype.hasOwnProperty.call(nextSettings, 'geminiApiKey')) {
    const geminiApiKey = String(nextSettings.geminiApiKey || '').trim();
    if (geminiApiKey) {
      updated.geminiApiKey = geminiApiKey;
    } else {
      delete updated.geminiApiKey;
    }
  }

  if (Object.prototype.hasOwnProperty.call(nextSettings, 'outputDir')) {
    const outputDir = normalizeDirectory(nextSettings.outputDir);
    if (outputDir && canUseDirectory(outputDir)) {
      updated.outputDir = outputDir;
    } else if (outputDir) {
      warnings.push('Selected output folder is not writable. Keeping the previous output folder.');
    } else {
      delete updated.outputDir;
    }
  }

  writeSettingsFile(updated);

  return {
    ...getPublicSettings(),
    warnings: [...getPublicSettings().warnings, ...warnings],
  };
}

module.exports = {
  configureSettingsStore,
  getEffectiveOutputDir,
  getGeminiApiKey,
  getPublicSettings,
  getUploadDir,
  updateSettings,
};
