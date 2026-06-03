const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const explicitAppPath = process.env.ADFRAME_MAC_APP_PATH;

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  const output = [result.stdout, result.stderr].filter(Boolean).join('').trim();
  if (output) {
    console.log(output);
  }

  return result.status === 0;
}

function findBuiltApp() {
  if (explicitAppPath) {
    return path.resolve(explicitAppPath);
  }

  const candidates = [
    path.join(projectRoot, 'release', 'mac-arm64', 'AdFrame.app'),
    path.join(projectRoot, 'release', 'mac', 'AdFrame.app'),
    path.join(projectRoot, 'release', 'mac-universal', 'AdFrame.app'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function main() {
  if (process.platform !== 'darwin') {
    console.error('macOS signing verification must run on macOS.');
    process.exit(1);
  }

  const appPath = findBuiltApp();
  if (!appPath) {
    console.error('No built AdFrame.app was found. Set ADFRAME_MAC_APP_PATH or build the macOS app first.');
    process.exit(1);
  }

  console.log(`Verifying ${appPath}`);

  const checks = [
    ['codesign strict verification', 'codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]],
    ['codesign signature details', 'codesign', ['-dv', '--verbose=4', appPath]],
    ['Gatekeeper assessment', 'spctl', ['--assess', '--type', 'execute', '--verbose=4', appPath]],
    ['notarization staple validation', 'xcrun', ['stapler', 'validate', appPath]],
  ];

  for (const [label, command, args] of checks) {
    console.log(`\n${label}`);
    if (!run(command, args)) {
      console.error(`\nFailed: ${label}`);
      process.exit(1);
    }
  }

  console.log('\nmacOS signing and notarization checks passed.');
}

main();
