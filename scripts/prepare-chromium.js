const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const serverDir = path.join(rootDir, 'server');
const cacheDir = path.join(serverDir, '.local-chromium');
const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const result = spawnSync(
  npxBin,
  ['puppeteer', 'browsers', 'install', 'chrome'],
  {
    cwd: serverDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      PUPPETEER_CACHE_DIR: cacheDir,
    },
  }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
