/* Diplomacy and war.
   Wars arise from concrete causes (borders, religion, revenge, resources,
   politics, assassinations, rebellions) tracked as grievances. Battles create
   deaths, orphans, refugees, economic collapse, new borders, heroes and
   criminals. Diplomacy covers alliances, betrayals, treaties and tributes. */
(function () {
  'use strict';
  const PCS = (globalThis.PCS = globalThis.PCS || {});
  const { U } = PCS;

  // ---------------- DIPLOMACY (yearly) ----------------
  PCS.diplomacyTick = function (world) {
    const rng = world.rng, year = world.year;
    const civs = world.civs.filter(c => !c.dead);

    for (const civ of civs) {
      for (const other of civs) {
        if (other.id === civ.id) continue;
        const rel = civ.relTo(other.id);
        // natural drift toward mild neutrality
        civ.setRel(other.id, rel + (rel > 0 ? -0.5 : 0.7));
        // border friction
        if (bordersTouch(world, civ, other)) {
          civ.changeRel(other.id, -1.2);
          if (rng.chance(0.02)) civ.addGrievance(other.id, year, 'dispute di confine', 1);
        }
        // religious difference
        const rA = mainFaith(world, civ), rB = mainFaith(world, other);
        if (rA != null && rB != null && rA !== rB) {
          civ.changeRel(other.id, -0.6);
          if (rng.chance(0.008)) civ.addGrievance(other.id, year, 'ostilità religiosa', 1);
        } else if (rA != null && rA === rB) civ.changeRel(other.id, 0.5);
        // shared treaties help
        if (civ.hasTreaty(other.id, 'alleanza')) civ.changeRel(other.id, 1);
        if (civ.hasTreaty(other.id, 'commercio')) civ.changeRel(other.id, 0.5);
      }
    }

    // treaty proposals / betrayals / tributes / unions
    for (const civ of civs) {
      if (!rng.chance(0.3)) continue;
      const other = rng.pick(civs);
      if (!other || other.id === civ.id) continue;
      const rel = civ.relTo(other.id);
      const gi = civ.govInfo();
      if (rel > 45 && !civ.hasTreaty(other.id, 'alleanza') && rng.chance(0.3)) {
        makeTreaty(world, civ, other, 'alleanza');
      } else if (rel > 20 && !civ.hasTreaty(other.id, 'commercio') && rng.chance(0.4)) {
        makeTreaty(world, civ, other, 'commercio');
      } else if (rel < -30 && civ.hasTreaty(other.id, 'alleanza') && rng.chance(0.25)) {
        breakTreaty(world, civ, other, 'alleanza');
      }
      // weak neighbours pay tribute to strong warlike ones
      if (gi.warlike > 0.6 && armyPower(world, civ) > armyPower(world, other) * 2.5 && rel < 0 && !other.hasTreaty(civ.id, 'tributo') && rng.chance(0.15)) {
        other.treaties.push({ type: 'tributo', withId: civ.id, year });
        world.chronicle.add(year, 'politica', `${other.name} accetta di pagare tributo a ${civ.name} per evitare la guerra.`, 5, { civIds: [civ.id, other.id] });
      }
      // unions: allied same-culture states can merge
      if (civ.hasTreaty(other.id, 'alleanza') && civ.cultureId === other.cultureId && rel > 70 && rng.chance(0.04)) {
        mergeCivs(world, civ, other);
      }
    }

    // collect tributes
    for (const civ of civs) {
      for (const t of civ.treaties) {
        if (t.type === 'tributo' && !t.broken) {
          const to = world.civs[t.withId];
          if (to && !to.dead) {
            const amt = Math.min(civ.treasury * 0.08, 15);
            civ.treasury -= amt; to.treasury += amt;
            if (civ.treasury < 10 && rng.chance(0.2)) {
              t.broken = true;
              civ.addGrievance(to.id, year, 'tributo insostenibile', 2);
              to.addGrievance(civ.id, year, 'rifiuto del tributo', 2);
              world.chronicle.add(year, 'politica', `${civ.name} smette di pagare il tributo a ${to.name}. Tensione alle stelle.`, 5, { civIds: [civ.id, to.id] });
            }
          }
        }
      }
    }

    // ---- war declarations from grievances ----
    for (const civ of civs) {
      if (civ.warExhaustion > 0.4 || !rng.chance(0.25)) continue;
      const gi = civ.govInfo();
      for (const [oid, list] of Object.entries(civ.grievances)) {
        const other = world.civs[+oid];
        if (!other || other.dead || PCS.atWar(world, civ.id, other.id)) continue;
        const weight = U.sum(list, g => g.weight);
        const rel = civ.relTo(other.id);
        const powerRatio = armyPower(world, civ) / Math.max(1, armyPower(world, other));
        let warScore = weight * 0.08 + (-rel) * 0.004 + (powerRatio - 1) * 0.1 + (gi.warlike - 0.5) * 0.3;
        // leader personality matters
        const leader = world.people.get(civ.leaderId);
        if (leader) warScore += (leader.traits.courage + leader.traits.ambition - leader.traits.empathy - 0.5) * 0.15;
        if (warScore > 0.35 && rng.chance(U.clamp(warScore - 0.2, 0, 0.5))) {
          const cause = U.maxBy(list, g => g.weight).text;
          declareWar(world, civ, other, cause);
          break;
        }
      }
    }
  };

  function bordersTouch(world, a, b) {
    for (const ca of a.cities(world)) {
      for (const cb of b.cities(world)) {
        if (U.dist(ca.x, ca.y, cb.x, cb.y) < 16) return true;
      }
    }
    return false;
  }
  function mainFaith(world, civ) {
    const cap = world.cities[civ.capitalId];
    return cap ? (cap.mainReligionId != null ? cap.mainReligionId : null) : null;
  }
  function armyPower(world, civ) {
    let techBoost = 1;
    if (civ.techs.includes('bronzo')) techBoost += 0.3;
    if (civ.techs.includes('ferro')) techBoost += 0.4;
    if (civ.techs.includes('acciaio')) techBoost += 0.5;
    if (civ.techs.includes('polvere')) techBoost += 1;
    if (civ.techs.includes('motore')) techBoost += 1.5;
    return (civ.army.size + 10) * civ.army.quality * techBoost * (0.5 + civ.army.morale);
  }
  PCS.armyPower = armyPower;

  function makeTreaty(world, a, b, type) {
    a.treaties.push({ type, withId: b.id, year: world.year });
    b.treaties.push({ type, withId: a.id, year: world.year });
    a.changeRel(b.id, 15); b.changeRel(a.id, 15);
    const label = type === 'alleanza' ? 'un\'alleanza' : 'un trattato commerciale';
    world.chronicle.add(world.year, 'politica', `${a.name} e ${b.name} firmano ${label}.`, type === 'alleanza' ? 6 : 4, { civIds: [a.id, b.id] });
  }

  function breakTreaty(world, a, b, type) {
    for (const t of a.treaties) if (t.withId === b.id && t.type === type) t.broken = true;
    for (const t of b.treaties) if (t.withId === a.id && t.type === type) t.broken = true;
    a.changeRel(b.id, -20); b.changeRel(a.id, -35);
    b.addGrievance(a.id, world.year, 'tradimento dell\'alleanza', 3);
    world.chronicle.add(world.year, 'politica', `Tradimento! ${a.name} rompe l'alleanza con ${b.name}.`, 6, { civIds: [a.id, b.id] });
  }

  function mergeCivs(world, a, b) {
    // smaller merges into bigger
    const [big, small] = a.totalPop(world) >= b.totalPop(world) ? [a, b] : [b, a];
    for (const cid of small.cityIds.slice()) {
      const c = world.cities[cid];
      if (c && !c.dead) {
        c.civId = big.id;
        big.cityIds.push(cid);
        world.claimTerritory(big, c.x, c.y, 5);
      }
    }
    small.cityIds = [];
    small.dead = true;
    small.deadYear = world.year;
    big.name = 'Unione ' + world.cultures[big.cultureId].demonym;
    world.chronicle.add(world.year, 'politica', `${a.name} e ${b.name} si uniscono: nasce ${big.name}!`, 8, { civIds: [a.id, b.id], name: `L'Unione di ${world.cities[big.capitalId] ? world.cities[big.capitalId].name : big.name}` });
  }

  function declareWar(world, attacker, defender, cause) {
    const rng = world.rng, year = world.year;
    const name = PCS.warName(rng, attacker.name, defender.name, cause);
    const war = {
      id: world.warSeq++,
      name, attackerId: attacker.id, defenderId: defender.id,
      cause, startYear: year, endYear: null,
      battles: [], deaths: 0, heroIds: [],
    };
    world.wars.push(war);
    attacker.setRel(defender.id, -80);
    defender.setRel(attacker.id, -80);
    defender.addGrievance(attacker.id, year, 'invasione', 3);
    // allies may join
    for (const t of defender.treaties) {
      if (t.type === 'alleanza' && !t.broken) {
        const ally = world.civs[t.withId];
        if (ally && !ally.dead && ally.id !== attacker.id && rng.chance(0.6)) {
          ally.setRel(attacker.id, -60);
          war.defenderAllies = war.defenderAllies || [];
          war.defenderAllies.push(ally.id);
        }
      }
    }
    world.chronicle.add(year, 'guerra', `${attacker.name} dichiara guerra a ${defender.name} (causa: ${cause}). Inizia la ${name}.`, 8, { civIds: [attacker.id, defender.id], name });
    // populations react
    for (const civ of [attacker, defender]) {
      for (const c of civ.cities(world)) {
        for (const p of c.people(world)) {
          if (rng.chance(0.4)) p.feel('paura', 0.4);
          if (rng.chance(0.25)) p.addMemory(year, 'storia', `È scoppiata la ${name}`, 5);
        }
      }
    }
  }
  PCS.declareWar = declareWar;

  // ---------------- WAR RESOLUTION (seasonal) ----------------
  PCS.warTick = function (world, season) {
    const rng = world.rng, year = world.year;

    // maintain armies
    for (const civ of world.civs) {
      if (civ.dead) continue;
      const pop = civ.totalPop(world);
      const atWarNow = world.wars.some(w => !w.endYear && (w.attackerId === civ.id || w.defenderId === civ.id));
      const targetSize = Math.round(pop * (atWarNow ? 0.08 : 0.02) * civ.govInfo().warlike);
      civ.army.size = Math.round(U.lerp(civ.army.size, targetSize, 0.2));
      civ.army.quality = U.clamp(civ.army.quality + (civ.treasury > 50 ? 0.005 : -0.005), 0.2, 1);
      civ.army.morale = U.clamp(civ.army.morale + (atWarNow ? -0.01 : 0.02) - civ.warExhaustion * 0.01, 0.1, 1);
      civ.warExhaustion = Math.max(0, civ.warExhaustion - (atWarNow ? 0 : 0.01));
      if (atWarNow) civ.treasury -= civ.army.size * 0.001;
      // pick a general
      if (!civ.army.generalId || !(world.people.get(civ.army.generalId) || {}).alive) {
        const cap = world.cities[civ.capitalId];
        if (cap) {
          const g = U.maxBy(cap.people(world).filter(p => p.alive && p.age(year) > 20 && p.age(year) < 65), p => p.skills.combattimento + p.traits.courage);
          if (g) { civ.army.generalId = g.id; if (!g.title) g.title = 'Generale'; }
        }
      }
    }

    for (const war of world.wars) {
      if (war.endYear) continue;
      const A = world.civs[war.attackerId], D = world.civs[war.defenderId];
      if (!A || !D || A.dead || D.dead) { endWar(world, war, A && !A.dead ? A : D, false); continue; }
      if (season !== 1 && season !== 2 && rng.chance(0.6)) continue; // campaigns mostly in summer/autumn

      // battle!
      let pA = armyPower(world, A) * rng.f(0.7, 1.3);
      let pD = armyPower(world, D) * rng.f(0.8, 1.4); // defender advantage
      if (war.defenderAllies) for (const aid of war.defenderAllies) {
        const ally = world.civs[aid];
        if (ally && !ally.dead) pD += armyPower(world, ally) * 0.4;
      }
      const attackerWins = pA > pD;
      const winner = attackerWins ? A : D, loser = attackerWins ? D : A;
      const intensity = rng.f(0.15, 0.5);
      const lossW = Math.round(winner.army.size * intensity * 0.3);
      const lossL = Math.round(loser.army.size * intensity * 0.7);
      winner.army.size = Math.max(0, winner.army.size - lossW);
      loser.army.size = Math.max(0, loser.army.size - lossL);
      loser.army.morale = Math.max(0.1, loser.army.morale - 0.15);
      war.deaths += lossW + lossL;
      A.warExhaustion = Math.min(1, A.warExhaustion + 0.05);
      D.warExhaustion = Math.min(1, D.warExhaustion + 0.05);

      // battle site: a loser border city
      const targets = loser.cities(world);
      const site = targets.length ? U.minBy(targets, c => {
        const wc = winner.cities(world);
        return wc.length ? Math.min(...wc.map(o => U.dist(c.x, c.y, o.x, o.y))) : 0;
      }) : null;
      const battleName = `Battaglia di ${site ? site.name : 'campo aperto'}`;
      war.battles.push({ y: year, name: battleName, winnerId: winner.id, deaths: lossW + lossL });

      // heroes & criminals emerge
      const gw = world.people.get(winner.army.generalId);
      if (gw && gw.alive) {
        gw.reputation += 20;
        gw.veteran = true;
        gw.addMemory(year, 'guerra', `Ho guidato ${winner.name} alla vittoria nella ${battleName}`, 8);
        if (rng.chance(0.3) && !war.heroIds.includes(gw.id)) {
          war.heroIds.push(gw.id);
          world.chronicle.add(year, 'guerra', `${gw.fullName} diventa un eroe di guerra dopo la ${battleName}.`, 5, { personIds: [gw.id] });
        }
        if (rng.chance(0.15) && gw.traits.empathy < 0.3) {
          gw.addMemory(year, 'crimine', `Dopo la ${battleName} ordinai il massacro dei prigionieri. Nessuno deve saperlo`, 9);
          gw.killCount += 10;
        }
      }
      const gl = world.people.get(loser.army.generalId);
      if (gl && gl.alive) {
        gl.veteran = true;
        if (rng.chance(0.25)) { world.killPerson(gl, year, 'guerra'); }
        else gl.addMemory(year, 'guerra', `La sconfitta nella ${battleName} mi perseguita`, 7);
      }

      // civilian consequences on the battle site
      if (site) {
        const civDeaths = Math.round(site.pop * intensity * 0.06);
        site.pop = Math.max(10, site.pop - civDeaths);
        site.wealth *= 0.85;
        site.unrest = Math.min(1, site.unrest + 0.1);
        war.deaths += civDeaths;
        const fleeing = Math.round(site.pop * 0.05);
        site.pop -= fleeing;
        // refugees to nearest safe city
        const safe = world.cities.filter(c => !c.dead && c.civId !== winner.id && c.id !== site.id);
        if (safe.length) U.minBy(safe, c => U.dist(c.x, c.y, site.x, site.y)).refugees += fleeing;
        // simulated soldiers/civilians die; orphans happen inside killPerson
        for (const p of site.people(world)) {
          if (!p.alive) continue;
          const isSoldier = /soldat|guerrier|ufficial/.test(p.profession);
          if (rng.chance(isSoldier ? 0.3 : 0.05)) {
            world.killPerson(p, year, 'guerra');
          } else if (rng.chance(0.4)) {
            p.feel('paura', 0.6);
            p.addMemory(year, 'guerra', `Ho visto la ${battleName} con i miei occhi. Il sangue non si dimentica`, 7);
            if (attackerWins) p.addMemory(year, 'torto', `${winner.name} ha portato morte nella mia città`, 6);
          }
        }
        world.chronicle.add(year, 'guerra', `${battleName}: ${winner.name} sconfigge ${loser.name} (${U.fmt(lossW + lossL + civDeaths)} morti).`, 6, { civIds: [winner.id, loser.id] });

        // conquest chance
        if (attackerWins && rng.chance(0.35 - site.walls * 0.08)) {
          captureCity(world, war, A, D, site);
        }
      }

      // war end conditions
      const exhausted = A.warExhaustion > 0.7 || D.warExhaustion > 0.7;
      const collapse = loser.cities(world).length === 0;
      if (collapse || (exhausted && rng.chance(0.5)) || (year - war.startYear > 20 && rng.chance(0.3))) {
        endWar(world, war, winner, collapse);
      }
    }
  };

  function captureCity(world, war, attacker, defender, city) {
    const rng = world.rng, year = world.year;
    U.removeItem(defender.cityIds, city.id);
    attacker.cityIds.push(city.id);
    city.civId = attacker.id;
    world.claimTerritory(attacker, city.x, city.y, 6);
    city.unrest = Math.min(1, city.unrest + 0.3);
    if (defender.capitalId === city.id) {
      const remaining = defender.cities(world);
      defender.capitalId = remaining.length ? remaining[0].id : null;
    }
    world.chronicle.add(year, 'guerra', `${city.name} cade! La città passa sotto il controllo di ${attacker.name}.`, 7, { civIds: [attacker.id, defender.id] });
    for (const p of city.people(world)) {
      p.addMemory(year, 'storia', `${city.name} è stata conquistata da ${attacker.name}: siamo sotto un nuovo padrone`, 7);
      p.addMemory(year, 'torto', `${attacker.name} ci ha conquistati con la forza`, 5);
      p.feel('paura', 0.5); p.feel('rabbia', 0.4);
    }
  }

  function endWar(world, war, winner, conquest) {
    const rng = world.rng, year = world.year;
    war.endYear = year;
    const A = world.civs[war.attackerId], D = world.civs[war.defenderId];
    war.winnerId = winner ? winner.id : null;
    if (A && D && !A.dead && !D.dead) {
      const loser = winner === A ? D : A;
      // peace treaty; loser may pay tribute
      A.treaties.push({ type: 'pace', withId: D.id, year });
      D.treaties.push({ type: 'pace', withId: A.id, year });
      if (rng.chance(0.4)) {
        loser.treaties.push({ type: 'tributo', withId: winner.id, year });
      }
      const reparations = Math.min(loser.treasury * 0.3, 60);
      loser.treasury -= reparations; winner.treasury += reparations;
      A.setRel(D.id, -30); D.setRel(A.id, -30);
      loser.addGrievance(winner.id, year, `umiliazione nella ${war.name}`, 2);
      world.chronicle.add(year, 'guerra', `Finisce la ${war.name}: ${winner.name} prevale su ${loser.name} dopo ${year - war.startYear} anni e ${U.fmt(war.deaths)} morti.`, 8, { civIds: [A.id, D.id], name: war.name });
      // veterans remember
      for (const civ of [A, D]) {
        for (const c of civ.cities(world)) {
          for (const p of c.people(world)) {
            if (p.veteran && rng.chance(0.5)) p.addMemory(year, 'storia', `La ${war.name} è finita. ${civ === winner ? 'Abbiamo vinto, ma a caro prezzo' : 'Abbiamo perso: che vergogna e che dolore'}`, 6);
          }
        }
      }
    } else {
      world.chronicle.add(year, 'guerra', `La ${war.name} si conclude nel caos.`, 6, { name: war.name });
    }
  }
})();
