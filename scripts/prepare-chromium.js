const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const serverDir = path.join(rootDir, 'server');
const cacheDir = path.join(serverDir, '.local-chromium');
const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = process.argv.slice(2);
const platformIndex = args.indexOf('--platform');
const platform = platformIndex >= 0 ? args[platformIndex + 1] : null;
const installArgs = ['puppeteer', 'browsers', 'install', 'chrome'];

if (platform) {
  installArgs.push('--platform', platform);
}

fs.rmSync(cacheDir, { recursive: true, force: true });

const result = spawnSync(npxBin, installArgs, {
  cwd: serverDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    PUPPETEER_CACHE_DIR: cacheDir,
  },
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
