/* World engine: owns the map, cultures, civilizations, cities, people,
   religions, wars, animals and the chronicle. Advances time in seasons
   (4 per year); individuals update once per year. Fully serializable. */
(function () {
  'use strict';
  const PCS = (globalThis.PCS = globalThis.PCS || {});
  const { U } = PCS;

  const SEASONS = ['Primavera', 'Estate', 'Autunno', 'Inverno'];
  const LIVING_CAP = 2000;   // fully-simulated individuals across the world

  class World {
    constructor(seed, opts) {
      opts = opts || {};
      this.seed = seed;
      this.rng = new PCS.RNG(seed);
      this.year = 1;
      this.season = 0;
      this.worldName = null;
      this.map = null;
      this.cultures = [];
      this.religions = [];
      this.civs = [];
      this.cities = [];
      this.people = new Map();     // id -> Person (living AND dead kept, dead trimmed)
      this.peopleByCity = new Map();
      this.wars = [];              // {id,name,attackerId,defenderId,cause,startYear,endYear,battles,deaths}
      this.warSeq = 0;
      this.animals = [];           // wildlife populations per region
      this.chronicle = new PCS.Chronicle();
      this.player = {
        name: 'Viandante', fame: 0, knownBy: 0,
        deeds: [], // {y, text, kind} things the player did via chat
        foundedReligionId: null,
      };
      this.stats = [];             // sampled every N years for charts {y, pop, civs, wars, techMax}
      this.livingCount = 0;
      PCS.world = this;
      if (!opts.skipGenesis) this.genesis(opts);
    }

    // ---------------- GENESIS ----------------
    genesis(opts) {
      const rng = this.rng;
      const W = opts.mapW || 300, H = opts.mapH || 190;
      this.map = PCS.generateWorld(this.seed, W, H);
      const nameLang = new PCS.Language(this.seed + ':world');
      this.worldName = U.cap(nameLang.word(new PCS.RNG(this.seed + ':wn'), 2)) + (rng.chance(0.5) ? 'ia' : 'ea');

      // cultures + civs
      const nCivs = rng.i(6, 9);
      const spots = this.findCitySpots(nCivs * 2 + 6);
      for (let c = 0; c < nCivs && spots.length; c++) {
        const culture = new PCS.Culture(this.seed + ':cul' + c, this.worldName);
        this.cultures.push(culture);
        const civ = new PCS.Civilization(this, culture.id, null);
        civ.name = rng.pick(['Popolo ', 'Clan ', 'Tribù ']) + culture.demonym;
        this.civs.push(civ);
        // pick a spot far from existing capitals
        let best = null, bd = -1;
        for (const s of spots) {
          let d = Infinity;
          for (const other of this.civs) {
            if (other.capitalId === null || other === civ) continue;
            const cap = this.cities[other.capitalId];
            d = Math.min(d, U.dist(s.x, s.y, cap.x, cap.y));
          }
          const score = (d === Infinity ? 1000 : d) + s.q * 8;
          if (score > bd) { bd = score; best = s; }
        }
        U.removeItem(spots, best);
        const city = this.foundCity(civ, best.x, best.y, true);
        // founding religion
        const rel = new PCS.Religion(this.seed + ':rel' + c, culture, null, this.year, null);
        rel.holyCityId = city.id;
        this.religions.push(rel);
        culture.mythology = rel.mythos;
        // seed population with two generations
        this.seedPopulation(city, rel, rng.i(42, 64));
        // leader
        const adults = city.people(this).filter(p => p.alive && p.age(this.year) >= 25);
        const leader = U.maxBy(adults, p => p.traits.ambition + p.traits.courage);
        if (leader) this.makeLeader(civ, leader);
        this.chronicle.add(this.year, 'politica', `${civ.name} si stabilisce e fonda ${city.name}.`, 7, { civIds: [civ.id] });
      }
      // wildlife: one population per macro-region
      this.seedAnimals();
      this.chronicle.add(this.year, 'cultura', `Inizia la storia scritta del mondo di ${this.worldName}.`, 9);
      this.recount();
      this.sampleStats();
    }

    findCitySpots(n) {
      const rng = this.rng, map = this.map, out = [];
      let tries = 0;
      while (out.length < n && tries++ < 6000) {
        const x = rng.i(6, map.w - 7), y = rng.i(6, map.h - 7);
        const i = map.idx(x, y);
        const b = map.biome[i];
        const hab = PCS.BIOME_INFO[b].hab;
        if (hab < 0.5) continue;
        let q = hab + (map.river[i] ? 0.5 : 0);
        // near coast bonus
        for (let d = 1; d <= 2; d++) {
          if (map.inb(x + d, y) && map.isWater(map.idx(x + d, y))) { q += 0.3; break; }
          if (map.inb(x - d, y) && map.isWater(map.idx(x - d, y))) { q += 0.3; break; }
        }
        if (out.some(s => U.dist(s.x, s.y, x, y) < 14)) continue;
        out.push({ x, y, q });
      }
      return out.sort((a, b) => b.q - a.q);
    }

    foundCity(civ, x, y, isCapital) {
      const culture = this.cultures[civ.cultureId];
      const city = new PCS.City(this, civ, x, y, culture.language.cityName(this.rng));
      this.cities.push(city);
      civ.cityIds.push(city.id);
      if (isCapital || civ.capitalId === null) civ.capitalId = city.id;
      this.peopleByCity.set(city.id, []);
      // claim territory
      this.claimTerritory(civ, x, y, 5);
      return city;
    }

    claimTerritory(civ, cx, cy, r) {
      const map = this.map;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, y = cy + dy;
        if (!map.inb(x, y) || dx * dx + dy * dy > r * r) continue;
        const i = map.idx(x, y);
        if (map.isLand(i)) map.owner[i] = civ.id;
      }
    }

    seedPopulation(city, religion, nFounders) {
      const rng = this.rng;
      const civ = this.civs[city.civId];
      const mk = (o) => this.spawnPerson(Object.assign({
        cityId: city.id, cultureId: civ.cultureId, religionId: religion.id,
      }, o));
      // grandparent generation (mostly dead, kept for genealogy)
      const couples = [];
      for (let k = 0; k < Math.floor(nFounders / 4); k++) {
        const g1 = mk({ birthYear: this.year - rng.i(58, 80), sex: 'M' });
        const g2 = mk({ birthYear: this.year - rng.i(56, 78), sex: 'F', surname: null });
        this.marry(g1, g2, this.year - rng.i(30, 45), true);
        if (rng.chance(0.6)) this.killPerson(g1, this.year - rng.i(1, 12), 'vecchiaia', true);
        if (rng.chance(0.6)) this.killPerson(g2, this.year - rng.i(1, 12), 'vecchiaia', true);
        couples.push([g1, g2]);
      }
      // parent generation
      const gen2 = [];
      for (const [g1, g2] of couples) {
        const kids = rng.i(2, 4);
        for (let c = 0; c < kids; c++) {
          const p = mk({
            birthYear: this.year - rng.i(20, 42), father: g1, mother: g2,
            surname: g1.surname,
          });
          g1.childrenIds.push(p.id); g2.childrenIds.push(p.id);
          gen2.push(p);
        }
      }
      // marry parents among non-siblings, produce children
      const singles = gen2.slice();
      rng.shuffle(singles);
      while (singles.length >= 2) {
        const a = singles.pop();
        const bi = singles.findIndex(x => x.sex !== a.sex && x.fatherId !== a.fatherId);
        if (bi < 0) break;
        const b = singles.splice(bi, 1)[0];
        this.marry(a, b, this.year - rng.i(1, 12), true);
        const kids = rng.i(0, 3);
        for (let c = 0; c < kids; c++) {
          const [f, m] = a.sex === 'M' ? [a, b] : [b, a];
          const maxAge = this.year - Math.max(f.birthYear, m.birthYear) - 16;
          if (maxAge < 1) continue;
          const child = mk({
            birthYear: this.year - rng.i(0, Math.min(maxAge, 14)), father: f, mother: m, surname: f.surname,
          });
          f.childrenIds.push(child.id); m.childrenIds.push(child.id);
        }
      }
      // friendships and small memories among adults
      const folks = city.people(this).filter(p => p.alive);
      for (const p of folks) {
        const others = folks.filter(o => o !== p);
        for (let k = 0; k < Math.min(3, others.length); k++) {
          const o = rng.pick(others);
          p.changeRel(o.id, rng.i(5, 45));
        }
        this.assignProfession(p);
        p.pickGoals(this);
        this.giveChildhoodMemories(p);
      }
      city.pop = Math.round(folks.length * rng.f(3.5, 5));
    }

    spawnPerson(opts) {
      const p = new PCS.Person(this, opts);
      this.people.set(p.id, p);
      if (p.alive) {
        const arr = this.peopleByCity.get(p.cityId);
        if (arr) arr.push(p);
      }
      return p;
    }

    marry(a, b, year, silent) {
      a.spouseId = b.id; b.spouseId = a.id;
      a.changeRel(b.id, 60); b.changeRel(a.id, 60);
      const txt = `Ho sposato ${b.fullName}`;
      a.addMemory(year, 'matrimonio', txt, 8, [b.id]);
      b.addMemory(year, 'matrimonio', `Ho sposato ${a.fullName}`, 8, [a.id]);
      if (!silent) {
        a.feel('gioia', 0.5); b.feel('gioia', 0.5);
      }
    }

    giveChildhoodMemories(p) {
      const rng = this.rng;
      const age = p.age(this.year);
      const city = this.cities[p.cityId];
      const mem = [];
      if (age > 6) mem.push(['infanzia', `Da bambino/a giocavo vicino ${rng.pick(['al fiume', 'alle mura', 'ai campi', 'al mercato', 'al bosco'])} di ${city.name}`, 3]);
      if (age > 10 && rng.chance(0.5)) mem.push(['infanzia', rng.pick([
        'Mia nonna mi raccontava le storie degli antenati davanti al fuoco',
        'Un inverno terribile quasi ci portò via tutti',
        'Ricordo la prima festa del raccolto: ballammo fino all\'alba',
        'Da piccolo/a mi persi nei boschi per un giorno intero',
        'Mio padre mi insegnò il mestiere quando ero ancora bambino/a',
      ]), 4]);
      const father = this.people.get(p.fatherId);
      if (father && !father.alive && age > 5) mem.push(['lutto', `Mio padre ${father.fullName} è morto quando avevo ${Math.max(1, father.deathYear - p.birthYear)} anni`, 7, [father.id]]);
      for (const [t, txt, imp, subj] of mem) {
        p.addMemory(p.birthYear + Math.min(age, rng.i(4, Math.max(5, age))), t, txt.replace(/\/a/g, p.sex === 'F' ? 'a' : 'o'), imp, subj);
      }
    }

    assignProfession(p) {
      const rng = this.rng;
      const age = p.age(this.year);
      if (age < 14) { p.profession = p.sex === 'F' ? 'bambina' : 'bambino'; return; }
      const civ = this.civs[this.cities[p.cityId].civId];
      const era = PCS.civEra(civ);
      const pool = PCS.PROFESSIONS[era];
      // trait-driven choice
      const weights = pool.map(prof => {
        let w = 1;
        if (/guerrier|soldat|ufficial|capitan/.test(prof)) w += p.traits.courage * 2;
        if (/mercant|commerc|banchier|imprendit/.test(prof)) w += p.traits.ambition * 2;
        if (/sciaman|sacerdot/.test(prof)) w += p.traits.piety * 2.5;
        if (/scrib|studios|professor|scienz|medic|ricercat|ingegner|programmat/.test(prof)) w += p.traits.intelligence * 2.5;
        if (/contadin|agricolt|pastor|operai/.test(prof)) w += (1 - p.traits.ambition);
        return { prof, w };
      });
      p.profession = rng.weighted(weights).prof;
      if (p.sex === 'F') p.profession = p.profession.replace(/o$/, 'a').replace('contadino', 'contadina');
      // skills
      p.skills.lavoro = U.clamp(rng.f(0.2, 0.5) + p.traits.intelligence * 0.2, 0, 1);
      if (/guerrier|soldat/.test(p.profession)) p.skills.combattimento = rng.f(0.4, 0.8);
      if (/mercant|commerc/.test(p.profession)) p.skills.commercio = rng.f(0.4, 0.8);
      if (/scrib|studios|sacerdot|medic/.test(p.profession)) { p.skills.sapere = rng.f(0.4, 0.8); p.educated = true; }
    }

    makeLeader(civ, person) {
      civ.leaderId = person.id;
      const gi = civ.govInfo();
      person.title = gi.leaderTitle[person.sex === 'F' ? 1 : 0];
      person.reputation = Math.max(person.reputation, 50);
      if (civ.government === 'monarchia' || civ.government === 'impero') civ.dynasty = person.surname;
    }

    killPerson(p, year, cause, silent) {
      if (!p.alive) return;
      p.alive = false;
      p.deathYear = year;
      p.deathCause = cause;
      const arr = this.peopleByCity.get(p.cityId);
      if (arr) U.removeItem(arr, p);
      if (silent) return;
      // consequences: grief, orphans, inheritance, succession
      const spouse = this.people.get(p.spouseId);
      if (spouse && spouse.alive) {
        spouse.addMemory(year, 'lutto', `${p.sex === 'M' ? 'Mio marito' : 'Mia moglie'} ${p.fullName} è ${p.sex === 'M' ? 'morto' : 'morta'} (${cause})`, 9, [p.id]);
        spouse.feel('dolore', 0.8);
        spouse.spouseId = null;
        spouse.wealth += p.wealth * 0.5;
      }
      let heirs = 0;
      for (const cid of p.childrenIds) {
        const c = this.people.get(cid);
        if (!c || !c.alive) continue;
        heirs++;
        const rel = p.sex === 'M' ? 'Mio padre' : 'Mia madre';
        c.addMemory(year, 'lutto', `${rel} ${p.fullName} è ${p.sex === 'M' ? 'morto' : 'morta'}${cause === 'guerra' ? ' in guerra' : cause === 'peste' ? ' di peste' : ''}`, cause === 'vecchiaia' ? 6 : 8, [p.id]);
        c.feel('dolore', 0.6);
        if (c.age(year) < 14) {
          const other = this.people.get(p.sex === 'M' ? c.motherId : c.fatherId);
          if (!other || !other.alive) { c.orphan = true; c.addMemory(year, 'trauma', 'Sono rimasto orfano da bambino', 9); }
        }
        if (cause === 'guerra' || cause === 'assassinio') {
          c.addMemory(year, 'torto', `Non dimenticherò chi ha causato la morte di ${p.name}`, 7, [p.id]);
          c.feel('rabbia', 0.5);
        }
      }
      if (heirs && spouse == null) {
        const each = p.wealth / heirs;
        for (const cid of p.childrenIds) {
          const c = this.people.get(cid);
          if (c && c.alive) c.wealth += each;
        }
      }
      // close friends grieve
      for (const fid of p.friends().slice(0, 4)) {
        const f = this.people.get(fid);
        if (f && f.alive) {
          f.addMemory(year, 'lutto', `Il mio amico ${p.fullName} non c'è più`, 5, [p.id]);
          f.feel('dolore', 0.3);
        }
      }
      // leader death -> succession handled in politics tick
      const civ = this.civs[this.cities[p.cityId] ? this.cities[p.cityId].civId : -1];
      if (civ && civ.leaderId === p.id) {
        civ.leaderId = null;
        this.chronicle.add(year, 'politica', `${p.title || 'Il capo'} ${p.fullName} di ${civ.name} è ${p.sex === 'F' ? 'morta' : 'morto'} (${cause}).`, 6, { civIds: [civ.id], personIds: [p.id] });
      } else if (p.reputation > 60) {
        this.chronicle.add(year, 'persona', `Si spegne ${p.fullName}, figura nota di ${this.cities[p.cityId] ? this.cities[p.cityId].name : '—'}.`, 4, { personIds: [p.id] });
      }
    }

    seedAnimals() {
      const rng = this.rng, map = this.map;
      const SPECIES = [
        { name: 'cervi', type: 'preda', biomes: [4, 5, 6], rate: 1.28 },
        { name: 'bisonti', type: 'preda', biomes: [5, 13], rate: 1.22 },
        { name: 'capre selvatiche', type: 'preda', biomes: [10, 3], rate: 1.25 },
        { name: 'antilopi', type: 'preda', biomes: [8, 9], rate: 1.3 },
        { name: 'cinghiali', type: 'preda', biomes: [6, 7, 12], rate: 1.3 },
        { name: 'lupi', type: 'predatore', biomes: [4, 5, 6, 3], rate: 1.14, prey: ['cervi', 'capre selvatiche'] },
        { name: 'leoni', type: 'predatore', biomes: [8, 9], rate: 1.12, prey: ['antilopi'] },
        { name: 'orsi', type: 'predatore', biomes: [4, 6, 10], rate: 1.1, prey: ['cervi', 'cinghiali'] },
        { name: 'tigri', type: 'predatore', biomes: [7], rate: 1.1, prey: ['cinghiali', 'antilopi'] },
      ];
      // divide map into regions of 40x40
      const RS = 44;
      for (let ry = 0; ry < map.h; ry += RS) {
        for (let rx = 0; rx < map.w; rx += RS) {
          // dominant land biome of region
          const counts = {};
          let land = 0;
          for (let y = ry; y < Math.min(ry + RS, map.h); y += 3) {
            for (let x = rx; x < Math.min(rx + RS, map.w); x += 3) {
              const b = map.biome[map.idx(x, y)];
              if (b >= 2) { counts[b] = (counts[b] || 0) + 1; land++; }
            }
          }
          if (land < 8) continue;
          for (const sp of SPECIES) {
            if (!sp.biomes.some(b => (counts[b] || 0) > 3)) continue;
            if (!rng.chance(0.65)) continue;
            this.animals.push({
              species: sp.name, type: sp.type, rate: sp.rate, prey: sp.prey || null,
              x: rx + RS / 2, y: ry + RS / 2, region: `${rx / RS}-${ry / RS}`,
              count: rng.i(sp.type === 'predatore' ? 40 : 300, sp.type === 'predatore' ? 160 : 1500),
              extinct: false, migrating: false,
            });
          }
        }
      }
    }

    // Keep the registry of the dead bounded: trim their memories and drop
    // long-dead nobodies with no close living relatives, while preserving
    // ancestors of the living, famous figures and anyone the player met.
    pruneDead() {
      const keep = new Set();
      for (const p of this.people.values()) {
        if (p.alive) {
          keep.add(p.id);
          // parents & grandparents & spouse stay for genealogy
          for (const pid of [p.fatherId, p.motherId, p.spouseId]) {
            if (pid == null) continue;
            keep.add(pid);
            const par = this.people.get(pid);
            if (par) {
              if (par.fatherId != null) keep.add(par.fatherId);
              if (par.motherId != null) keep.add(par.motherId);
            }
          }
        }
      }
      for (const r of this.religions) if (r.founderId != null) keep.add(r.founderId);
      for (const w of this.wars) if (w.heroIds) for (const id of w.heroIds) keep.add(id);
      const toDelete = [];
      for (const p of this.people.values()) {
        if (p.alive) {
          // relationship maps of the living stay bounded too
          const entries = Object.entries(p.rel);
          if (entries.length > 26) {
            entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
            p.rel = Object.fromEntries(entries.slice(0, 22));
          }
          continue;
        }
        const yearsDead = this.year - (p.deathYear || 0);
        // trim data of the dead
        if (p.memories.length > 6) {
          p.memories.sort((a, b) => b.imp - a.imp);
          p.memories.length = 6;
          p.memories.sort((a, b) => a.y - b.y);
        }
        p.rel = {};
        const famous = p.reputation > 60 || p.title || p.playerMet || p.killCount > 3;
        if (!keep.has(p.id) && !famous && yearsDead > 70) toDelete.push(p.id);
      }
      for (const id of toDelete) this.people.delete(id);
    }

    recount() {
      let n = 0;
      for (const p of this.people.values()) if (p.alive) n++;
      this.livingCount = n;
    }

    livingPeople() {
      const out = [];
      for (const p of this.people.values()) if (p.alive) out.push(p);
      return out;
    }

    civOf(p) {
      const c = this.cities[p.cityId];
      return c ? this.civs[c.civId] : null;
    }

    sampleStats() {
      const techMax = U.maxBy(this.civs.filter(c => !c.dead), c => c.techs.length);
      this.stats.push({
        y: this.year,
        pop: Math.round(U.sum(this.cities.filter(c => !c.dead), c => c.pop)),
        civs: this.civs.filter(c => !c.dead).length,
        cities: this.cities.filter(c => !c.dead).length,
        wars: this.wars.filter(w => !w.endYear).length,
        techs: techMax ? techMax.techs.length : 0,
        religions: this.religions.filter(r => !r.dead).length,
      });
      if (this.stats.length > 1200) this.stats = this.stats.filter((s, i) => i % 2 === 0 || i > this.stats.length - 400);
    }

    // ---------------- MAIN TICK (one season) ----------------
    tick() {
      this.season++;
      if (this.season >= 4) {
        this.season = 0;
        this.year++;
        this.yearTick();
      }
      this.seasonTick();
    }

    seasonTick() {
      PCS.economyTick(this, this.season);
      PCS.warTick(this, this.season);
      PCS.natureSeasonTick(this, this.season);
    }

    yearTick() {
      if (this.year % 10 === 0) this.pruneDead();
      PCS.demographyTick(this);
      PCS.politicsTick(this);
      PCS.religionTick(this);
      PCS.diplomacyTick(this);
      PCS.natureYearTick(this);
      PCS.playerLegacyTick(this);
      if (this.year % 2 === 0) this.sampleStats();
      this.recount();
    }

    // ---------------- SAVE / LOAD ----------------
    serialize() {
      const people = [];
      for (const p of this.people.values()) people.push(p.toJSON());
      return {
        v: 1,
        seed: this.seed, year: this.year, season: this.season, worldName: this.worldName,
        savedAt: Date.now(),
        rng: this.rng.getState(),
        seqs: {
          person: PCS.getPersonSeq(), civ: PCS.getCivSeq(), city: PCS.getCitySeq(),
          culture: PCS.getCultureSeq(), religion: PCS.getReligionSeq(), war: this.warSeq,
        },
        mapW: this.map.w, mapH: this.map.h,
        mapState: PCS.packMapState(this.map),
        cultures: this.cultures,
        religions: this.religions,
        civs: this.civs.map(c => c.toJSON()),
        cities: this.cities.map(c => c.toJSON()),
        people,
        wars: this.wars,
        animals: this.animals,
        chronicle: this.chronicle.toJSON(),
        player: this.player,
        stats: this.stats,
      };
    }

    static deserialize(data) {
      const w = new World(data.seed, { skipGenesis: true });
      w.year = data.year; w.season = data.season; w.worldName = data.worldName;
      w.rng.setState(data.rng);
      w.map = PCS.generateWorld(data.seed, data.mapW, data.mapH);
      PCS.unpackMapState(w.map, data.mapState);
      w.cultures = data.cultures.map(c => PCS.Culture.fromJSON(c));
      w.religions = data.religions.map(r => PCS.Religion.fromJSON(r));
      w.civs = data.civs.map(c => PCS.Civilization.fromJSON(c));
      w.cities = data.cities.map(c => PCS.City.fromJSON(c));
      for (const c of w.cities) w.peopleByCity.set(c.id, []);
      for (const po of data.people) {
        const p = PCS.Person.fromJSON(po);
        w.people.set(p.id, p);
        if (p.alive) {
          const arr = w.peopleByCity.get(p.cityId);
          if (arr) arr.push(p);
        }
      }
      w.wars = data.wars || [];
      w.warSeq = data.seqs.war || 0;
      w.animals = data.animals || [];
      w.chronicle = PCS.Chronicle.fromJSON(data.chronicle);
      w.player = data.player || w.player;
      w.stats = data.stats || [];
      PCS.setPersonSeq(data.seqs.person);
      PCS.setCivSeq(data.seqs.civ);
      PCS.setCitySeq(data.seqs.city);
      PCS.setCultureSeq(data.seqs.culture);
      PCS.setReligionSeq(data.seqs.religion);
      w.recount();
      return w;
    }
  }

  PCS.World = World;
  PCS.SEASONS = SEASONS;
  PCS.LIVING_CAP = LIVING_CAP;
})();
