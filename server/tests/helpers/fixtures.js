const http = require('http');
const sharp = require('sharp');

async function creative(width = 300, height = 250) {
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#163d5a"/><rect x="10" y="10" width="${width - 20}" height="${height - 20}" fill="#f2c14e"/><circle cx="${width / 2}" cy="${height / 2}" r="25" fill="#d3293a"/></svg>`)).png().toBuffer();
}

function publisher(width = 300, height = 250, extra = '') {
  return `<style>body{margin:0;font-family:Arial}main{padding:20px;max-width:700px}.ad-container{position:absolute;left:30px;top:300px;width:${width}px;height:${height}px;background:white}</style>
    <main><h1>Publisher news</h1><article>${'A meaningful publisher article with visible text and a realistic page layout. '.repeat(8)}</article></main>
    <div id="ad-container-test" class="ad-container"><span>Anzeige</span></div>${extra}`;
}

async function fixtureServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/hang') return;
    res.setHeader('Content-Type', 'text/html');
    if (url.pathname === '/blank') return res.end('<body></body>');
    if (url.pathname === '/remote-ad-frame') {
      return res.end(publisher().replace('<div id="ad-container-test" class="ad-container"><span>Anzeige</span></div>',
        '<iframe id="google_ads_iframe_test" class="ad-container" style="border:0" width="300" height="250" src="https://googleads.g.doubleclick.net/pagead/adframe-test"></iframe>'));
    }
    const extra = url.pathname === '/covered' ? '<div style="position:fixed;inset:0;z-index:10000;background:blue">Other content</div>' : '';
    res.end(publisher(Number(url.searchParams.get('width')) || 300, Number(url.searchParams.get('height')) || 250, extra));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}

async function postMockup(baseUrl, websiteUrl, buffer, options = {}) {
  const form = new FormData();
  form.append('websiteUrl', websiteUrl);
  form.append('adSize', options.adSize || '300x250');
  form.append('device', options.device || 'desktop');
  form.append('allowHeuristicFallback', 'false');
  if (options.adTag) form.append('adTag', options.adTag);
  else form.append('adImage', new Blob([buffer], { type: 'image/png' }), 'creative.png');
  const response = await fetch(`${baseUrl}/api/generate-mockup`, { method: 'POST', body: form, signal: AbortSignal.timeout(15000) });
  return { status: response.status, body: await response.json() };
}

module.exports = { creative, publisher, fixtureServer, postMockup };
