/* Individual people: unique names, personality traits, values, skills, health,
   wealth, family ties, friendships, rivalries, memories, goals and emotions.
   Living people are fully simulated; the dead are kept (trimmed) so genealogy
   and history survive for centuries. */
(function () {
  'use strict';
  const PCS = (globalThis.PCS = globalThis.PCS || {});
  const { U } = PCS;

  const PROFESSIONS = {
    ancient: ['contadino', 'cacciatore', 'pescatore', 'pastore', 'vasaio', 'tessitore', 'guerriero', 'sciamano', 'cantastorie'],
    classical: ['contadino', 'fabbro', 'mercante', 'soldato', 'sacerdote', 'scriba', 'muratore', 'medico', 'marinaio', 'artigiano', 'poeta'],
    medieval: ['contadino', 'fabbro', 'mercante', 'soldato', 'sacerdote', 'studioso', 'architetto', 'medico', 'navigatore', 'artigiano', 'giudice', 'bardo'],
    early_modern: ['agricoltore', 'artigiano', 'mercante', 'ufficiale', 'sacerdote', 'professore', 'ingegnere', 'medico', 'capitano', 'stampatore', 'banchiere', 'artista'],
    industrial: ['operaio', 'ingegnere', 'commerciante', 'ufficiale', 'insegnante', 'medico', 'giornalista', 'ferroviere', 'scienziato', 'banchiere', 'avvocato'],
    modern: ['tecnico', 'ingegnere', 'imprenditore', 'ufficiale', 'insegnante', 'medico', 'ricercatore', 'programmatore', 'pilota', 'giornalista', 'funzionario'],
  };
  const PERSONALITY_ADJ = {
    highInt: ['acuto/a', 'riflessivo/a', 'curioso/a'], lowInt: ['semplice', 'concreto/a', 'diffidente delle novità'],
    highCou: ['audace', 'impavido/a', 'temerario/a'], lowCou: ['prudente', 'timoroso/a', 'cauto/a'],
    highEmp: ['gentile', 'compassionevole', 'generoso/a'], lowEmp: ['freddo/a', 'spietato/a', 'calcolatore/trice'],
    highAmb: ['ambizioso/a', 'determinato/a', 'instancabile'], lowAmb: ['tranquillo/a', 'contento/a di poco', 'modesto/a'],
  };
  const GOAL_TEMPLATES = [
    { key: 'wealth', text: 'accumulare una fortuna', trait: 'ambition' },
    { key: 'family', text: 'crescere una grande famiglia', trait: 'empathy' },
    { key: 'master', text: 'diventare il migliore nel proprio mestiere', trait: 'intelligence' },
    { key: 'travel', text: 'vedere il mare almeno una volta', trait: 'courage' },
    { key: 'power', text: 'ottenere una carica importante', trait: 'ambition' },
    { key: 'faith', text: 'servire fedelmente gli dèi', trait: 'empathy' },
    { key: 'revenge', text: 'vendicare un torto subito', trait: 'courage' },
    { key: 'peace', text: 'vivere in pace fino alla vecchiaia', trait: 'none' },
    { key: 'fame', text: 'essere ricordato/a dopo la morte', trait: 'ambition' },
    { key: 'knowledge', text: 'imparare a leggere e conoscere il mondo', trait: 'intelligence' },
  ];

  let PERSON_SEQ = 0;

  class Person {
    constructor(world, opts) {
      this.id = PERSON_SEQ++;
      const rng = world.rng;
      this.sex = opts.sex || (rng.chance(0.5) ? 'M' : 'F');
      const culture = world.cultures[opts.cultureId];
      this.cultureId = opts.cultureId;
      this.name = opts.name || culture.language.firstName(rng, this.sex);
      this.surname = opts.surname || culture.language.surname(rng);
      this.birthYear = opts.birthYear;
      this.deathYear = null;
      this.deathCause = null;
      this.alive = true;
      this.height = Math.round(rng.gauss(this.sex === 'M' ? 173 : 161, 8, 140, 205));
      // personality 0..1 — partially inherited
      const inh = (k) => {
        const f = opts.father, m = opts.mother;
        if (f && m) return U.clamp((f.traits[k] + m.traits[k]) / 2 + rng.gauss(0, 0.14, -0.3, 0.3), 0.02, 0.98);
        return rng.gauss(0.5, 0.19, 0.02, 0.98);
      };
      this.traits = {
        intelligence: inh('intelligence'), courage: inh('courage'),
        empathy: inh('empathy'), ambition: inh('ambition'),
        honesty: inh('honesty'), piety: inh('piety'),
      };
      this.values = rng.shuffle(culture.values.slice()).slice(0, 2);
      if (rng.chance(0.4)) this.values.push(rng.pick(['giustizia', 'famiglia', 'libertà', 'ordine', 'ricchezza', 'fede']));
      this.health = rng.gauss(0.9, 0.08, 0.4, 1);
      this.sick = null; // {name, sev}
      this.profession = 'bambino/a';
      this.skills = { lavoro: 0.1, combattimento: 0.05, commercio: 0.05, sapere: 0.02, oratoria: 0.05 };
      this.educated = false;
      this.wealth = opts.wealth !== undefined ? opts.wealth : rng.f(2, 20);
      this.religionId = opts.religionId !== undefined ? opts.religionId : null;
      this.cityId = opts.cityId;
      this.fatherId = opts.father ? opts.father.id : null;
      this.motherId = opts.mother ? opts.mother.id : null;
      this.spouseId = null;
      this.childrenIds = [];
      this.rel = {}; // personId -> -100..100
      this.memories = []; // {y, t(type), text, imp(1..10), subj?}
      this.goals = [];
      this.emotions = { gioia: 0.5, dolore: 0, rabbia: 0, paura: 0.1 };
      this.reputation = 0; // local fame
      this.title = null; // 'Re', 'Sacerdote capo', etc.
      this.orphan = false;
      this.veteran = false;
      this.killCount = 0;
      this.savedCount = 0;
      this.travelled = false;
      // player interaction state
      this.playerRel = 0;         // -100..100
      this.playerMet = false;
      this.playerChats = [];      // memory of conversations {y, gist, tone}
      this.playerPromises = [];   // {y, text, kept:null}
      this.playerNickname = null;
      this.secretShared = false;
    }
    get fullName() { return this.name + ' ' + this.surname; }
    age(year) { return year - this.birthYear; }
    addMemory(y, type, text, imp, subj) {
      this.memories.push({ y, t: type, text, imp: imp || 3, subj });
      // keep memory bounded: drop the least important old ones
      if (this.memories.length > 34) {
        this.memories.sort((a, b) => (b.imp * 10 + b.y * 0.01) - (a.imp * 10 + a.y * 0.01));
        this.memories.length = 26;
        this.memories.sort((a, b) => a.y - b.y);
      }
    }
    topMemories(n) {
      return this.memories.slice().sort((a, b) => b.imp - a.imp).slice(0, n || 5);
    }
    memoriesOfType(t) { return this.memories.filter(m => m.t === t); }
    changeRel(otherId, delta) {
      this.rel[otherId] = U.clamp((this.rel[otherId] || 0) + delta, -100, 100);
    }
    relTo(otherId) { return this.rel[otherId] || 0; }
    friends() { return Object.entries(this.rel).filter(([, v]) => v >= 35).map(([k]) => +k); }
    enemies() { return Object.entries(this.rel).filter(([, v]) => v <= -35).map(([k]) => +k); }
    feel(emo, amt) {
      this.emotions[emo] = U.clamp((this.emotions[emo] || 0) + amt, 0, 1);
    }
    dominantEmotion() {
      let best = 'gioia', bv = -1;
      for (const [k, v] of Object.entries(this.emotions)) if (v > bv) { bv = v; best = k; }
      return bv < 0.25 ? 'calma' : best;
    }
    personalityDesc(rng) {
      const t = this.traits, out = [];
      const pickAdj = (key) => {
        const arr = PERSONALITY_ADJ[key];
        const raw = arr[(this.id + key.length) % arr.length];
        return this.sex === 'F' ? raw.replace(/\/a/, 'a').replace(/e\/trice/, 'trice').replace(/\/trice/, '') : raw.replace(/\/a/, 'o').replace(/\/trice/, '');
      };
      if (t.intelligence > 0.68) out.push(pickAdj('highInt')); else if (t.intelligence < 0.32) out.push(pickAdj('lowInt'));
      if (t.courage > 0.68) out.push(pickAdj('highCou')); else if (t.courage < 0.32) out.push(pickAdj('lowCou'));
      if (t.empathy > 0.68) out.push(pickAdj('highEmp')); else if (t.empathy < 0.32) out.push(pickAdj('lowEmp'));
      if (t.ambition > 0.68) out.push(pickAdj('highAmb')); else if (t.ambition < 0.32) out.push(pickAdj('lowAmb'));
      if (!out.length) out.push('dal carattere equilibrato');
      return out.join(', ');
    }
    pickGoals(world) {
      const rng = world.rng;
      this.goals = [];
      const pool = GOAL_TEMPLATES.filter(g => g.trait === 'none' || this.traits[g.trait] > 0.4 || rng.chance(0.2));
      rng.shuffle(pool);
      for (const g of pool.slice(0, 2)) this.goals.push({ key: g.key, text: g.text, done: false });
      // memories can spawn goals (e.g. revenge)
      if (this.memoriesOfType('torto').length && !this.goals.some(g => g.key === 'revenge') && this.traits.courage > 0.5) {
        this.goals.push({ key: 'revenge', text: 'vendicare un torto subito', done: false });
      }
    }
    // serialize compactly
    toJSON() {
      const o = {
        id: this.id, sx: this.sex, nm: this.name, sn: this.surname,
        by: this.birthYear, dy: this.deathYear, dc: this.deathCause, al: this.alive ? 1 : 0,
        ht: this.height, tr: this.traits, vl: this.values, hl: +this.health.toFixed(2),
        sk: this.sick, pf: this.profession, ss: this.skills, ed: this.educated ? 1 : 0,
        wl: +this.wealth.toFixed(1), rg: this.religionId, ct: this.cityId, cu: this.cultureId,
        fa: this.fatherId, mo: this.motherId, sp: this.spouseId, ch: this.childrenIds,
        rl: this.rel, mm: this.memories, gl: this.goals, em: this.emotions,
        rp: this.reputation, tt: this.title, or: this.orphan ? 1 : 0, vt: this.veteran ? 1 : 0,
        kc: this.killCount, sc: this.savedCount, tv: this.travelled ? 1 : 0,
        pr: this.playerRel, pm: this.playerMet ? 1 : 0, pc: this.playerChats, pp: this.playerPromises,
        pn: this.playerNickname, sh: this.secretShared ? 1 : 0,
      };
      return o;
    }
    static fromJSON(o) {
      const p = Object.create(Person.prototype);
      p.id = o.id; p.sex = o.sx; p.name = o.nm; p.surname = o.sn;
      p.birthYear = o.by; p.deathYear = o.dy; p.deathCause = o.dc; p.alive = !!o.al;
      p.height = o.ht; p.traits = o.tr; p.values = o.vl || []; p.health = o.hl;
      p.sick = o.sk; p.profession = o.pf; p.skills = o.ss; p.educated = !!o.ed;
      p.wealth = o.wl; p.religionId = o.rg; p.cityId = o.ct; p.cultureId = o.cu;
      p.fatherId = o.fa; p.motherId = o.mo; p.spouseId = o.sp; p.childrenIds = o.ch || [];
      p.rel = o.rl || {}; p.memories = o.mm || []; p.goals = o.gl || []; p.emotions = o.em || { gioia: 0.5, dolore: 0, rabbia: 0, paura: 0 };
      p.reputation = o.rp || 0; p.title = o.tt; p.orphan = !!o.or; p.veteran = !!o.vt;
      p.killCount = o.kc || 0; p.savedCount = o.sc || 0; p.travelled = !!o.tv;
      p.playerRel = o.pr || 0; p.playerMet = !!o.pm; p.playerChats = o.pc || [];
      p.playerPromises = o.pp || []; p.playerNickname = o.pn || null; p.secretShared = !!o.sh;
      return p;
    }
  }

  PCS.Person = Person;
  PCS.PROFESSIONS = PROFESSIONS;
  PCS.setPersonSeq = v => { PERSON_SEQ = v; };
  PCS.getPersonSeq = () => PERSON_SEQ;
})();
