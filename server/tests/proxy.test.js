const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../app');

test('Render rate limits each forwarded client and ignores an extra spoofed hop', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'adframe-proxy-test-'));
  const previous = process.env.RENDER;
  process.env.RENDER = 'true';
  const app = createApp({ dataDir: directory, outputDir: path.join(directory, 'output') });
  if (previous == null) delete process.env.RENDER;
  else process.env.RENDER = previous;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/settings`;
  try {
    for (let i = 0; i < 30; i++) {
      assert.equal((await fetch(url, { headers: { 'X-Forwarded-For': '198.51.100.1' } })).status, 200);
    }
    assert.equal((await fetch(url, { headers: { 'X-Forwarded-For': '198.51.100.1' } })).status, 429);
    assert.equal((await fetch(url, { headers: { 'X-Forwarded-For': '203.0.113.9, 198.51.100.1' } })).status, 429);
    assert.equal((await fetch(url, { headers: { 'X-Forwarded-For': '198.51.100.2' } })).status, 200);
    assert.equal(app.get('trust proxy'), 1);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
