#!/usr/bin/env node
process.env.NODE_ENV = 'production';
process.env.MOCKUP_CONCURRENCY = '1';
const fs = require('fs');
const path = require('path');
const { createApp } = require('../server/app');
const { closeBrowser } = require('../server/services/puppeteer');
const { creative } = require('../server/tests/helpers/fixtures');

async function main() {
  const directory = path.resolve('server/output/web-smoke', new Date().toISOString().replace(/[:.]/g, '-'));
  const device = process.env.SMOKE_DEVICE || 'desktop';
  const adSize = process.env.SMOKE_AD_SIZE || '300x250';
  const urls = process.env.SMOKE_URLS?.split(',') || ['https://www.sport1.de/', 'https://www.gala.de/', 'https://www.focus.de/', 'https://www.finanznachrichten.de/'];
  const server = createApp({ dataDir: path.join(directory,'data'), outputDir: path.join(directory,'generated') }).listen(0,'127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  const buffer = await creative(...adSize.split('x').map(Number));
  const results = [];
  try {
    for (const url of urls) {
      const form = new FormData();
      form.append('websiteUrl',url);form.append('device',device);form.append('adSize',adSize);form.append('allowHeuristicFallback','false');
      form.append('adImage',new Blob([buffer],{type:'image/png'}),'smoke.png');
      const started=Date.now();
      try {
        const response=await fetch(`http://127.0.0.1:${server.address().port}/api/generate-mockup`,{method:'POST',body:form,signal:AbortSignal.timeout(90000)});
        const body=await response.json();
        results.push({url,status:response.status,durationMs:Date.now()-started,...body});
      } catch(error) { results.push({url,status:0,durationMs:Date.now()-started,error:error.message}); }
      fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify({device,adSize,configuration:'production',results},null,2));
      console.log(JSON.stringify({url,status:results.at(-1).status,durationMs:results.at(-1).durationMs,quality:results.at(-1).metadata?.quality,error:results.at(-1).error}));
    }
  } finally { await closeBrowser(); server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
  console.log(`Report: ${path.join(directory,'report.json')}`);
  if (results.some(result=>result.metadata?.quality?.status!=='passed')) process.exitCode=1;
}
main().catch(async error=>{console.error(error);await closeBrowser();process.exitCode=1;});
