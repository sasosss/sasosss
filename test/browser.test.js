#!/usr/bin/env node
/* Browser smoke test on the built single-file artifact using headless Chrome. */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');

let failures = 0;
function check(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.error('  ✗ FAIL: ' + msg); failures++; }
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1400,900'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  const url = 'file://' + path.join(__dirname, '..', 'dist', 'PersistentCivilizationSimulator.html');
  await page.goto(url);

  // wait for world genesis
  await page.waitForFunction(() => window.PCS && PCS.world && PCS.world.civs && PCS.world.civs.length > 0, { timeout: 30000 });
  console.log('— Avvio nel browser');
  check(true, 'mondo generato nel browser');
  await new Promise(r => setTimeout(r, 500));
  check((await page.$('#overlay')) && await page.$eval('#overlay', el => el.style.display === 'none'), 'overlay di caricamento nascosto');

  // let it run at 100x for a bit
  await page.evaluate(() => PCS.app.setSpeed(100));
  await new Promise(r => setTimeout(r, 4000));
  const state1 = await page.evaluate(() => ({ year: PCS.world.year, living: PCS.world.livingCount, events: PCS.world.chronicle.events.length }));
  console.log(`  (dopo 4s a 100×: anno ${state1.year}, ${state1.living} viventi, ${state1.events} eventi)`);
  check(state1.year > 5, `il tempo avanza: anno ${state1.year}`);
  check(state1.living > 100, `individui vivi: ${state1.living}`);

  // UI: date label updates
  const dateLabel = await page.$eval('#date-label', el => el.textContent);
  check(/anno \d+/.test(dateLabel), `etichetta data aggiornata: "${dateLabel}"`);

  // open a city inspector programmatically via click on a city pixel
  const cityOpened = await page.evaluate(() => {
    const c = PCS.world.cities.find(c => !c.dead);
    if (!c) return false;
    PCS.app.ui.inspect('city', c.id);
    return document.querySelector('#inspector').classList.contains('open');
  });
  check(cityOpened, 'ispettore città apribile');

  // open chat with an adult NPC
  const chatInfo = await page.evaluate(() => {
    const p = PCS.world.livingPeople().find(p => p.age(PCS.world.year) > 20);
    PCS.app.ui.openChat(p.id);
    return { open: document.querySelector('#chat-modal').classList.contains('open'), name: p.fullName, id: p.id };
  });
  check(chatInfo.open, `finestra chat aperta con ${chatInfo.name}`);
  await new Promise(r => setTimeout(r, 300));
  // send a message
  await page.type('#chat-input', 'ciao! parlami della tua famiglia');
  await page.click('#chat-send');
  await new Promise(r => setTimeout(r, 1400));
  const bubbles = await page.$$eval('#chat-log .bubble', els => els.map(e => e.textContent));
  check(bubbles.length >= 3, `conversazione avvenuta (${bubbles.length} messaggi)`);
  check(bubbles[bubbles.length - 1].length > 20, 'risposta NPC sostanziosa');
  console.log('  NPC dice: «' + bubbles[bubbles.length - 1].slice(0, 140) + '…»');
  await page.click('[data-action="close-chat"]');

  // timeline tab
  await page.evaluate(() => { PCS.app.ui.tab = 'timeline'; PCS.app.ui.renderPanel(); });
  const timelineOk = await page.$eval('#panel-content', el => el.textContent.includes('Consulta per decennio'));
  check(timelineOk, 'scheda cronologia renderizzata');

  // save & reload persistence
  await page.evaluate(() => PCS.app.save());
  const beforeYear = await page.evaluate(() => PCS.world.year);
  await page.reload();
  await page.waitForFunction(() => window.PCS && PCS.world && PCS.world.year > 0, { timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000)); // possible catch-up
  const afterYear = await page.evaluate(() => PCS.world.year);
  check(afterYear >= beforeYear, `persistenza: anno ${beforeYear} → ricaricato all'anno ${afterYear}`);
  // NPC remembers the chat after reload
  const remembered = await page.evaluate((id) => {
    const p = PCS.world.people.get(id);
    return p ? { met: p.playerMet, chats: p.playerChats.length } : null;
  }, chatInfo.id);
  check(remembered && remembered.met && remembered.chats > 0, `l'NPC ricorda la conversazione dopo il reload (${remembered ? remembered.chats : 0} ricordi)`);

  // screenshot for the PR
  await page.evaluate(() => PCS.app.setSpeed(0));
  await page.screenshot({ path: path.join(__dirname, '..', 'screenshot.png') });
  console.log('  (screenshot salvato)');

  const realErrors = errors.filter(e => !e.includes('favicon'));
  check(realErrors.length === 0, realErrors.length ? 'errori console: ' + realErrors.slice(0, 3).join(' | ') : 'nessun errore JavaScript in console');

  await browser.close();
  console.log(failures === 0 ? '\nBROWSER TEST SUPERATI ✅' : `\n${failures} TEST FALLITI ❌`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
