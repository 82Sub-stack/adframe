const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { getBrowser, closeBrowser, detectAdSlots, injectCreativeIntoDetectedSlot, renderAdTag } = require('../services/puppeteer');
const { removeConsentOverlays } = require('../services/consent-handler');
const { verifyFinalCreative } = require('../services/image-verification');
const { creative, publisher } = require('./helpers/fixtures');
let browser;
before(async () => { browser = await getBrowser(); });
after(async () => { await closeBrowser(); });

async function withPage(html, fn, mobile = false) {
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setViewport(mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1366, height: 900 });
    await page.setContent(html);
    return await fn(page);
  } finally { await context.close(); }
}

test('consent cleanup preserves publisher roots and removes actual CMP dialogs', async () => {
  await withPage(`<div id="app" style="height:1200px"><main><h1>Content</h1><article>Real article</article></main><a>Weiter mit Werbung</a></div><div id="onetrust-banner-sdk" style="position:fixed;inset:0">Consent dialog</div>`, async page => {
    assert.equal(await removeConsentOverlays(page), 1);
    assert.ok(await page.$('#app main article'));
    assert.equal(await page.$('#onetrust-banner-sdk'), null);
  });
});

test('repeated and cross-page scans have unique, stable native slot IDs', async () => {
  let originalId;
  await withPage(publisher(), async page => {
    originalId = (await detectAdSlots(page, 300, 250, 'desktop', { returnCandidates: true })).bestSlot.slotId;
    await page.evaluate(() => { const node = document.createElement('div'); node.id = 'ad-container-second'; node.className = 'ad-container'; node.style.top = '650px'; document.body.append(node); });
    await detectAdSlots(page, 300, 250, 'desktop', { returnCandidates: true });
    const ids = await page.$$eval('[data-adframe-slot-id]', nodes => nodes.map(node => node.getAttribute('data-adframe-slot-id')));
    assert.equal(new Set(ids).size, ids.length);
  });
  await withPage(publisher(), async page => assert.equal((await detectAdSlots(page, 300, 250, 'desktop', { returnCandidates: true })).bestSlot.slotId, originalId));
});

for (const [width, height, device] of [[300,250,'desktop'],[300,600,'desktop'],[728,90,'desktop'],[160,600,'desktop'],[970,250,'desktop'],[300,250,'mobile'],[300,600,'mobile']]) {
  test(`${width}x${height} ${device} keeps creative dimensions and matches final pixels`, async () => {
    const buffer = await creative(width,height);
    await withPage(publisher(width + 8, height + 8), async page => {
      const detected = await detectAdSlots(page,width,height,device,{returnCandidates:true});
      const result = await injectCreativeIntoDetectedSlot(page,detected.bestSlot,{adImageBuffer:buffer,adWidth:width,adHeight:height,slotCandidates:detected.candidates});
      assert.equal(result.succeeded,true,JSON.stringify(result));
      assert.equal(result.width,width);assert.equal(result.height,height);
      const screenshot = Buffer.from(await page.screenshot({fullPage:true}));
      assert.equal((await verifyFinalCreative(screenshot,buffer,result,width,height)).passed,true);
    }, device === 'mobile');
  });
}

test('undersized slots and misleading editorial names are rejected', async () => {
  await withPage(publisher(300,203)+'<div id="header-shadow" style="width:300px;height:250px">Editorial</div>', async page => {
    const detected=await detectAdSlots(page,300,250,'desktop',{returnCandidates:true});
    assert.equal(detected.bestSlot,null);
    assert.equal(detected.candidates.length,0);
  });
});

test('iframe replacement preserves its styled position', async () => {
  await withPage('<style>body{margin:0}iframe{position:absolute;left:500px;top:150px;width:300px;height:250px;border:0}</style><iframe id="google_ads_iframe_test"></iframe>', async page => {
    const detected=await detectAdSlots(page,300,250,'desktop',{returnCandidates:true});
    const result=await injectCreativeIntoDetectedSlot(page,detected.bestSlot,{adImageBuffer:await creative(),slotCandidates:detected.candidates});
    assert.equal(result.succeeded,true,JSON.stringify(result));assert.equal(result.x,500);assert.equal(result.y,150);
  });
});

test('covered iframes are rejected without modifying the DOM', async () => {
  await withPage('<style>body{margin:0}iframe{position:absolute;left:500px;top:150px;width:300px;height:250px;border:0}.cover{position:fixed;inset:0;background:blue;z-index:10000}</style><iframe id="google_ads_iframe_test"></iframe><div class="cover"></div>', async page => {
    const detected=await detectAdSlots(page,300,250,'desktop',{returnCandidates:true});
    const result=await injectCreativeIntoDetectedSlot(page,detected.bestSlot,{adImageBuffer:await creative(),slotCandidates:detected.candidates});
    assert.equal(result.succeeded,false);assert.ok(await page.$('iframe'));assert.equal(await page.$('[data-adframe-injected]'),null);
  });
});

test('failed pixel validation restores original children and inline styles', async () => {
  await withPage(publisher()+'<style>.ad-container img{opacity:0!important}</style>', async page => {
    const before=await page.$eval('#ad-container-test',node=>({ children:node.innerHTML, inlineStyle:node.style.cssText, width:getComputedStyle(node).width, height:getComputedStyle(node).height }));
    const detected=await detectAdSlots(page,300,250,'desktop',{returnCandidates:true});
    const result=await injectCreativeIntoDetectedSlot(page,detected.bestSlot,{adImageBuffer:await creative(),slotCandidates:detected.candidates});
    assert.equal(result.succeeded,false);
    assert.equal(await page.$('[data-adframe-injected]'),null);
    assert.deepEqual(await page.$eval('#ad-container-test',node=>({ children:node.innerHTML, inlineStyle:node.style.cssText, width:getComputedStyle(node).width, height:getComputedStyle(node).height })),before);
  });
});

test('explicit selection never silently falls through to another slot', async () => {
  await withPage(publisher(300,203)+'<div id="ad-container-backup" class="ad-container" style="top:600px;height:250px"></div>',async page=>{
    const detected=await detectAdSlots(page,300,250,'desktop',{returnCandidates:true});
    const result=await injectCreativeIntoDetectedSlot(page,detected.bestSlot,{adImageBuffer:await creative(),slotCandidates:detected.candidates,selectedSlotId:'missing-selected-slot'});
    assert.equal(result.succeeded,false);assert.equal(await page.$('[data-adframe-injected]'),null);
  });
});

test('image, document.write and script tags produce verified pixels; empty and video tags stay low confidence', async () => {
  const png=await creative();const image=`<img width="300" height="250" src="data:image/png;base64,${png.toString('base64')}">`;
  for (const tag of [image, `<script>document.write(${JSON.stringify(image)})</script>`, `<script>document.getElementById('ad').insertAdjacentHTML('beforeend',${JSON.stringify(image)})</script>`]) {
    const result=await renderAdTag(tag,300,250);
    assert.equal(result.renderConfidence,'high');
    assert.equal((await verifyFinalCreative(result.imageBuffer,png,{x:0,y:0},300,250)).passed,true);
  }
  assert.equal((await renderAdTag('<script src="data:text/javascript,throw%20new%20Error()"></script>',300,250)).renderConfidence,'low');
  assert.equal((await renderAdTag('<script src="https://example.invalid/vpaid.js"></script>',300,250)).renderConfidence,'low');
});
