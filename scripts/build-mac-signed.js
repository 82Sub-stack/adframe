const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { build, Platform } = require('electron-builder');

const projectRoot = path.resolve(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const contents = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

function requireMacHost() {
  if (process.platform !== 'darwin') {
    fail('Signed macOS builds must run on macOS with Xcode command line tools installed.');
  }
}

function requireNotarytool() {
  const result = run('xcrun', ['notarytool', '--version']);
  if (result.status !== 0) {
    fail('xcrun notarytool is required. Install Xcode or Xcode command line tools, then retry.');
  }
}

function hasDeveloperIdIdentity() {
  const result = run('security', ['find-identity', '-v', '-p', 'codesigning']);
  return result.status === 0 && /Developer ID Application:/.test(result.stdout);
}

function requireSigningMaterial() {
  if (process.env.CSC_LINK) {
    if (!process.env.CSC_KEY_PASSWORD) {
      fail('CSC_LINK is set, but CSC_KEY_PASSWORD is missing.');
    }
    return;
  }

  if (hasDeveloperIdIdentity()) {
    return;
  }

  fail([
    'No Developer ID Application signing material was found.',
    'Install the certificate in Keychain or set CSC_LINK and CSC_KEY_PASSWORD in .env.signing.',
  ].join('\n'));
}

function requireNotarizationCredentials() {
  const hasApiKey = process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER;
  const hasAppleId = process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID;
  const hasKeychainProfile = process.env.APPLE_KEYCHAIN_PROFILE;

  if (hasApiKey || hasAppleId || hasKeychainProfile) {
    return;
  }

  fail([
    'No notarization credentials were found.',
    'Set APPLE_API_KEY, APPLE_API_KEY_ID, and APPLE_API_ISSUER in .env.signing,',
    'or use APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID,',
    'or configure APPLE_KEYCHAIN_PROFILE with xcrun notarytool store-credentials.',
  ].join('\n'));
}

function createSignedBuildConfig() {
  const packageJson = require(path.join(projectRoot, 'package.json'));
  const baseBuildConfig = packageJson.build || {};
  const macConfig = {
    ...(baseBuildConfig.mac || {}),
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.inherit.plist',
    notarize: true,
  };

  delete macConfig.identity;
  if (process.env.CSC_NAME) {
    macConfig.identity = process.env.CSC_NAME;
  }

  return {
    ...baseBuildConfig,
    forceCodeSigning: true,
    mac: macConfig,
  };
}

async function main() {
  loadEnvFile(path.join(projectRoot, '.env.signing'));
  requireMacHost();
  requireNotarytool();
  requireSigningMaterial();
  requireNotarizationCredentials();

  await build({
    targets: Platform.MAC.createTarget(),
    config: createSignedBuildConfig(),
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
