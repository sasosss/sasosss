/* Civilizations and cities.
   A Civilization owns cities, a culture, a government, technologies, an army
   and diplomatic relations. Cities hold aggregate population plus the fully
   simulated individuals that live there. */
(function () {
  'use strict';
  const PCS = (globalThis.PCS = globalThis.PCS || {});
  const { U } = PCS;

  const GOVERNMENTS = {
    tribu: { name: 'Tribù', warlike: 0.5, stability: 0.6, growth: 0.9, science: 0.7, leaderTitle: ['Capo', 'Matriarca'] },
    monarchia: { name: 'Monarchia', warlike: 0.6, stability: 0.75, growth: 1, science: 0.9, leaderTitle: ['Re', 'Regina'] },
    impero: { name: 'Impero', warlike: 0.85, stability: 0.65, growth: 1.05, science: 1, leaderTitle: ['Imperatore', 'Imperatrice'] },
    repubblica: { name: 'Repubblica', warlike: 0.4, stability: 0.8, growth: 1.1, science: 1.2, leaderTitle: ['Console', 'Console'] },
    dittatura: { name: 'Dittatura', warlike: 0.9, stability: 0.5, growth: 0.95, science: 0.85, leaderTitle: ['Supremo', 'Suprema'] },
    federazione: { name: 'Federazione', warlike: 0.35, stability: 0.85, growth: 1.1, science: 1.15, leaderTitle: ['Presidente', 'Presidente'] },
    teocrazia: { name: 'Teocrazia', warlike: 0.6, stability: 0.7, growth: 0.9, science: 0.7, leaderTitle: ['Gran Sacerdote', 'Gran Sacerdotessa'] },
    oligarchia: { name: 'Oligarchia', warlike: 0.55, stability: 0.65, growth: 1.05, science: 1, leaderTitle: ['Arconte', 'Arconte'] },
  };
  const CIV_COLORS = [
    [220, 60, 60], [70, 130, 220], [90, 180, 90], [220, 160, 50], [170, 90, 200],
    [60, 190, 190], [230, 110, 160], [150, 160, 60], [240, 130, 70], [110, 110, 230],
    [200, 200, 90], [90, 210, 140], [210, 80, 110], [80, 160, 160], [180, 130, 90],
  ];

  let CIV_SEQ = 0, CITY_SEQ = 0;

  class Civilization {
    constructor(world, cultureId, name) {
      this.id = CIV_SEQ++;
      this.cultureId = cultureId;
      this.name = name;
      this.color = CIV_COLORS[this.id % CIV_COLORS.length];
      this.government = 'tribu';
      this.leaderId = null;
      this.dynasty = null; // surname of ruling family under monarchy
      this.capitalId = null;
      this.cityIds = [];
      this.techs = ['fuoco', 'linguaggio'];
      this.research = 0;
      this.researching = null;
      // per-game randomized research taste => different tech paths
      this.techAffinity = {};
      for (const t of PCS.TECHS) this.techAffinity[t.id] = world.rng.f(0.5, 1.6);
      this.treasury = 50;
      this.stability = 0.7;
      this.relations = {}; // civId -> -100..100
      this.treaties = []; // {type:'pace'|'alleanza'|'commercio'|'tributo', withId, year, until?}
      this.army = { size: 0, quality: 0.5, generalId: null, morale: 0.7 };
      this.foundedYear = world.year;
      this.dead = false;
      this.deadYear = null;
      this.warExhaustion = 0;
      this.grievances = {}; // civId -> [{y, text, weight}]
    }
    get culture() { return PCS.world.cultures[this.cultureId]; }
    cities(world) { return this.cityIds.map(id => world.cities[id]).filter(c => c && !c.dead); }
    totalPop(world) { return U.sum(this.cities(world), c => c.pop); }
    relTo(id) { return this.relations[id] || 0; }
    setRel(id, v) { this.relations[id] = U.clamp(v, -100, 100); }
    changeRel(id, d) { this.setRel(id, this.relTo(id) + d); }
    hasTreaty(id, type) { return this.treaties.some(t => t.withId === id && t.type === type && !t.broken); }
    addGrievance(id, y, text, weight) {
      if (!this.grievances[id]) this.grievances[id] = [];
      this.grievances[id].push({ y, text, weight });
      if (this.grievances[id].length > 8) this.grievances[id].shift();
    }
    govInfo() { return GOVERNMENTS[this.government]; }
    toJSON() {
      return {
        id: this.id, cu: this.cultureId, nm: this.name, co: this.color, gv: this.government,
        ld: this.leaderId, dy: this.dynasty, cp: this.capitalId, ci: this.cityIds,
        tc: this.techs, rs: +this.research.toFixed(1), rg: this.researching, ta: this.techAffinity,
        tr: +this.treasury.toFixed(1), st: +this.stability.toFixed(2), rl: this.relations,
        tt: this.treaties, ar: this.army, fy: this.foundedYear, dd: this.dead ? 1 : 0,
        dyr: this.deadYear, we: +this.warExhaustion.toFixed(2), gr: this.grievances,
      };
    }
    static fromJSON(o) {
      const c = Object.create(Civilization.prototype);
      c.id = o.id; c.cultureId = o.cu; c.name = o.nm; c.color = o.co; c.government = o.gv;
      c.leaderId = o.ld; c.dynasty = o.dy; c.capitalId = o.cp; c.cityIds = o.ci;
      c.techs = o.tc; c.research = o.rs; c.researching = o.rg; c.techAffinity = o.ta;
      c.treasury = o.tr; c.stability = o.st; c.relations = o.rl; c.treaties = o.tt || [];
      c.army = o.ar; c.foundedYear = o.fy; c.dead = !!o.dd; c.deadYear = o.dyr || null;
      c.warExhaustion = o.we || 0; c.grievances = o.gr || {};
      return c;
    }
  }

  class City {
    constructor(world, civ, x, y, name) {
      this.id = CITY_SEQ++;
      this.name = name;
      this.civId = civ.id;
      this.x = x; this.y = y;
      this.foundedYear = world.year;
      this.pop = 0;           // aggregate population
      this.food = 30;         // stockpile
      this.wealth = 20;
      this.prosperity = 0.5;  // 0..1 quality of life
      this.unrest = 0.1;
      this.famine = false;
      this.plague = null;     // {name, deadliness, yearsLeft}
      this.walls = 0;
      this.buildings = [];    // strings, e.g. 'tempio di X', 'mercato'
      this.prices = { grano: 1, utensili: 1, stoffe: 1, metalli: 1, lusso: 1 };
      this.moneySupply = 100;
      this.tradeRoutes = [];  // cityIds
      this.dead = false;
      this.deadYear = null;
      this.refugees = 0;
      this.notes = [];
    }
    resourcesNearby(world) {
      const out = new Set();
      const R = 4;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const nx = this.x + dx, ny = this.y + dy;
        if (!world.map.inb(nx, ny)) continue;
        const r = world.map.resource[world.map.idx(nx, ny)];
        if (r >= 0) out.add(PCS.RESOURCES[r]);
      }
      return [...out];
    }
    fertilityAround(world) {
      let f = 0, n = 0;
      const R = 3;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const nx = this.x + dx, ny = this.y + dy;
        if (!world.map.inb(nx, ny)) continue;
        const i = world.map.idx(nx, ny);
        f += PCS.BIOME_INFO[world.map.biome[i]].fert + (world.map.river[i] ? 0.3 : 0);
        n++;
      }
      return f / Math.max(1, n);
    }
    people(world) { return world.peopleByCity.get(this.id) || []; }
    toJSON() {
      return {
        id: this.id, nm: this.name, cv: this.civId, x: this.x, y: this.y, fy: this.foundedYear,
        pp: Math.round(this.pop), fd: +this.food.toFixed(1), wl: +this.wealth.toFixed(1),
        pr: +this.prosperity.toFixed(2), un: +this.unrest.toFixed(2), fm: this.famine ? 1 : 0,
        pl: this.plague, wa: this.walls, bd: this.buildings, pc: this.prices,
        ms: +this.moneySupply.toFixed(1), trt: this.tradeRoutes, dd: this.dead ? 1 : 0,
        dyr: this.deadYear, rf: Math.round(this.refugees),
      };
    }
    static fromJSON(o) {
      const c = Object.create(City.prototype);
      c.id = o.id; c.name = o.nm; c.civId = o.cv; c.x = o.x; c.y = o.y; c.foundedYear = o.fy;
      c.pop = o.pp; c.food = o.fd; c.wealth = o.wl; c.prosperity = o.pr; c.unrest = o.un;
      c.famine = !!o.fm; c.plague = o.pl; c.walls = o.wa; c.buildings = o.bd || [];
      c.prices = o.pc; c.moneySupply = o.ms; c.tradeRoutes = o.trt || []; c.dead = !!o.dd;
      c.deadYear = o.dyr || null; c.refugees = o.rf || 0; c.notes = [];
      return c;
    }
  }

  PCS.GOVERNMENTS = GOVERNMENTS;
  PCS.Civilization = Civilization;
  PCS.City = City;
  PCS.setCivSeq = v => { CIV_SEQ = v; };
  PCS.setCitySeq = v => { CITY_SEQ = v; };
  PCS.getCivSeq = () => CIV_SEQ;
  PCS.getCitySeq = () => CITY_SEQ;
})();
