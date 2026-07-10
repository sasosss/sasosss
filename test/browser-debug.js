'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 500)));
  page.on('console', m => console.log('CONSOLE', m.type() + ':', m.text().slice(0, 300)));
  const url = 'file://' + path.join(__dirname, '..', 'dist', 'PersistentCivilizationSimulator.html');
  await page.goto(url);
  await new Promise(r => setTimeout(r, 5000));
  const st = await page.evaluate(() => ({
    hasPCS: !!window.PCS,
    hasApp: !!(window.PCS && PCS.app),
    hasWorld: !!(window.PCS && PCS.world),
    overlay: document.getElementById('overlay') ? document.getElementById('overlay').style.display : 'n/a',
    keys: window.PCS ? Object.keys(PCS).slice(0, 30) : [],
  }));
  console.log(JSON.stringify(st, null, 2));
  await browser.close();
})();
