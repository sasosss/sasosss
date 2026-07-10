/* Yearly life-cycle of every simulated individual: growth, education, work,
   love, quarrels, children, sickness, aging and death — plus aggregate city
   population dynamics. Decisions are driven by needs, emotions, memories,
   relationships and goals, never by pure chance alone. */
(function () {
  'use strict';
  const PCS = (globalThis.PCS = globalThis.PCS || {});
  const { U } = PCS;

  const DISEASES = ['febbre di palude', 'mal di petto', 'febbre rossa', 'consunzione', 'mal d\'ossa', 'colera'];

  PCS.demographyTick = function (world) {
    const rng = world.rng;
    const year = world.year;
    const living = world.livingPeople();
    // birth throttle keeps the fully-simulated population near the cap
    const ratio = PCS.LIVING_CAP / Math.max(1, world.livingCount);
    const capPressure = ratio < 1 ? U.clamp(Math.pow(ratio, 6), 0.005, 1) : 1;

    for (const p of living) {
      if (!p.alive) continue;
      const age = p.age(year);
      const city = world.cities[p.cityId];
      if (!city || city.dead) { relocate(world, p); continue; }
      const civ = world.civs[city.civId];

      // --- emotions decay ---
      for (const k of Object.keys(p.emotions)) p.emotions[k] = Math.max(0, p.emotions[k] - 0.12);
      if (city.prosperity > 0.65) p.feel('gioia', 0.06);
      if (city.famine) p.feel('paura', 0.25);

      // --- health & sickness ---
      let sickChance = 0.02 + (age > 55 ? (age - 55) * 0.004 : 0) + (city.famine ? 0.05 : 0) + (1 - city.prosperity) * 0.02;
      if (city.plague) sickChance += city.plague.deadliness * 0.35;
      if (civ.techs.includes('medicina')) sickChance *= 0.75;
      if (civ.techs.includes('vaccini')) sickChance *= 0.55;
      if (civ.techs.includes('antibiotici')) sickChance *= 0.35;
      if (p.sick) {
        const deadly = p.sick.sev * (age > 60 ? 1.6 : age < 8 ? 1.4 : 1) * (civ.techs.includes('antibiotici') ? 0.3 : civ.techs.includes('medicina') ? 0.7 : 1);
        if (rng.chance(deadly)) { world.killPerson(p, year, p.sick.name); continue; }
        if (rng.chance(0.55)) {
          p.addMemory(year, 'malattia', `Sono sopravvissuto/a alla ${p.sick.name}`.replace('/a', p.sex === 'F' ? 'a' : 'o'), 5);
          p.sick = null;
          p.health = Math.max(0.3, p.health - 0.05);
        }
      } else if (rng.chance(sickChance)) {
        p.sick = {
          name: city.plague && rng.chance(0.7) ? city.plague.name : rng.pick(DISEASES),
          sev: rng.f(0.08, city.plague ? 0.5 : 0.3),
        };
        p.feel('paura', 0.4);
      }

      // --- natural death ---
      const lifeExp = 55 + (civ.techs.includes('medicina') ? 6 : 0) + (civ.techs.includes('vaccini') ? 8 : 0) + (civ.techs.includes('antibiotici') ? 12 : 0);
      if (age > lifeExp - 15) {
        const q = (age - (lifeExp - 15)) / 30;
        if (rng.chance(q * q * 0.5)) { world.killPerson(p, year, 'vecchiaia'); continue; }
      }
      if (age < 5 && rng.chance(civ.techs.includes('vaccini') ? 0.004 : 0.02)) {
        world.killPerson(p, year, 'malattia infantile'); continue;
      }

      // --- life stages ---
      if (age === 7 && civ.techs.includes('scrittura') && (p.traits.intelligence > 0.45 || p.wealth > 40 || rng.chance(0.2))) {
        p.educated = true;
        p.addMemory(year, 'studio', `Ho imparato a leggere ${civ.techs.includes('universita') ? 'alla scuola' : 'dal sacerdote'} di ${city.name}`, 4);
        p.skills.sapere = Math.max(p.skills.sapere, rng.f(0.2, 0.4));
      }
      if (age === 14) {
        world.assignProfession(p);
        p.pickGoals(world);
        p.addMemory(year, 'lavoro', `Ho iniziato a lavorare come ${p.profession}`, 4);
        // inherit trade & bond with same-profession parent
        const f = world.people.get(p.fatherId);
        if (f && f.alive && rng.chance(0.4)) { p.profession = f.profession; p.addMemory(year, 'lavoro', `Seguo il mestiere di mio padre: ${f.profession}`, 4, [f.id]); }
      }
      if (age === 18 && civ.techs.includes('universita') && p.educated && p.traits.intelligence > 0.6 && rng.chance(0.5)) {
        p.skills.sapere = Math.min(1, p.skills.sapere + 0.3);
        p.addMemory(year, 'studio', `Ho studiato all'università di ${world.cities[civ.capitalId] ? world.cities[civ.capitalId].name : city.name}`, 5);
      }

      // --- work & wealth ---
      if (age >= 14 && age < 70) {
        p.skills.lavoro = Math.min(1, p.skills.lavoro + 0.015);
        let income = (1 + p.skills.lavoro * 2 + p.skills.commercio * 3) * city.prosperity;
        if (/mercant|banchier|commerc/.test(p.profession)) income *= 1.8;
        if (city.famine) income *= 0.4;
        p.wealth = Math.max(0, p.wealth + income - 1.2 - (p.childrenIds.length * 0.15));
        if (p.goals.some(g => g.key === 'wealth' && !g.done) && p.wealth > 220) {
          markGoal(p, 'wealth', year, `Sono diventato/a ricco/a: il mio obiettivo è compiuto`);
        }
      }

      // --- social: friendships, quarrels, rivalries ---
      const neighbors = city.people(world);
      if (neighbors.length > 3 && rng.chance(0.45)) {
        const o = rng.pick(neighbors);
        if (o !== p && o.alive) {
          const cur = p.relTo(o.id);
          // affinity: shared values & similar empathy bring people together
          let aff = 0.2 + (o.values.some(v => p.values.includes(v)) ? 0.3 : 0) - Math.abs(p.traits.empathy - o.traits.empathy) * 0.3;
          if (p.religionId !== o.religionId) aff -= 0.25;
          if (cur < -20) aff -= 0.3; // grudges persist
          if (rng.chance(U.clamp(0.4 + aff, 0.05, 0.9))) {
            p.changeRel(o.id, rng.i(2, 8));
            o.changeRel(p.id, rng.i(1, 7));
            if (p.relTo(o.id) > 55 && !p.memories.some(m => m.t === 'amicizia' && m.subj && m.subj[0] === o.id)) {
              p.addMemory(year, 'amicizia', `${o.fullName} è tra i miei più cari amici`, 4, [o.id]);
            }
          } else {
            // quarrel: low honesty or anger makes it worse
            const heat = 3 + Math.round(p.emotions.rabbia * 8 + (1 - p.traits.empathy) * 5);
            p.changeRel(o.id, -heat); o.changeRel(p.id, -heat);
            p.feel('rabbia', 0.15);
            if (p.relTo(o.id) < -50 && rng.chance(0.5)) {
              p.addMemory(year, 'rivalita', `Io e ${o.fullName} siamo ormai nemici giurati`, 5, [o.id]);
              o.addMemory(year, 'rivalita', `Non sopporto ${p.fullName}`, 4, [p.id]);
            }
          }
        }
      }

      // --- love & marriage (needs-driven: age, availability, affection) ---
      if (!p.spouseId && age >= 17 && age <= 55 && rng.chance(0.3)) {
        const candidates = neighbors.filter(o =>
          o.alive && !o.spouseId && o.sex !== p.sex &&
          Math.abs(o.age(year) - age) < 15 && o.age(year) >= 16 &&
          o.fatherId !== p.fatherId && o.id !== p.fatherId && o.id !== p.motherId &&
          !p.childrenIds.includes(o.id)
        );
        if (candidates.length) {
          const pick = U.maxBy(candidates, o => p.relTo(o.id) + (o.values.some(v => p.values.includes(v)) ? 20 : 0) + (p.religionId === o.religionId ? 15 : -10) + o.traits.empathy * 10);
          const score = p.relTo(pick.id) + (p.religionId === pick.religionId ? 15 : -15);
          if (score > 10 || rng.chance(0.25)) {
            world.marry(p, pick, year);
            if (rng.chance(0.3)) world.chronicle.add(year, 'persona', `${p.fullName} e ${pick.fullName} si sposano a ${city.name}.`, 1, { personIds: [p.id, pick.id] });
          } else {
            p.changeRel(pick.id, rng.i(3, 12)); // courtship
          }
        }
      }
      // adultery / divorce driven by unhappiness and honesty
      if (p.spouseId && rng.chance(0.02)) {
        const sp = world.people.get(p.spouseId);
        if (sp && p.relTo(sp.id) < 0 && p.traits.honesty < 0.4) {
          p.spouseId = null; sp.spouseId = null;
          sp.changeRel(p.id, -50); p.changeRel(sp.id, -25);
          sp.addMemory(year, 'tradimento', `${p.fullName} mi ha ${p.sex === 'M' ? 'abbandonata' : 'abbandonato'}: non lo perdonerò`, 8, [p.id]);
          p.addMemory(year, 'tradimento', `Ho lasciato ${sp.fullName}. A volte me ne pento`, 6, [sp.id]);
          sp.feel('dolore', 0.6); sp.feel('rabbia', 0.5);
        }
      }

      // --- children ---
      if (p.sex === 'F' && p.spouseId && age >= 17 && age <= 44) {
        const husband = world.people.get(p.spouseId);
        if (husband && husband.alive) {
          let chance = 0.32 * capPressure;
          if (city.famine) chance *= 0.35;
          if (p.childrenIds.filter(c => { const k = world.people.get(c); return k && k.alive; }).length >= 6) chance *= 0.3;
          if (rng.chance(chance)) {
            const child = world.spawnPerson({
              birthYear: year, father: husband, mother: p,
              cityId: p.cityId, cultureId: p.cultureId, religionId: p.religionId,
              surname: husband.surname, wealth: 0,
            });
            p.childrenIds.push(child.id); husband.childrenIds.push(child.id);
            p.addMemory(year, 'nascita', `È ${child.sex === 'F' ? 'nata mia figlia' : 'nato mio figlio'} ${child.name}`, 7, [child.id]);
            husband.addMemory(year, 'nascita', `È ${child.sex === 'F' ? 'nata mia figlia' : 'nato mio figlio'} ${child.name}`, 7, [child.id]);
            p.feel('gioia', 0.6); husband.feel('gioia', 0.5);
            city.pop += 1;
            if (p.goals.some(g => g.key === 'family' && !g.done) && p.childrenIds.length >= 4) {
              markGoal(p, 'family', year, 'La mia famiglia è grande e forte: il mio sogno si è avverato');
            }
          }
        }
      }

      // --- goal progress & memory-driven behavior ---
      if (rng.chance(0.1)) pursueGoals(world, p, city, civ);

      // --- migration decision (needs: safety, food, opportunity) ---
      const push = (city.famine ? 0.35 : 0) + city.unrest * 0.2 + (city.plague ? 0.3 : 0) + (p.emotions.paura * 0.15);
      if (age >= 15 && age < 60 && rng.chance(push * 0.35)) {
        emigrate(world, p, city);
      }
    }

    // --- aggregate city population ---
    for (const city of world.cities) {
      if (city.dead) continue;
      const civ = world.civs[city.civId];
      const fert = city.fertilityAround(world);
      const foodOk = city.food > 0 && !city.famine;
      let growth = 0.011 * civ.govInfo().growth * (0.5 + fert) * (foodOk ? 1 : -1.5);
      if (civ.techs.includes('agricoltura')) growth += 0.006;
      if (civ.techs.includes('medicina')) growth += 0.004;
      if (civ.techs.includes('vaccini')) growth += 0.006;
      if (city.plague) growth -= city.plague.deadliness * 0.1;
      const atWar = world.wars.some(w => !w.endYear && (w.attackerId === civ.id || w.defenderId === civ.id));
      if (atWar) growth -= 0.008;
      // logistic limit: growth stalls as the city approaches its carrying capacity
      if (growth > 0) growth *= Math.max(0, 1 - city.pop / PCS.cityCapacity(world, city, civ, fert));
      city.pop = Math.max(city.people(world).length, Math.round(city.pop * (1 + growth + rng.f(-0.004, 0.004))));
      if (city.refugees > 0) {
        const absorb = Math.min(city.refugees, Math.ceil(city.pop * 0.02));
        city.pop += absorb; city.refugees -= absorb;
      }
      // keep the simulated sample representative: seed extra sim-people in booming, underrepresented cities
      const simCount = city.people(world).length;
      if (world.livingCount < PCS.LIVING_CAP * 0.9 && simCount < 8 && city.pop > 100 && rng.chance(0.4)) {
        seedImmigrant(world, city);
      }
    }
    world.recount();
  };

  function markGoal(p, key, year, text) {
    const g = p.goals.find(g => g.key === key);
    if (g && !g.done) {
      g.done = true;
      p.addMemory(year, 'successo', text.replace(/\/a/g, p.sex === 'F' ? 'a' : 'o'), 7);
      p.feel('gioia', 0.7);
    }
  }

  function pursueGoals(world, p, city, civ) {
    const rng = world.rng, year = world.year;
    for (const g of p.goals) {
      if (g.done) continue;
      switch (g.key) {
        case 'travel':
          if (rng.chance(0.3 + p.traits.courage * 0.3)) {
            p.travelled = true;
            const others = world.cities.filter(c => !c.dead && c.id !== city.id);
            const dest = others.length ? rng.pick(others) : null;
            markGoal(p, 'travel', year, dest ? `Ho viaggiato fino a ${dest.name} e ho visto il mondo` : 'Ho viaggiato fino al mare');
            if (dest) p.addMemory(year, 'viaggio', `Il viaggio verso ${dest.name} mi ha cambiato: che mondo immenso`, 6);
          }
          break;
        case 'master':
          if (p.skills.lavoro > 0.85) markGoal(p, 'master', year, `Ormai tutti a ${city.name} riconoscono la mia maestria come ${p.profession}`);
          break;
        case 'fame':
          if (p.reputation > 70) markGoal(p, 'fame', year, 'Il mio nome è ormai noto: sarò ricordato');
          else if (rng.chance(p.traits.ambition * 0.2)) p.reputation += rng.i(2, 8);
          break;
        case 'knowledge':
          if (p.educated && p.skills.sapere > 0.6) markGoal(p, 'knowledge', year, 'Ho letto ogni libro che ho potuto trovare');
          break;
        case 'revenge': {
          // find target of grudge memories
          const grudge = p.memoriesOfType('torto').concat(p.memoriesOfType('rivalita'))[0];
          if (grudge && grudge.subj && rng.chance(p.traits.courage * 0.15)) {
            const target = world.people.get(grudge.subj[0]);
            if (target && target.alive && target.id !== p.id) {
              // confrontation: may become violent
              if (rng.chance(0.25) && p.skills.combattimento > 0.3) {
                world.killPerson(target, year, 'assassinio');
                p.killCount++;
                p.addMemory(year, 'crimine', `Ho ucciso ${target.fullName} per vendetta. ${p.traits.empathy > 0.5 ? 'Il rimorso mi divora' : 'Giustizia è fatta'}`, 9, [target.id]);
                markGoal(p, 'revenge', year, 'Mi sono vendicato');
                city.unrest = Math.min(1, city.unrest + 0.05);
                if (rng.chance(0.6)) world.chronicle.add(year, 'persona', `${p.fullName} uccide ${target.fullName} a ${city.name} per un'antica faida.`, 4, { personIds: [p.id, target.id] });
              } else {
                target.changeRel(p.id, -30); p.changeRel(target.id, -20);
                p.feel('rabbia', 0.3);
              }
            } else {
              markGoal(p, 'revenge', year, 'Il destino ha già punito chi mi fece torto');
            }
          }
          break;
        }
        case 'power':
          if (p.title) markGoal(p, 'power', year, 'Ho raggiunto il potere che cercavo');
          else if (rng.chance(p.traits.ambition * 0.1)) p.reputation += rng.i(3, 9);
          break;
        case 'peace':
          if (p.age(year) > 60) markGoal(p, 'peace', year, 'Sono invecchiato in pace, come speravo');
          break;
        case 'faith':
          if (p.traits.piety > 0.6 && rng.chance(0.2)) markGoal(p, 'faith', year, 'Ho servito gli dèi con devozione tutta la vita');
          break;
      }
    }
    // heroic rescue opportunities create positive memories
    if (rng.chance(0.015 + p.traits.empathy * 0.015)) {
      const folks = city.people(world).filter(o => o !== p && o.alive);
      if (folks.length) {
        const saved = rng.pick(folks);
        p.savedCount++;
        const what = rng.pick(['dalle acque del fiume', 'da un incendio', 'da un crollo', 'dai lupi', 'da un\'aggressione']);
        p.addMemory(year, 'eroismo', `Ho salvato ${saved.age(year) < 14 ? (saved.sex === 'F' ? 'una bambina' : 'un bambino') : saved.fullName} ${what}`, 6, [saved.id]);
        saved.addMemory(year, 'gratitudine', `${p.fullName} mi ha salvato la vita ${what}`, 8, [p.id]);
        saved.changeRel(p.id, 60);
        p.reputation += 5;
      }
    }
  }

  function emigrate(world, p, from) {
    const dests = world.cities.filter(c => !c.dead && c.id !== from.id && !c.famine && c.unrest < 0.5);
    if (!dests.length) return;
    // prefer same civ, prosperous, close
    const dest = U.maxBy(dests, c =>
      (c.civId === from.civId ? 25 : 0) + c.prosperity * 30 - U.dist(c.x, c.y, from.x, from.y) * 0.4);
    const oldArr = world.peopleByCity.get(from.id);
    if (oldArr) U.removeItem(oldArr, p);
    p.cityId = dest.id;
    (world.peopleByCity.get(dest.id) || []).push(p);
    from.pop = Math.max(0, from.pop - 1);
    dest.pop += 1;
    p.travelled = true;
    p.addMemory(world.year, 'viaggio', `Ho lasciato ${from.name} per rifarmi una vita a ${dest.name}`, 6);
    // family may follow
    const spouse = world.people.get(p.spouseId);
    if (spouse && spouse.alive && spouse.cityId === from.id) {
      const arr2 = world.peopleByCity.get(from.id);
      if (arr2) U.removeItem(arr2, spouse);
      spouse.cityId = dest.id;
      (world.peopleByCity.get(dest.id) || []).push(spouse);
      spouse.addMemory(world.year, 'viaggio', `Abbiamo lasciato ${from.name} per ${dest.name}`, 5);
    }
    for (const cid of p.childrenIds) {
      const c = world.people.get(cid);
      if (c && c.alive && c.age(world.year) < 15 && c.cityId === from.id) {
        const arr3 = world.peopleByCity.get(from.id);
        if (arr3) U.removeItem(arr3, c);
        c.cityId = dest.id;
        (world.peopleByCity.get(dest.id) || []).push(c);
      }
    }
  }

  function relocate(world, p) {
    const dests = world.cities.filter(c => !c.dead);
    if (!dests.length) { world.killPerson(p, world.year, 'dispersione'); return; }
    const dest = U.minBy(dests, c => U.dist(c.x, c.y, world.cities[p.cityId] ? world.cities[p.cityId].x : 0, world.cities[p.cityId] ? world.cities[p.cityId].y : 0));
    p.cityId = dest.id;
    (world.peopleByCity.get(dest.id) || []).push(p);
    p.addMemory(world.year, 'trauma', `La mia città non esiste più: sono ${p.sex === 'F' ? 'una profuga' : 'un profugo'} a ${dest.name}`, 8);
  }

  function seedImmigrant(world, city) {
    const rng = world.rng;
    const civ = world.civs[city.civId];
    const culture = world.cultures[civ.cultureId];
    const rel = world.religions.find(r => !r.dead && r.holyCityId !== null && world.cities[r.holyCityId] && world.cities[r.holyCityId].civId === civ.id);
    const p = world.spawnPerson({
      birthYear: world.year - rng.i(16, 40),
      cityId: city.id, cultureId: culture.id,
      religionId: rel ? rel.id : (world.religions.length ? rng.pick(world.religions.filter(r => !r.dead)).id : null),
    });
    world.assignProfession(p);
    p.pickGoals(world);
    p.addMemory(world.year, 'viaggio', `Sono arrivato/a a ${city.name} in cerca di fortuna`.replace('/a', p.sex === 'F' ? 'a' : 'o'), 5);
    world.giveChildhoodMemories(p);
  }

  PCS.emigratePerson = emigrate;
})();
