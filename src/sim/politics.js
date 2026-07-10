/* Politics & society: succession, elections, coups, revolutions, government
   evolution, research, city founding, civil splits — plus religion dynamics
   (spread, schisms, death of faiths). */
(function () {
  'use strict';
  const PCS = (globalThis.PCS = globalThis.PCS || {});
  const { U } = PCS;

  PCS.politicsTick = function (world) {
    const rng = world.rng;
    const year = world.year;

    for (const civ of world.civs) {
      if (civ.dead) continue;
      const cities = civ.cities(world);
      if (!cities.length) { collapseCiv(world, civ, 'ha perso tutte le città'); continue; }
      const capital = world.cities[civ.capitalId] && !world.cities[civ.capitalId].dead
        ? world.cities[civ.capitalId] : cities[0];
      civ.capitalId = capital.id;

      // ---- leadership ----
      let leader = world.people.get(civ.leaderId);
      if (!leader || !leader.alive) {
        succession(world, civ, capital);
        leader = world.people.get(civ.leaderId);
      } else if ((civ.government === 'repubblica' || civ.government === 'federazione') && (year - (civ.lastElection || civ.foundedYear)) >= 6) {
        election(world, civ, capital);
      } else if (leader.age(year) > 80 && rng.chance(0.3)) {
        leader.title = null;
        world.chronicle.add(year, 'politica', `${leader.fullName} abdica per anzianità in ${civ.name}.`, 4, { civIds: [civ.id] });
        civ.leaderId = null;
        succession(world, civ, capital);
      }

      // ---- stability & unrest ----
      const avgUnrest = U.sum(cities, c => c.unrest) / cities.length;
      const gi = civ.govInfo();
      // big states are hard to hold together (federations less so)
      const sizeDrag = Math.max(0, cities.length - (civ.government === 'federazione' ? 11 : 6)) * 0.003;
      civ.stability = U.clamp(civ.stability + (gi.stability - 0.5) * 0.02 - avgUnrest * 0.03 - civ.warExhaustion * 0.02 - sizeDrag + 0.008, 0.05, 1);
      // coups & revolutions
      if (civ.stability < 0.3 && rng.chance(0.15)) {
        coupOrRevolution(world, civ, capital);
      }
      // government evolution with size/era
      maybeEvolveGovernment(world, civ);

      // ---- research ----
      researchTick(world, civ, cities);

      // ---- expansion: found new city ----
      const totalPop = civ.totalPop(world);
      if (totalPop > cities.length * 900 && civ.treasury > 80 && cities.length < 12 && rng.chance(0.2)) {
        foundColony(world, civ, capital);
      }

      // ---- civil split of very large unstable states ----
      const civCount = world.civs.filter(c => !c.dead).length;
      if (civCount < 26) {
        if (cities.length >= 5 && civ.stability < 0.35 && rng.chance(0.06)) {
          secession(world, civ);
        } else if (cities.length >= 11 && rng.chance(0.012)) {
          secession(world, civ); // sheer size breeds separatism
        }
      }
    }
  };

  function succession(world, civ, capital) {
    const rng = world.rng, year = world.year;
    const pool = capital.people(world).filter(p => p.alive && p.age(year) >= 20 && p.age(year) < 75);
    if (!pool.length) return;
    let heir = null;
    const old = world.people.get(civ.leaderId);
    if ((civ.government === 'monarchia' || civ.government === 'impero') && civ.dynasty) {
      // dynastic: eldest living child of previous leader, else same-surname noble
      const prev = [...world.people.values()].find(p => p.title && !p.alive && world.cities[p.cityId] && world.cities[p.cityId].civId === civ.id && p.surname === civ.dynasty);
      const kids = prev ? prev.childrenIds.map(id => world.people.get(id)).filter(k => k && k.alive && k.age(year) >= 14) : [];
      heir = kids.sort((a, b) => a.birthYear - b.birthYear)[0]
        || pool.filter(p => p.surname === civ.dynasty).sort((a, b) => a.birthYear - b.birthYear)[0]
        || null;
      if (!heir) {
        // dynasty extinct -> succession crisis
        civ.stability = Math.max(0.05, civ.stability - 0.2);
        world.chronicle.add(year, 'politica', `La dinastia ${civ.dynasty} di ${civ.name} si estingue: crisi di successione!`, 7, { civIds: [civ.id] });
        heir = U.maxBy(pool, p => p.traits.ambition * 2 + p.reputation * 0.01 + p.skills.combattimento);
        civ.dynasty = heir ? heir.surname : null;
      }
    } else if (civ.government === 'teocrazia') {
      heir = U.maxBy(pool, p => p.traits.piety * 3 + p.skills.sapere);
    } else if (civ.government === 'dittatura' || civ.government === 'oligarchia') {
      heir = U.maxBy(pool, p => p.traits.ambition * 2 + p.wealth * 0.005 + p.skills.combattimento);
    } else {
      heir = U.maxBy(pool, p => p.reputation * 0.02 + p.traits.ambition + p.skills.oratoria);
    }
    if (!heir) return;
    world.makeLeader(civ, heir);
    heir.addMemory(year, 'successo', `Sono ${heir.sex === 'F' ? 'divenuta' : 'divenuto'} ${heir.title} di ${civ.name}`, 9);
    heir.feel('gioia', 0.6);
    world.chronicle.add(year, 'politica', `${heir.fullName} diventa ${heir.title} di ${civ.name}.`, 6, { civIds: [civ.id], personIds: [heir.id] });
  }

  function election(world, civ, capital) {
    const rng = world.rng, year = world.year;
    civ.lastElection = year;
    const pool = capital.people(world).filter(p => p.alive && p.age(year) >= 30 && p.age(year) < 72);
    if (pool.length < 2) return;
    const candidates = pool.sort((a, b) => (b.reputation + b.traits.ambition * 40) - (a.reputation + a.traits.ambition * 40)).slice(0, 3);
    const winner = U.maxBy(candidates, p => p.reputation * 0.4 + p.skills.oratoria * 40 + p.traits.empathy * 20 + rng.f(0, 25));
    const old = world.people.get(civ.leaderId);
    if (old && old.alive && old !== winner) {
      old.title = null;
      old.addMemory(year, 'fallimento', `Ho perso le elezioni contro ${winner.fullName}`, 6, [winner.id]);
      old.changeRel(winner.id, -25);
      old.feel('rabbia', 0.4);
    }
    if (old !== winner) {
      world.makeLeader(civ, winner);
      winner.addMemory(year, 'successo', `Il popolo mi ha eletto ${winner.title} di ${civ.name}`, 8);
      world.chronicle.add(year, 'politica', `${winner.fullName} vince le elezioni in ${civ.name}.`, 5, { civIds: [civ.id], personIds: [winner.id] });
    }
  }

  function coupOrRevolution(world, civ, capital) {
    const rng = world.rng, year = world.year;
    const leader = world.people.get(civ.leaderId);
    const pool = capital.people(world).filter(p => p.alive && p.age(year) >= 22 && p.id !== civ.leaderId);
    const plotter = U.maxBy(pool, p => p.traits.ambition * 2 + p.traits.courage - p.traits.honesty + (leader && p.relTo(leader.id) < -20 ? 1 : 0));
    if (!plotter) return;
    const isRevolution = capital.unrest > 0.5 && rng.chance(0.5);
    if (leader && leader.alive) {
      if (rng.chance(0.5)) {
        world.killPerson(leader, year, 'assassinio');
        plotter.killCount++;
        plotter.addMemory(year, 'crimine', `Ho fatto ${leader.sex === 'F' ? 'uccidere la' : 'uccidere il'} ${leader.title} ${leader.fullName} per prendere il potere`, 9, [leader.id]);
      } else {
        leader.title = null;
        leader.addMemory(year, 'trauma', `Sono stato ${leader.sex === 'F' ? 'deposta' : 'deposto'} con la forza da ${plotter.fullName}. Non dimenticherò`, 9, [plotter.id]);
        leader.changeRel(plotter.id, -90);
        PCS.emigratePerson(world, leader, capital);
      }
    }
    if (isRevolution) {
      const newGov = rng.pick(['repubblica', 'dittatura', 'oligarchia']);
      const oldGov = civ.govInfo().name;
      civ.government = newGov;
      world.makeLeader(civ, plotter);
      world.chronicle.add(year, 'politica', `Rivoluzione in ${civ.name}! La ${oldGov} cade: ${plotter.fullName} instaura la ${civ.govInfo().name}.`, 8, { civIds: [civ.id], personIds: [plotter.id], name: `Rivoluzione di ${capital.name}` });
      capital.unrest = Math.max(0, capital.unrest - 0.3);
      civ.stability = 0.5;
    } else {
      civ.government = rng.chance(0.6) ? 'dittatura' : civ.government;
      world.makeLeader(civ, plotter);
      world.chronicle.add(year, 'politica', `Colpo di stato in ${civ.name}: ${plotter.fullName} prende il potere.`, 7, { civIds: [civ.id], personIds: [plotter.id] });
      civ.stability = 0.4;
    }
    plotter.reputation += 30;
  }

  function maybeEvolveGovernment(world, civ) {
    const rng = world.rng, year = world.year;
    if (!rng.chance(0.02)) return;
    const cities = civ.cities(world);
    const pop = civ.totalPop(world);
    const era = PCS.civEra(civ);
    let target = null;
    if (civ.government === 'tribu' && pop > 1500) target = rng.pick(['monarchia', 'oligarchia', 'teocrazia']);
    else if (civ.government === 'monarchia' && cities.length >= 4 && civ.stability > 0.6) target = 'impero';
    else if ((civ.government === 'monarchia' || civ.government === 'impero') && civ.techs.includes('stampa') && rng.chance(0.4)) target = 'repubblica';
    else if (civ.government === 'repubblica' && cities.length >= 5 && civ.techs.includes('telegrafo')) target = 'federazione';
    else if (civ.government === 'oligarchia' && rng.chance(0.3)) target = rng.pick(['repubblica', 'monarchia']);
    else if (civ.government === 'teocrazia' && civ.techs.includes('metodo') && rng.chance(0.4)) target = 'repubblica';
    if (!target || target === civ.government) return;
    const oldName = civ.govInfo().name;
    civ.government = target;
    if (target === 'impero') civ.name = 'Impero ' + world.cultures[civ.cultureId].demonym.replace(/^./, c => c.toUpperCase());
    else if (target === 'repubblica') civ.name = 'Repubblica di ' + (world.cities[civ.capitalId] ? world.cities[civ.capitalId].name : civ.name);
    else if (target === 'federazione') civ.name = 'Federazione ' + world.cultures[civ.cultureId].demonym;
    else if (target === 'monarchia') civ.name = 'Regno ' + (rng.chance(0.5) ? 'di ' + (world.cities[civ.capitalId] ? world.cities[civ.capitalId].name : '') : world.cultures[civ.cultureId].demonym);
    else if (target === 'teocrazia') {
      const rel = world.religions.find(r => !r.dead);
      civ.name = 'Sacro Stato ' + world.cultures[civ.cultureId].demonym;
    }
    const leader = world.people.get(civ.leaderId);
    if (leader && leader.alive) {
      const gi = civ.govInfo();
      leader.title = gi.leaderTitle[leader.sex === 'F' ? 1 : 0];
    }
    world.chronicle.add(year, 'politica', `${oldName} non più: nasce ${civ.name} (${civ.govInfo().name}).`, 7, { civIds: [civ.id] });
  }

  function researchTick(world, civ, cities) {
    const rng = world.rng, year = world.year;
    const gi = civ.govInfo();
    let sci = 0;
    for (const c of cities) {
      sci += Math.log2(2 + c.pop / 220) * c.prosperity;
      if (c.buildings.includes('biblioteca')) sci += 0.6;
      if (c.buildings.includes('università')) sci += 1.2;
    }
    sci *= gi.science;
    if (civ.techs.includes('scrittura')) sci *= 1.3;
    if (civ.techs.includes('universita')) sci *= 1.3;
    if (civ.techs.includes('stampa')) sci *= 1.4;
    if (civ.techs.includes('metodo')) sci *= 1.5;
    if (civ.techs.includes('computer')) sci *= 1.6;
    // pick research by randomized affinity => varied path each game
    if (!civ.researching) {
      const avail = PCS.availableTechs(civ);
      if (avail.length) civ.researching = rng.weighted(avail, t => civ.techAffinity[t.id]).id;
    }
    if (civ.researching) {
      // diminishing returns on very large states, and later eras cost more time
      const eraIdx = PCS.ERAS.indexOf(PCS.civEra(civ));
      civ.research += (sci / (1 + cities.length * 0.08)) * 0.11 / (1 + eraIdx * 0.22);
      const t = PCS.TECH_BY_ID[civ.researching];
      if (civ.research >= t.cost) {
        civ.research = 0;
        civ.techs.push(t.id);
        civ.researching = null;
        // attribute discovery to a scholar if any
        const cap = world.cities[civ.capitalId];
        const scholar = cap ? U.maxBy(cap.people(world).filter(p => p.alive && p.educated), p => p.skills.sapere) : null;
        let txt = `${civ.name} scopre: ${t.name}.`;
        if (scholar && rng.chance(0.6)) {
          txt = `${scholar.fullName} di ${cap.name} perfeziona ${t.name} per ${civ.name}.`;
          scholar.reputation += 25;
          scholar.addMemory(year, 'successo', `Il mio lavoro su "${t.name}" mi ha reso ${scholar.sex === 'F' ? 'famosa' : 'famoso'}`, 8);
        }
        world.chronicle.add(year, 'scoperta', txt, t.cost > 100 ? 7 : 5, { civIds: [civ.id], personIds: scholar ? [scholar.id] : undefined });
        // era transitions get an epic entry
        const era = PCS.civEra(civ);
        if (!civ._eraLogged) civ._eraLogged = {};
        if (!civ._eraLogged[era] && era !== 'ancient') {
          civ._eraLogged[era] = true;
          world.chronicle.add(year, 'scoperta', `${civ.name} entra nell'${PCS.ERA_NAMES[era]}.`, 8, { civIds: [civ.id] });
        }
      }
    }
  }

  function foundColony(world, civ, capital) {
    const rng = world.rng, year = world.year;
    const map = world.map;
    // find a good unclaimed spot within range of any owned city
    let best = null, bq = -1;
    for (let t = 0; t < 240; t++) {
      const src = rng.pick(civ.cities(world));
      const ang = rng.f(0, Math.PI * 2), d = rng.f(8, 26);
      const x = Math.round(src.x + Math.cos(ang) * d), y = Math.round(src.y + Math.sin(ang) * d);
      if (!map.inb(x, y)) continue;
      const i = map.idx(x, y);
      if (map.owner[i] !== -1 || !map.isLand(i)) continue;
      const hab = PCS.BIOME_INFO[map.biome[i]].hab;
      if (hab < 0.4) continue;
      if (world.cities.some(c => !c.dead && U.dist(c.x, c.y, x, y) < 9)) continue;
      const q = hab + (map.river[i] ? 0.4 : 0) + rng.f(0, 0.2);
      if (q > bq) { bq = q; best = { x, y }; }
    }
    if (!best) return;
    civ.treasury -= 60;
    const city = world.foundCity(civ, best.x, best.y, false);
    // settlers move from most crowded city
    const src = U.maxBy(civ.cities(world).filter(c => c.id !== city.id), c => c.pop);
    const settlers = Math.min(Math.round(src.pop * 0.15), 400);
    src.pop -= settlers; city.pop = settlers;
    // move some simulated people
    const movers = src.people(world).filter(p => p.alive && p.age(year) >= 15 && p.age(year) < 50 && p.traits.courage > 0.45).slice(0, 6);
    for (const p of movers) {
      const arr = world.peopleByCity.get(src.id);
      if (arr) U.removeItem(arr, p);
      p.cityId = city.id;
      world.peopleByCity.get(city.id).push(p);
      p.addMemory(year, 'viaggio', `Sono tra i fondatori di ${city.name}! Una nuova vita ci attende`, 7);
      p.feel('gioia', 0.4); p.feel('paura', 0.2);
    }
    world.chronicle.add(year, 'politica', `${civ.name} fonda la città di ${city.name}.`, 6, { civIds: [civ.id] });
    // discovery flavor for far-away colonies
    if (U.dist(capital.x, capital.y, city.x, city.y) > 40) {
      world.chronicle.add(year, 'scoperta', `Coloni di ${civ.name} raggiungono terre lontane: vi fondano ${city.name}.`, 7, { civIds: [civ.id], name: `La spedizione verso ${city.name}` });
    }
  }

  function secession(world, civ) {
    const rng = world.rng, year = world.year;
    const cities = civ.cities(world);
    const capital = world.cities[civ.capitalId];
    const rebelCity = U.maxBy(cities.filter(c => c.id !== civ.capitalId), c => c.unrest + U.dist(c.x, c.y, capital.x, capital.y) * 0.01);
    if (!rebelCity) return;
    const culture = world.cultures[civ.cultureId];
    const rebel = new PCS.Civilization(world, civ.cultureId, null);
    rebel.name = rng.pick(['Libera ', 'Nuova ']) + rebelCity.name;
    rebel.government = rng.pick(['repubblica', 'oligarchia', 'monarchia', 'dittatura']);
    rebel.techs = civ.techs.slice();
    rebel.techAffinity = Object.assign({}, civ.techAffinity);
    world.civs.push(rebel);
    U.removeItem(civ.cityIds, rebelCity.id);
    rebel.cityIds.push(rebelCity.id);
    rebel.capitalId = rebelCity.id;
    rebelCity.civId = rebel.id;
    // reassign territory near rebel city
    world.claimTerritory(rebel, rebelCity.x, rebelCity.y, 6);
    const leaderPool = rebelCity.people(world).filter(p => p.alive && p.age(year) > 20);
    const rl = U.maxBy(leaderPool, p => p.traits.ambition + p.traits.courage);
    if (rl) {
      world.makeLeader(rebel, rl);
      rl.addMemory(year, 'successo', `Ho guidato ${rebelCity.name} all'indipendenza da ${civ.name}`, 9);
    }
    civ.setRel(rebel.id, -70); rebel.setRel(civ.id, -60);
    civ.addGrievance(rebel.id, year, 'secessione', 3);
    world.chronicle.add(year, 'politica', `${rebelCity.name} si ribella e proclama l'indipendenza: nasce ${rebel.name}!`, 8, { civIds: [civ.id, rebel.id], name: `Secessione di ${rebelCity.name}` });
    for (const p of rebelCity.people(world)) {
      p.addMemory(year, 'storia', `Ho visto ${rebelCity.name} proclamare l'indipendenza`, 6);
    }
  }

  function collapseCiv(world, civ, reason) {
    civ.dead = true;
    civ.deadYear = world.year;
    // free territory
    for (let i = 0; i < world.map.owner.length; i++) if (world.map.owner[i] === civ.id) world.map.owner[i] = -1;
    world.chronicle.add(world.year, 'politica', `La caduta di ${civ.name}: la civiltà ${reason}.`, 9, { civIds: [civ.id], name: `La Caduta di ${civ.name}` });
  }

  // ---------------- RELIGION DYNAMICS ----------------
  PCS.religionTick = function (world) {
    const rng = world.rng, year = world.year;
    // recompute followers among simulated people & aggregate
    for (const r of world.religions) r.followers = 0;
    for (const city of world.cities) {
      if (city.dead) continue;
      const folks = city.people(world);
      const counts = {};
      for (const p of folks) if (p.religionId !== null) counts[p.religionId] = (counts[p.religionId] || 0) + 1;
      let domId = null, domN = 0;
      for (const [id, n] of Object.entries(counts)) if (n > domN) { domN = n; domId = +id; }
      city.mainReligionId = domId;
      if (domId !== null && folks.length) {
        for (const [id, n] of Object.entries(counts)) {
          const r = world.religions[+id];
          if (r) r.followers += Math.round(city.pop * (n / folks.length));
        }
      }
    }
    // conversion pressure: people drift to city's dominant faith; missionaries spread along trade routes
    for (const city of world.cities) {
      if (city.dead || city.mainReligionId == null) continue;
      for (const p of city.people(world)) {
        if (p.religionId !== city.mainReligionId && rng.chance(0.05 * (1 - p.traits.piety))) {
          p.religionId = city.mainReligionId;
        }
      }
      for (const rid of city.tradeRoutes) {
        const other = world.cities[rid];
        if (other && !other.dead && other.mainReligionId == null && rng.chance(0.1)) {
          for (const p of other.people(world)) if (rng.chance(0.2)) p.religionId = city.mainReligionId;
        }
      }
    }
    // schisms: a charismatic pious dissenter founds a new sect
    if (rng.chance(0.02) && world.religions.filter(r => !r.dead).length < 14) {
      const bigs = world.religions.filter(r => !r.dead && r.followers > 2000);
      if (bigs.length) {
        const parent = rng.pick(bigs);
        const cities = world.cities.filter(c => !c.dead && c.mainReligionId === parent.id);
        if (cities.length) {
          const city = rng.pick(cities);
          const prophetPool = city.people(world).filter(p => p.alive && p.traits.piety > 0.65 && p.age(year) > 25);
          const prophet = U.maxBy(prophetPool, p => p.traits.piety + p.skills.oratoria + p.traits.ambition);
          if (prophet) {
            const culture = world.cultures[world.civs[city.civId].cultureId];
            const schism = new PCS.Religion(world.seed + ':schism' + year + ':' + prophet.id, culture, prophet, year, parent);
            schism.holyCityId = city.id;
            world.religions.push(schism);
            prophet.religionId = schism.id;
            prophet.title = prophet.sex === 'F' ? 'Profetessa' : 'Profeta';
            prophet.reputation += 45;
            prophet.addMemory(year, 'successo', `Ho avuto la visione: ho fondato la ${schism.name}`, 10);
            for (const p of city.people(world)) {
              if (p.religionId === parent.id && rng.chance(0.4 + p.relTo(prophet.id) * 0.004)) p.religionId = schism.id;
            }
            world.chronicle.add(year, 'religione', `Scisma! ${prophet.fullName} fonda la ${schism.name} a ${city.name}, staccandosi da ${parent.name}.`, 8, { personIds: [prophet.id], name: `Scisma di ${city.name}` });
          }
        }
      }
    }
    // religions die out
    for (const r of world.religions) {
      if (!r.dead && r.followers < 5 && year - r.foundedYear > 30) {
        r.dead = true;
        world.chronicle.add(year, 'religione', `La ${r.name} si spegne: l'ultimo fedele è scomparso.`, 6);
      }
    }
  };
})();
