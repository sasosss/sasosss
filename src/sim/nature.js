/* Nature: wildlife with a real food chain (prey/predator populations,
   migration, extinction), plus disasters — plagues, wildfires, earthquakes,
   volcanic eruptions and meteor strikes — and seasonal weather effects. */
(function () {
  'use strict';
  const PCS = (globalThis.PCS = globalThis.PCS || {});
  const { U } = PCS;

  // ---------------- SEASONAL ----------------
  PCS.natureSeasonTick = function (world, season) {
    const rng = world.rng, year = world.year;

    // ---- wildlife (Lotka-Volterra-ish, seasonal) ----
    if (season === 0 || season === 2) {
      for (const a of world.animals) {
        if (a.extinct) continue;
        if (a.type === 'preda') {
          // reproduce in spring; grazing capacity limited
          const cap = 2600;
          a.count = Math.round(a.count * (season === 0 ? a.rate : 1.02) * (1 - a.count / (cap * 2)));
          // hunted by nearby humans
          const nearCity = world.cities.find(c => !c.dead && U.dist(c.x, c.y, a.x, a.y) < 26);
          if (nearCity) a.count -= Math.round(Math.min(a.count * 0.15, nearCity.pop * 0.01));
        } else {
          // predators need prey in same region
          const preyHere = world.animals.filter(o => !o.extinct && o.region === a.region && a.prey && a.prey.includes(o.species));
          const food = U.sum(preyHere, o => o.count);
          if (food > a.count * 6) {
            a.count = Math.round(a.count * a.rate);
            for (const o of preyHere) o.count = Math.round(o.count * 0.93);
          } else {
            a.count = Math.round(a.count * 0.82);
            a.migrating = true;
          }
        }
        // migration to adjacent region when starving/crowded
        if (a.migrating || a.count > 2200) {
          a.x = U.clamp(a.x + rng.i(-18, 18), 4, world.map.w - 4);
          a.y = U.clamp(a.y + rng.i(-18, 18), 4, world.map.h - 4);
          a.region = `${Math.floor(a.x / 44)}-${Math.floor(a.y / 44)}`;
          a.migrating = false;
        }
        if (a.count <= 2) {
          a.extinct = true;
          a.count = 0;
          world.chronicle.add(year, 'natura', `I ${a.species} della regione si sono estinti.`, 4);
        }
      }
    }

    // ---- plagues progress seasonally ----
    for (const city of world.cities) {
      if (city.dead || !city.plague) continue;
      const civ = world.civs[city.civId];
      let d = city.plague.deadliness;
      if (civ.techs.includes('medicina')) d *= 0.8;
      if (civ.techs.includes('vaccini')) d *= 0.5;
      if (civ.techs.includes('antibiotici')) d *= 0.25;
      const deaths = Math.round(city.pop * d * rng.f(0.3, 0.7) * 0.25);
      city.pop = Math.max(5, city.pop - deaths);
      // spread along trade routes
      if (rng.chance(d * 1.5)) {
        for (const rid of city.tradeRoutes) {
          const o = world.cities[rid];
          if (o && !o.dead && !o.plague && rng.chance(0.4)) {
            o.plague = { name: city.plague.name, deadliness: city.plague.deadliness * rng.f(0.8, 1.1), yearsLeft: rng.i(2, 6) };
            world.chronicle.add(year, 'disastro', `La ${city.plague.name} raggiunge ${o.name} lungo le rotte commerciali.`, 6, { civIds: [world.civs[o.civId].id] });
          }
        }
      }
    }
  };

  // ---------------- YEARLY ----------------
  PCS.natureYearTick = function (world) {
    const rng = world.rng, year = world.year;
    const map = world.map;

    // forests regrow slowly
    if (year % 4 === 0) {
      for (let i = 0; i < map.forest.length; i++) {
        if (map.forest[i] > 0 && map.forest[i] < 1) map.forest[i] = Math.min(1, map.forest[i] + 0.02);
      }
    }

    // ---- plague outbreaks ----
    if (rng.chance(0.02)) {
      const candidates = world.cities.filter(c => !c.dead && !c.plague && c.pop > 800);
      if (candidates.length) {
        const city = U.maxBy(candidates, c => c.pop * (1 - c.prosperity));
        const name = PCS.plagueName(rng);
        const deadliness = rng.f(0.05, 0.28);
        city.plague = { name, deadliness, yearsLeft: rng.i(2, 8) };
        const big = deadliness > 0.15;
        world.chronicle.add(year, 'disastro', `Scoppia la ${name} a ${city.name}!${big ? ' I becchini non bastano più.' : ''}`, big ? 8 : 6, { civIds: [world.civs[city.civId].id], name: big ? 'La ' + name : undefined });
        for (const p of city.people(world)) { p.feel('paura', 0.6); if (rng.chance(0.4)) p.addMemory(year, 'storia', `La ${name} è arrivata a ${city.name}: la morte cammina tra noi`, 7); }
      }
    }
    for (const city of world.cities) {
      if (city.plague && --city.plague.yearsLeft <= 0) {
        world.chronicle.add(year, 'disastro', `La ${city.plague.name} a ${city.name} si estingue.`, 5, { civIds: [world.civs[city.civId].id] });
        city.plague = null;
      }
    }

    // ---- wildfire ----
    if (rng.chance(0.08)) {
      const x = rng.i(4, map.w - 5), y = rng.i(4, map.h - 5);
      const i = map.idx(x, y);
      if (map.forest[i] > 0.4) {
        let burned = 0;
        const R = rng.i(3, 8);
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
          const nx = x + dx, ny = y + dy;
          if (!map.inb(nx, ny) || dx * dx + dy * dy > R * R) continue;
          const j = map.idx(nx, ny);
          if (map.forest[j] > 0.1) { map.forest[j] *= 0.15; burned++; }
        }
        if (burned > 20) {
          const near = world.cities.find(c => !c.dead && U.dist(c.x, c.y, x, y) < R + 4);
          world.chronicle.add(year, 'disastro', `Un grande incendio divora le foreste${near ? ' presso ' + near.name : ''}.`, 5);
          if (near) { near.food *= 0.8; for (const p of near.people(world)) if (rng.chance(0.2)) p.feel('paura', 0.4); }
        }
      }
    }

    // ---- earthquake ----
    if (rng.chance(0.025)) {
      const cities = world.cities.filter(c => !c.dead);
      if (cities.length) {
        const city = rng.pick(cities);
        const mag = rng.f(0.1, 0.5);
        const deaths = Math.round(city.pop * mag * 0.08);
        city.pop = Math.max(10, city.pop - deaths);
        city.wealth *= (1 - mag * 0.5);
        if (city.walls > 0 && rng.chance(mag)) city.walls--;
        world.chronicle.add(year, 'disastro', `Terremoto a ${city.name}: ${U.fmt(deaths)} vittime, interi quartieri in rovina.`, mag > 0.3 ? 7 : 5, { civIds: [world.civs[city.civId].id], name: mag > 0.35 ? `Il Grande Terremoto di ${city.name}` : undefined });
        for (const p of city.people(world)) {
          if (rng.chance(mag * 0.15)) world.killPerson(p, year, 'terremoto');
          else if (rng.chance(0.5)) { p.feel('paura', 0.7); p.addMemory(year, 'trauma', `Il terremoto di ${city.name}: la terra tremava e le case crollavano`, 7); }
        }
      }
    }

    // ---- volcanic eruption (from peaks) ----
    if (rng.chance(0.008)) {
      // find a peak tile
      let px = -1, py = -1;
      for (let t = 0; t < 200; t++) {
        const x = rng.i(0, map.w - 1), y = rng.i(0, map.h - 1);
        if (map.biome[map.idx(x, y)] === PCS.BIOMES.PEAK) { px = x; py = y; break; }
      }
      if (px >= 0) {
        const victims = world.cities.filter(c => !c.dead && U.dist(c.x, c.y, px, py) < 15);
        world.chronicle.add(year, 'disastro', `Eruzione vulcanica! Il cielo si oscura di cenere${victims.length ? ' su ' + victims.map(c => c.name).join(', ') : ''}.`, 8, { name: 'L\'Eruzione del ' + year });
        for (const c of victims) {
          const kill = rng.f(0.1, 0.4);
          c.pop = Math.max(5, Math.round(c.pop * (1 - kill)));
          c.food *= 0.4;
          for (const p of c.people(world)) {
            if (rng.chance(kill * 0.3)) world.killPerson(p, year, 'eruzione');
            else p.addMemory(year, 'trauma', 'Ho visto il vulcano esplodere: pioggia di fuoco e cenere sul mondo', 9);
          }
        }
        // ash winter: global food penalty
        for (const c of world.cities) if (!c.dead) c.food *= 0.85;
      }
    }

    // ---- meteor (very rare, epic) ----
    if (rng.chance(0.0012)) {
      const x = rng.i(0, map.w - 1), y = rng.i(0, map.h - 1);
      const sea = map.isWater(map.idx(x, y));
      const victims = world.cities.filter(c => !c.dead && U.dist(c.x, c.y, x, y) < 12);
      world.chronicle.add(year, 'disastro', sea
        ? 'Una stella cadente colpisce l\'oceano: onde immense flagellano le coste.'
        : `Un meteorite squarcia il cielo e colpisce la terra${victims.length ? ' vicino a ' + victims[0].name : ''}!`, 9, { name: 'La Stella Caduta' });
      for (const c of victims) {
        c.pop = Math.max(5, Math.round(c.pop * rng.f(0.3, 0.7)));
        c.wealth *= 0.5;
        for (const p of c.people(world)) {
          if (rng.chance(0.25)) world.killPerson(p, year, 'meteorite');
          else p.addMemory(year, 'trauma', 'La notte in cui cadde la stella: pensavamo fosse la fine del mondo', 10);
        }
      }
      // everyone hears about it
      for (const p of world.livingPeople()) if (rng.chance(0.3)) p.addMemory(year, 'storia', 'Si racconta della stella caduta dal cielo: un presagio degli dèi?', 6);
    }

    // ---- harsh winters in cold regions ----
    if (rng.chance(0.06)) {
      const cold = world.cities.filter(c => !c.dead && world.map.temp[world.map.idx(c.x, c.y)] < 0.25);
      if (cold.length) {
        const c = rng.pick(cold);
        c.food *= 0.6;
        world.chronicle.add(year, 'natura', `Un inverno spietato colpisce ${c.name}: gelo e neve per mesi.`, 4, { civIds: [world.civs[c.civId].id] });
      }
    }

    // city death check
    for (const city of world.cities) {
      if (!city.dead && city.pop < 15) {
        city.dead = true;
        city.deadYear = year;
        const civ = world.civs[city.civId];
        U.removeItem(civ.cityIds, city.id);
        world.chronicle.add(year, 'politica', `${city.name} viene abbandonata: restano solo rovine.`, 6, { civIds: [civ.id] });
        for (const p of city.people(world).slice()) PCS.emigratePerson(world, p, city);
      }
    }
  };
})();
