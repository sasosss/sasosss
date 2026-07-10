/* Economy: seasonal production and consumption, limited resources, markets
   with drifting prices, inflation from money supply, trade routes, pirates,
   famines, crises, taxation and public buildings. */
(function () {
  'use strict';
  const PCS = (globalThis.PCS = globalThis.PCS || {});
  const { U } = PCS;

  PCS.economyTick = function (world, season) {
    const rng = world.rng, year = world.year;

    for (const city of world.cities) {
      if (city.dead) continue;
      const civ = world.civs[city.civId];
      const fert = city.fertilityAround(world);
      const res = city.resourcesNearby(world);

      // ---- production (season-dependent) ----
      // hunting/gathering baseline keeps pre-agricultural tribes alive
      let farmEff = 1.0 + (civ.techs.includes('caccia') ? 0.15 : 0);
      if (civ.techs.includes('agricoltura')) farmEff += 0.65;
      if (civ.techs.includes('ruota')) farmEff += 0.15;
      if (civ.techs.includes('ferro')) farmEff += 0.2;
      if (civ.techs.includes('vapore')) farmEff += 0.55;
      if (civ.techs.includes('motore')) farmEff += 0.8;
      const hasAgri = civ.techs.includes('agricoltura');
      // hunters eat year-round; farmers depend on the harvest season
      const seasonMul = hasAgri ? [1.0, 1.35, 1.5, 0.25][season] : [1.05, 1.1, 1.1, 0.85][season];
      let foodProd = city.pop * 0.011 * farmEff * (0.6 + fert) * seasonMul;
      if (res.includes('grano')) foodProd *= 1.25;
      if (res.includes('pesce')) foodProd *= 1.2;
      // carrying capacity: land around a city only feeds so many mouths
      const capacity = cityCapacity(world, city, civ, fert);
      if (city.pop > capacity) foodProd *= Math.max(0.55, capacity / city.pop);
      const foodNeed = city.pop * 0.01;
      city.food += foodProd - foodNeed;

      // famine logic
      if (city.food < 0) {
        city.food = 0;
        if (!city.famine) {
          city.famine = true;
          world.chronicle.add(year, 'economia', `Carestia a ${city.name}: i granai sono vuoti.`, 6, { civIds: [civ.id] });
        }
        const deaths = Math.round(city.pop * rng.f(0.01, 0.035));
        city.pop = Math.max(10, city.pop - deaths);
        city.unrest = Math.min(1, city.unrest + 0.06);
        // famine can kill simulated people
        for (const p of city.people(world)) {
          if (rng.chance(0.02)) world.killPerson(p, year, 'fame');
          else if (rng.chance(0.3)) p.feel('paura', 0.3);
        }
      } else if (city.famine && city.food > city.pop * 0.02) {
        city.famine = false;
        world.chronicle.add(year, 'economia', `La carestia a ${city.name} è finita.`, 4, { civIds: [civ.id] });
      }
      city.food = Math.min(city.food, city.pop * 0.08); // storage limit

      // ---- goods & wealth ----
      let goods = city.pop * 0.004 * (1 + (civ.techs.includes('bronzo') ? 0.2 : 0) + (civ.techs.includes('ferro') ? 0.3 : 0) + (civ.techs.includes('vapore') ? 1.2 : 0) + (civ.techs.includes('elettricita') ? 1.5 : 0));
      for (const r of res) if (['ferro', 'rame', 'legname', 'argilla', 'pietra'].includes(r)) goods *= 1.08;
      let luxury = 0;
      for (const r of res) if (['oro', 'gemme', 'spezie', 'sale'].includes(r)) luxury += city.pop * 0.001;
      const income = goods * 0.5 + luxury * 2;
      city.wealth += income;
      // taxes
      const tax = income * 0.3;
      city.wealth -= tax;
      civ.treasury += tax;

      // ---- market prices & inflation ----
      if (civ.techs.includes('moneta')) {
        city.moneySupply += income * 0.4 - city.moneySupply * 0.01;
        const inflation = U.clamp(city.moneySupply / Math.max(20, city.pop * 0.12), 0.4, 6);
        const scarcity = city.famine ? 2.2 : (city.food < city.pop * 0.01 ? 1.4 : 1);
        drift(rng, city.prices, 'grano', inflation * scarcity);
        drift(rng, city.prices, 'utensili', inflation * (res.includes('ferro') ? 0.85 : 1.15));
        drift(rng, city.prices, 'stoffe', inflation);
        drift(rng, city.prices, 'metalli', inflation * (res.includes('rame') || res.includes('ferro') ? 0.8 : 1.25));
        drift(rng, city.prices, 'lusso', inflation * (luxury > 0 ? 0.8 : 1.4));
      }

      // ---- prosperity & unrest ----
      const foodSec = city.famine ? 0 : U.clamp(city.food / Math.max(1, city.pop * 0.03), 0, 1);
      const target = U.clamp(0.2 + foodSec * 0.35 + Math.min(0.3, city.wealth / (city.pop + 1) * 0.6) + (city.plague ? -0.25 : 0), 0.05, 1);
      city.prosperity = U.lerp(city.prosperity, target, 0.12);
      city.unrest = U.clamp(city.unrest + (city.prosperity < 0.3 ? 0.02 : -0.015) + (city.prices.grano > 3 ? 0.015 : 0), 0, 1);

      // ---- buildings ----
      if (season === 2 && city.wealth > 60 && rng.chance(0.25)) {
        buildSomething(world, city, civ, res);
      }
    }

    // ---- trade routes (yearly-ish, on spring) ----
    if (season === 0) tradeTick(world);

    // ---- economic crises ----
    if (season === 3 && rng.chance(0.012)) {
      const civs = world.civs.filter(c => !c.dead && c.techs.includes('moneta'));
      if (civs.length) {
        const civ = rng.pick(civs);
        civ.treasury *= 0.4;
        for (const c of civ.cities(world)) {
          c.wealth *= 0.55; c.moneySupply *= 0.6; c.unrest = Math.min(1, c.unrest + 0.15);
        }
        world.chronicle.add(year, 'economia', `Crisi economica in ${civ.name}: crolla il valore della moneta, i mercati sono nel panico.`, 7, { civIds: [civ.id], name: `Crisi di ${world.cities[civ.capitalId] ? world.cities[civ.capitalId].name : civ.name}` });
      }
    }
  };

  // how many people the land + technology around a city can sustain
  function cityCapacity(world, city, civ, fert) {
    if (fert === undefined) fert = city.fertilityAround(world);
    const hasAgri = civ.techs.includes('agricoltura');
    let techMul = 1;
    if (civ.techs.includes('ferro')) techMul += 0.5;
    if (civ.techs.includes('ingegneria')) techMul += 0.6;
    if (civ.techs.includes('vapore')) techMul += 2;
    if (civ.techs.includes('motore')) techMul += 4;
    if (civ.techs.includes('elettricita')) techMul += 3;
    return (hasAgri ? 6000 : 900) * (0.3 + fert) * techMul;
  }
  PCS.cityCapacity = cityCapacity;

  function drift(rng, prices, key, target) {
    prices[key] = +U.clamp(U.lerp(prices[key], target * rng.f(0.9, 1.1), 0.15), 0.2, 9.9).toFixed(2);
  }

  function buildSomething(world, city, civ, res) {
    const rng = world.rng, year = world.year;
    const options = [];
    if (!city.buildings.includes('mercato') && civ.techs.includes('moneta')) options.push('mercato');
    if (!city.buildings.includes('tempio') && city.mainReligionId != null) options.push('tempio');
    if (!city.buildings.includes('biblioteca') && civ.techs.includes('scrittura')) options.push('biblioteca');
    if (!city.buildings.includes('università') && civ.techs.includes('universita')) options.push('università');
    if (!city.buildings.includes('porto') && civ.techs.includes('vela') && nearWater(world, city)) options.push('porto');
    if (city.walls < 2 && civ.techs.includes('ingegneria')) options.push('mura');
    if (!city.buildings.includes('acquedotto') && civ.techs.includes('ingegneria')) options.push('acquedotto');
    if (!city.buildings.includes('teatro') && city.pop > 2000) options.push('teatro');
    if (!city.buildings.includes('ospedale') && civ.techs.includes('medicina')) options.push('ospedale');
    if (!city.buildings.includes('ferrovia') && civ.techs.includes('ferrovia')) options.push('ferrovia');
    if (!options.length) return;
    const b = rng.pick(options);
    city.wealth -= 40;
    if (b === 'mura') { city.walls++; }
    else city.buildings.push(b);
    if (b === 'tempio' && city.mainReligionId != null) {
      const r = world.religions[city.mainReligionId];
      world.chronicle.add(year, 'religione', `A ${city.name} sorge un grande tempio dedicato a ${r.gods[0].name}.`, 4, { civIds: [civ.id] });
    } else if (rng.chance(0.4)) {
      world.chronicle.add(year, 'economia', `${city.name} costruisce: ${b}.`, 2, { civIds: [civ.id] });
    }
  }

  function nearWater(world, city) {
    const map = world.map;
    for (let d = 1; d <= 3; d++) {
      for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
        if (map.inb(city.x + dx, city.y + dy) && map.isWater(map.idx(city.x + dx, city.y + dy))) return true;
      }
    }
    return false;
  }

  function tradeTick(world) {
    const rng = world.rng, year = world.year;
    const alive = world.cities.filter(c => !c.dead);
    for (const city of alive) {
      const civ = world.civs[city.civId];
      if (!civ.techs.includes('ruota') && !civ.techs.includes('vela')) continue;
      // prune broken routes
      city.tradeRoutes = city.tradeRoutes.filter(id => {
        const o = world.cities[id];
        if (!o || o.dead) return false;
        const oc = world.civs[o.civId];
        return !atWar(world, civ.id, oc.id);
      });
      const maxRoutes = civ.techs.includes('navigazione') ? 4 : 2;
      if (city.tradeRoutes.length >= maxRoutes) continue;
      const range = civ.techs.includes('navigazione') ? 70 : civ.techs.includes('vela') ? 45 : 25;
      const partners = alive.filter(o =>
        o.id !== city.id && !city.tradeRoutes.includes(o.id) &&
        U.dist(o.x, o.y, city.x, city.y) < range &&
        !atWar(world, civ.id, world.civs[o.civId].id));
      if (!partners.length) continue;
      const partner = U.maxBy(partners, o => o.wealth - U.dist(o.x, o.y, city.x, city.y) * 0.5 + (world.civs[o.civId].hasTreaty(civ.id, 'commercio') ? 30 : 0));
      if (rng.chance(0.5)) {
        city.tradeRoutes.push(partner.id);
        partner.tradeRoutes.push(city.id);
        const oc = world.civs[partner.civId];
        if (oc.id !== civ.id) { civ.changeRel(oc.id, 6); oc.changeRel(civ.id, 6); }
        if (rng.chance(0.35)) world.chronicle.add(year, 'economia', `Si apre una rotta commerciale tra ${city.name} e ${partner.name}.`, 3, { civIds: [civ.id, oc.id] });
      }
    }
    // trade income + food relief + pirates
    for (const city of alive) {
      for (const rid of city.tradeRoutes) {
        const o = world.cities[rid];
        if (!o || o.dead) continue;
        let gain = Math.min(city.pop, o.pop) * 0.0022;
        // pirates prey on sea routes
        const seaRoute = U.dist(city.x, city.y, o.x, o.y) > 30;
        if (seaRoute && rng.chance(0.05)) {
          gain *= 0.2;
          if (rng.chance(0.35)) {
            const civ = world.civs[city.civId];
            const pirateName = 'Flotta ' + rng.pick(['del Corvo Nero', 'della Vela Rossa', 'dei Denti di Squalo', 'del Serpente', 'delle Nebbie']);
            world.chronicle.add(year, 'economia', `Pirati (${pirateName}) saccheggiano i convogli tra ${city.name} e ${o.name}.`, 4, { civIds: [civ.id] });
          }
        }
        city.wealth += gain;
        // food flows to hungry partners
        if (o.famine && city.food > city.pop * 0.03) {
          const aid = Math.min(city.food * 0.2, o.pop * 0.01);
          city.food -= aid; o.food += aid;
        }
      }
    }
  }

  function atWar(world, a, b) {
    return world.wars.some(w => !w.endYear &&
      ((w.attackerId === a && w.defenderId === b) || (w.attackerId === b && w.defenderId === a)));
  }
  PCS.atWar = atWar;
})();
