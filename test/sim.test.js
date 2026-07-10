#!/usr/bin/env node
/* Headless simulation test: runs the engine (no DOM) for several centuries,
   checks invariants, save/load round-trip and the chat engine. */
'use strict';

const files = [
  'src/core/utils.js', 'src/core/rng.js', 'src/core/noise.js', 'src/core/language.js',
  'src/sim/worldgen.js', 'src/sim/culture.js', 'src/sim/person.js', 'src/sim/tech.js',
  'src/sim/civilization.js', 'src/sim/history.js', 'src/sim/engine.js',
  'src/sim/demography.js', 'src/sim/politics.js', 'src/sim/economy.js',
  'src/sim/war.js', 'src/sim/nature.js', 'src/chat/chat.js',
];
const path = require('path');
for (const f of files) require(path.join(__dirname, '..', f));

const PCS = globalThis.PCS;
let failures = 0;
function check(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.error('  ✗ FAIL: ' + msg); failures++; }
}

console.log('— Genesi del mondo');
const t0 = Date.now();
const world = new PCS.World('test-seed-42', { mapW: 240, mapH: 150 });
console.log(`  (genesi in ${Date.now() - t0} ms)`);
check(world.map.w === 240 && world.map.h === 150, 'mappa generata');
check(world.civs.length >= 6, `civiltà iniziali: ${world.civs.length}`);
check(world.livingCount > 100, `popolazione simulata iniziale: ${world.livingCount}`);
check(world.religions.length >= world.civs.length, `religioni: ${world.religions.length}`);
check(world.animals.length > 10, `popolazioni animali: ${world.animals.length}`);

// determinism check of worldgen
const m2 = PCS.generateWorld('test-seed-42', 240, 150);
let same = true;
for (let i = 0; i < m2.biome.length; i += 997) if (m2.biome[i] !== world.map.biome[i]) { same = false; break; }
check(same, 'generazione mappa deterministica dal seed');

console.log('— Simulazione di 300 anni');
const t1 = Date.now();
for (let i = 0; i < 300 * 4; i++) world.tick();
const simMs = Date.now() - t1;
console.log(`  (300 anni in ${simMs} ms → ${(300000 / simMs).toFixed(0)} anni/sec)`);
check(world.year >= 300, `anno raggiunto: ${world.year}`);
check(world.livingCount > 50 && world.livingCount < PCS.LIVING_CAP * 1.6, `viventi simulati entro i limiti: ${world.livingCount}`);
const totalPop = [...world.cities].filter(c => !c.dead).reduce((s, c) => s + c.pop, 0);
check(totalPop > 500, `popolazione aggregata: ${totalPop}`);
check(world.chronicle.events.length > 100, `eventi in cronologia: ${world.chronicle.events.length}`);
check(world.wars.length > 0, `guerre avvenute: ${world.wars.length}`);
const techMax = Math.max(...world.civs.map(c => c.techs.length));
check(techMax > 4, `tecnologie scoperte (max per civiltà): ${techMax}`);

// genealogy: find someone with a grandparent
let hasGrandparent = false, hasMemories = 0, married = 0;
for (const p of world.people.values()) {
  if (!p.alive) continue;
  if (p.memories.length > 0) hasMemories++;
  if (p.spouseId != null) married++;
  const f = world.people.get(p.fatherId);
  if (f && world.people.get(f.fatherId)) hasGrandparent = true;
}
check(hasGrandparent, 'genealogia multi-generazionale presente');
check(hasMemories > world.livingCount * 0.5, `persone con ricordi: ${hasMemories}/${world.livingCount}`);
check(married > 10, `persone sposate: ${married}`);

console.log('— Salvataggio e ricaricamento');
const data = world.serialize();
const json = JSON.stringify(data);
const compressed = PCS.LZ.compress(json);
console.log(`  (salvataggio: ${(json.length / 1024).toFixed(0)} kB → compresso ${(compressed.length / 1024).toFixed(0)} kB)`);
check(compressed.length < 4 * 1024 * 1024, 'salvataggio compresso entro i limiti di localStorage');
const roundtrip = PCS.LZ.decompress(compressed);
check(roundtrip === json, 'compressione LZ reversibile senza perdite');
const world2 = PCS.World.deserialize(JSON.parse(roundtrip));
check(world2.year === world.year, 'anno ripristinato');
check(world2.livingCount === world.livingCount, `viventi ripristinati: ${world2.livingCount}`);
check(world2.chronicle.events.length === world.chronicle.events.length, 'cronologia ripristinata');
check(world2.civs.length === world.civs.length, 'civiltà ripristinate');
// continue simulating the loaded world
for (let i = 0; i < 40; i++) world2.tick();
check(world2.year === world.year + 10, 'il mondo caricato continua a girare');

console.log('— Motore di conversazione');
PCS.world = world2;
const alive = world2.livingPeople().filter(p => p.age(world2.year) > 20);
const npc = alive[Math.floor(alive.length / 2)];
const chat = new PCS.ChatSession(world2, npc);
const q = [
  'ciao, chi sei?',
  'parlami della tua famiglia',
  'cosa pensi del re?',
  'ci sono guerre?',
  'raccontami i tuoi ricordi',
  'quali sono i tuoi sogni?',
  'che si dice in giro?',
  'quanto costa il grano?',
  'ti prometto che tornerò a trovarti',
  'sei una persona fantastica, ti stimo',
];
let allOk = true;
for (const question of q) {
  const a = chat.respond(question);
  if (!a || a.length < 10) { allOk = false; console.error(`    risposta vuota a: "${question}"`); }
}
check(allOk, `10 domande → 10 risposte non vuote (NPC: ${npc.fullName}, ${npc.profession})`);
check(npc.playerChats.length > 0, `l'NPC ricorda la conversazione (${npc.playerChats.length} ricordi di chat)`);
check(npc.playerPromises.length === 1, 'la promessa è stata registrata');
check(npc.playerRel > 0, `l'affinità è cresciuta: ${npc.playerRel}`);
// insult a second npc
const npc2 = alive[0];
const chat2 = new PCS.ChatSession(world2, npc2);
chat2.respond('ciao');
chat2.respond('sei uno stupido idiota');
check(npc2.playerRel < 0, `l'insulto ha effetti: affinità ${npc2.playerRel}`);

// speed benchmark for high speed setting
console.log('— Prestazioni');
const t3 = Date.now();
for (let i = 0; i < 100 * 4; i++) world2.tick();
const ms100 = Date.now() - t3;
console.log(`  (altri 100 anni in ${ms100} ms → ${(100000 / ms100).toFixed(0)} anni/sec)`);
check(ms100 < 60000, 'prestazioni accettabili');

console.log(failures === 0 ? '\nTUTTI I TEST SUPERATI ✅' : `\n${failures} TEST FALLITI ❌`);
process.exit(failures ? 1 : 0);
