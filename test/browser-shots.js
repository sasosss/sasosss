'use strict';
/* Takes UI screenshots of the built artifact for visual review. */
const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 900 });
  page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 300)));
  await page.goto('file://' + path.join(__dirname, '..', 'dist', 'PersistentCivilizationSimulator.html'));
  await page.waitForFunction(() => window.PCS && PCS.world && PCS.world.civs.length > 0, { timeout: 30000 });
  // run 80 years so history accumulates
  await page.evaluate(() => PCS.app.setSpeed(1000));
  await page.waitForFunction(() => PCS.world.year > 80, { timeout: 60000 });
  await page.evaluate(() => PCS.app.setSpeed(1));
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(__dirname, '..', 'shots', 'main.png') });
  // city inspector
  await page.evaluate(() => {
    const c = PCS.world.cities.filter(c => !c.dead).sort((a, b) => b.pop - a.pop)[0];
    PCS.app.renderer.centerOn(c.x, c.y);
    PCS.app.ui.inspect('city', c.id);
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(__dirname, '..', 'shots', 'city.png') });
  // person inspector
  await page.evaluate(() => {
    const p = PCS.world.livingPeople().filter(p => p.age(PCS.world.year) > 30 && p.memories.length > 5)
      .sort((a, b) => b.memories.length - a.memories.length)[0];
    PCS.app.ui.inspect('person', p.id);
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(__dirname, '..', 'shots', 'person.png') });
  // chat
  await page.evaluate(() => {
    const p = PCS.world.livingPeople().filter(p => p.age(PCS.world.year) > 30 && p.memories.length > 5)[0];
    PCS.app.ui.openChat(p.id);
  });
  await new Promise(r => setTimeout(r, 500));
  await page.type('#chat-input', 'raccontami i tuoi ricordi più importanti');
  await page.click('#chat-send');
  await new Promise(r => setTimeout(r, 1300));
  await page.type('#chat-input', 'cosa pensi di chi governa qui?');
  await page.click('#chat-send');
  await new Promise(r => setTimeout(r, 1300));
  await page.screenshot({ path: path.join(__dirname, '..', 'shots', 'chat.png') });
  await page.click('[data-action="close-chat"]');
  // civ inspector + timeline tab
  await page.evaluate(() => {
    const c = PCS.world.civs.filter(c => !c.dead)[0];
    PCS.app.ui.inspect('civ', c.id);
    PCS.app.ui.tab = 'timeline';
    PCS.app.ui.renderPanel();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(__dirname, '..', 'shots', 'civ.png') });
  await browser.close();
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
