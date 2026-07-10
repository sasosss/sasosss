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
const world = new PCS.World('test-seed-42', { mapW: 240, mapH: 150 });
for (let y = 0; y < 120; y++) {
  for (let s = 0; s < 4; s++) world.tick();
  if (y % 10 === 0 || y < 15) {
    const pop = world.cities.filter(c => !c.dead).reduce((s, c) => s + c.pop, 0);
    const cities = world.cities.filter(c => !c.dead);
    const famines = cities.filter(c => c.famine).length;
    const births = [...world.people.values()].filter(p => p.birthYear === world.year - 1).length;
    // death causes histogram over last 10 years
    const causes = {};
    for (const p of world.people.values()) {
      if (p.deathYear != null && p.deathYear > world.year - 10) causes[p.deathCause] = (causes[p.deathCause] || 0) + 1;
    }
    console.log(`anno ${world.year}: viventi=${world.livingCount} pop=${pop} città=${cities.length} carestie=${famines} nascite/anno≈${births} morti10y=${JSON.stringify(causes)}`);
    const c0 = cities[0];
    if (c0) console.log(`  ${c0.name}: pop=${Math.round(c0.pop)} food=${c0.food.toFixed(1)} fert=${c0.fertilityAround(world).toFixed(2)} prosp=${c0.prosperity.toFixed(2)} famine=${c0.famine}`);
  }
}
