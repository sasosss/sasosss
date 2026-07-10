'use strict';
const path = require('path');
const files = [
  'src/core/utils.js', 'src/core/rng.js', 'src/core/noise.js', 'src/core/language.js',
  'src/sim/worldgen.js', 'src/sim/culture.js', 'src/sim/person.js', 'src/sim/tech.js',
  'src/sim/civilization.js', 'src/sim/history.js', 'src/sim/engine.js',
  'src/sim/demography.js', 'src/sim/politics.js', 'src/sim/economy.js',
  'src/sim/war.js', 'src/sim/nature.js', 'src/chat/chat.js',
];
for (const f of files) require(path.join(__dirname, '..', f));
const PCS = globalThis.PCS;
const world = new PCS.World('longrun-7', { mapW: 300, mapH: 190 });
const t0 = Date.now();
for (let y = 0; y < 1200; y++) {
  for (let s = 0; s < 4; s++) world.tick();
  if (y % 100 === 99) {
    const pop = world.cities.filter(c => !c.dead).reduce((s, c) => s + c.pop, 0);
    const civsAlive = world.civs.filter(c => !c.dead);
    const techMax = Math.max(0, ...civsAlive.map(c => c.techs.length));
    const eras = civsAlive.map(c => PCS.civEra(c));
    const wars = world.wars.filter(w => !w.endYear).length;
    const rels = world.religions.filter(r => !r.dead).length;
    console.log(`anno ${world.year}: pop=${pop} viventi=${world.livingCount} civ=${civsAlive.length} città=${world.cities.filter(c => !c.dead).length} techMax=${techMax} era=${eras.sort().pop() || '-'} guerre=${wars} religioni=${rels} persone-registro=${world.people.size} eventi=${world.chronicle.events.length}`);
  }
}
console.log(`\n1200 anni in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const json = JSON.stringify(world.serialize());
const comp = PCS.LZ.compress(json);
console.log(`salvataggio: ${(json.length / 1048576).toFixed(1)} MB → ${(comp.length / 1048576).toFixed(2)} MB compresso`);
if (PCS.LZ.decompress(comp) !== json) { console.error('LZ MISMATCH'); process.exit(1); }
console.log('LZ ok');
// verify a chat with an old-world NPC still works
PCS.world = world;
const alive = world.livingPeople().filter(p => p.age(world.year) > 25);
const npc = alive[0];
const chat = new PCS.ChatSession(world, npc);
console.log('\n--- chat di prova ---');
console.log('NPC:', chat.respond('ciao, chi sei e cosa sai della storia del mondo?').slice(0, 400));
