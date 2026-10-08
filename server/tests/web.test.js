const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../app');
const { closeBrowser } = require('../services/puppeteer');
const { creative, fixtureServer, postMockup } = require('./helpers/fixtures');
let fixture, server, baseUrl, outputDir, dataDir, directory;
before(async () => {
  fixture=await fixtureServer();directory=fs.mkdtempSync(path.join(os.tmpdir(),'adframe-web-test-'));
  outputDir=path.join(directory,'output');dataDir=path.join(directory,'data');
  server=createApp({dataDir,outputDir}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));baseUrl=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await closeBrowser();await fixture.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});});

test('web settings are read-only and do not expose server directories or secrets',async()=>{
  const health=await fetch(baseUrl+'/api/health');assert.equal(health.status,200);
  const settings=await (await fetch(baseUrl+'/api/settings')).json();
  assert.equal(settings.settings.downloads,'browser');
  for(const key of ['dataDir','outputDir','configuredOutputDir','geminiApiKey','isDesktop'])assert.equal(key in settings.settings,false);
  assert.equal((await fetch(baseUrl+'/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({outputDir:'/wrong',geminiApiKey:'wrong'})})).status,405);
});

test('uploaded creative passes complete capture, download and selected-slot retry',async()=>{
  const result=await postMockup(baseUrl,fixture.url+'/',await creative());
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.equal(result.body.metadata.quality.status,'passed');
  assert.equal(result.body.metadata.quality.creativeVerification.passed,true);
  const download=await fetch(baseUrl+result.body.mockupImageUrl);assert.equal(download.status,200);assert.equal(download.headers.get('content-type'),'image/png');
  const retry=await fetch(baseUrl+`/api/generate-mockup/${result.body.mockupId}/inject`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slotId:result.body.metadata.placement.slotId}),signal:AbortSignal.timeout(15000)});
  const retried=await retry.json();assert.equal(retry.status,200,JSON.stringify(retried));assert.equal(retried.metadata.placement.slotId,result.body.metadata.placement.slotId);
});

test('HTML image tags pass the complete web route',async()=>{
  const png=await creative();
  const result=await postMockup(baseUrl,fixture.url+'/',null,{adTag:`<img width="300" height="250" src="data:image/png;base64,${png.toString('base64')}">`});
  assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.metadata.quality.status,'passed');assert.equal(result.body.metadata.placement.adTagRendered,true);
});

for(const [name,pathname,code] of [['empty publisher','/blank','capture_content_missing'],['undersized slot','/?height=203','no_reliable_slot'],['covered slot','/covered','no_reliable_slot']]) {
  test(`${name} returns an actionable error without saving a mockup`,async()=>{
    const before=fs.readdirSync(outputDir).filter(name=>name.endsWith('.png')||name.endsWith('.json')).length;
    const result=await postMockup(baseUrl,fixture.url+pathname,await creative());
    assert.equal(result.status,422,JSON.stringify(result.body));assert.equal(result.body.failureCode,code);assert.equal(result.body.mockupId,undefined);assert.equal(fs.readdirSync(outputDir).filter(name=>name.endsWith('.png')||name.endsWith('.json')).length,before);
    assert.equal(fs.readdirSync(path.join(dataDir,'tmp','uploads')).length,0);
    assert.ok(result.body.diagnostic,JSON.stringify(result.body));
    const report=await fetch(baseUrl+result.body.diagnostic.reportUrl);assert.equal(report.status,200);
    const diagnostic=await report.json();assert.equal(diagnostic.kind,'failed-capture-diagnostic');assert.equal(diagnostic.failureCode,code);
    assert.ok(diagnostic.diagnostics.pageState);
    if(pathname.includes('height')) assert.ok(diagnostic.diagnostics.slotDetection.rejectedCandidates.some(candidate=>candidate.reasons.includes('dimension-reject')));
    if(pathname==='/covered') assert.ok(diagnostic.diagnostics.domInjection.rejectedCandidates.some(candidate=>candidate.reasons.includes('slot-occluded')));
    const preview=await fetch(baseUrl+result.body.diagnostic.previewUrl);assert.equal(preview.status,200);assert.equal(preview.headers.get('content-type'),'image/png');
    assert.equal((await fetch(baseUrl+result.body.diagnostic.reportUrl.replace('/report','/other'))).status,404);
  });
}

test('failure diagnostics are bounded, expire and never become mockup downloads', async () => {
  const { storeFailureDiagnostic, getFailureDiagnostic } = require('../services/capture-diagnostics');
  const diagnostics={pageState:{usable:true},slotDetection:{rejectionSummary:{}},device:'desktop',adSize:'300x250'};
  let first;
  for(let index=0;index<21;index++) {
    const error=new Error('No placement');error.code='no_reliable_slot';error.captureDiagnostics=diagnostics;error.diagnosticScreenshot=await creative();
    const artifact=storeFailureDiagnostic(error);first ||= artifact;
  }
  assert.equal(fs.readdirSync(path.join(outputDir,'diagnostics')).filter(name=>name.endsWith('.json')).length,20);
  assert.equal(getFailureDiagnostic(first.id,'report'),null);
  assert.equal((await fetch(baseUrl+`/api/download-mockup/${first.id}`)).status,404);
  const originalNow=Date.now;
  try {
    Date.now=()=>originalNow()+24*60*60*1000+1000;
    assert.equal(getFailureDiagnostic(first.id,'report'),null);
    const remaining=fs.readdirSync(path.join(outputDir,'diagnostics')).find(name=>name.endsWith('.json')).slice(0,-5);
    assert.equal(getFailureDiagnostic(remaining,'report'),null);
    assert.equal(fs.readdirSync(path.join(outputDir,'diagnostics')).length,0);
  } finally {Date.now=originalNow;}
});
