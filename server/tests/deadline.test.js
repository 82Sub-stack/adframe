const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runWithDeadline } = require('../services/job-deadline');
const { ConcurrencyQueue } = require('../utils/queue');
const { getBrowser, closeBrowser, captureWebsite } = require('../services/puppeteer');
const { fixtureServer, creative, postMockup } = require('./helpers/fixtures');
const fs=require('fs');const path=require('path');const os=require('os');

test('deadline cancels queued work before it starts and releases listeners',async()=>{
  const queue=new ConcurrencyQueue(1);let finish;let ran=false;
  const first=queue.run(()=>new Promise(resolve=>{finish=resolve;}));
  await assert.rejects(runWithDeadline(signal=>queue.run(()=>{ran=true;},{signal}),30),error=>error.code==='MOCKUP_TIMEOUT');
  assert.equal(queue.pendingCount,0);finish();await first;assert.equal(ran,false);assert.equal(queue.runningCount,0);
});

test('capture cancellation closes its isolated browser context without disrupting other pages',async()=>{
  const fixture=await fixtureServer();const browser=await getBrowser();const other=await browser.newPage();
  const contextCount=browser.browserContexts().length;
  try {
    await assert.rejects(runWithDeadline(signal=>captureWebsite(fixture.url+'/hang','desktop',300,250,()=>{},{adImageBuffer:Buffer.from('unused'),signal}),400),error=>error.code==='MOCKUP_TIMEOUT');
    await new Promise(resolve=>setTimeout(resolve,500));
    assert.equal(browser.browserContexts().length,contextCount);assert.equal(other.isClosed(),false);
  } finally {await other.close();await fixture.close();await closeBrowser();}
});

test('web route deadline returns 504, frees the queue and saves no output',async()=>{
  process.env.MOCKUP_JOB_TIMEOUT_MS='400';
  const { createApp }=require('../app');const queue=require('../utils/queue');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'adframe-timeout-test-'));const outputDir=path.join(directory,'output');
  const fixture=await fixtureServer();await getBrowser();
  const server=createApp({dataDir:path.join(directory,'data'),outputDir}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try {
    const started=Date.now();const result=await postMockup(`http://127.0.0.1:${server.address().port}`,fixture.url+'/hang',await creative());
    assert.equal(result.status,504,JSON.stringify(result.body));assert.equal(result.body.failureCode,'mockup_timeout');assert.ok(Date.now()-started<3000);
    await new Promise(resolve=>setTimeout(resolve,500));assert.equal(queue.runningCount,0);assert.equal(queue.pendingCount,0);assert.deepEqual(fs.readdirSync(outputDir),[]);
  } finally {await closeBrowser();await fixture.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}
});
