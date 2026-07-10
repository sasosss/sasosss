/* Cultures and religions.
   A Culture bundles a procedural language with food, architecture, clothing,
   music, festivals, symbols, flag, mythology and moral values, so that two
   civilizations look and feel genuinely different. */
(function () {
  'use strict';
  const PCS = (globalThis.PCS = globalThis.PCS || {});
  const { U } = PCS;

  const ARCH_STYLES = ['case di pietra a cupola', 'torri di legno intagliato', 'edifici di mattoni crudi dipinti', 'palafitte sull\'acqua', 'costruzioni di marmo con colonne', 'case scavate nella roccia', 'tende decorate e padiglioni', 'pagode a più piani', 'lunghe case comuni di legno', 'ziggurat a terrazze'];
  const CLOTHING = ['tuniche di lino con cinture intrecciate', 'pellicce e cuoio decorato', 'vesti di seta a colori vivaci', 'mantelli di lana grezza con cappuccio', 'abiti drappeggiati e sandali', 'gonnellini di fibre e monili d\'osso', 'caftani ricamati e turbanti', 'corazze di cuoio anche in tempo di pace', 'abiti scuri con ricami geometrici', 'stoffe tinte con motivi a spirale'];
  const MUSIC = ['tamburi e canti corali', 'flauti di canna e campane', 'liuti a tre corde', 'corni di guerra e percussioni', 'arpe e canti sussurrati', 'zampogne e danze in cerchio', 'gong e canti di gola', 'lire e poemi cantati', 'sonagli rituali e battiti di mani', 'violini rustici e ballate'];
  const FOOD_BASE = ['pane di farro', 'stufato di radici', 'pesce affumicato', 'riso speziato', 'carne essiccata', 'zuppa d\'orzo', 'focacce con miele', 'formaggi stagionati', 'frutta fermentata', 'spiedini di selvaggina'];
  const FOOD_DRINK = ['birra d\'orzo', 'vino di bacche', 'latte fermentato', 'idromele', 'tè di erbe amare', 'sidro di mele selvatiche'];
  const SYMBOLS = ['il sole nascente', 'la luna crescente', 'un albero millenario', 'un\'aquila a due teste', 'un serpente che si morde la coda', 'una stella a otto punte', 'un toro dorato', 'una spirale infinita', 'un lupo ululante', 'una nave con vele spiegate', 'una montagna coronata', 'un occhio aperto'];
  const VALUES_POOL = ['onore', 'ospitalità', 'coraggio', 'saggezza', 'lealtà alla famiglia', 'astuzia', 'devozione', 'libertà', 'laboriosità', 'vendetta', 'armonia', 'gloria in battaglia', 'conoscenza', 'umiltà', 'ricchezza'];
  const FEST_REASONS = ['il raccolto', 'il solstizio d\'inverno', 'la fondazione della città', 'gli antenati', 'la primavera', 'il mare', 'la vittoria sugli antichi nemici', 'il primo fuoco', 'le stelle', 'i defunti'];
  const MYTH_ORIGINS = [
    'il mondo nacque dal canto di {god} che svegliò le acque primordiali',
    '{god} forgiò le terre battendo il martello sul cielo di ferro',
    'due giganti gemelli combatterono e dai loro corpi caduti nacquero i continenti',
    'una tartaruga cosmica emerse dall\'oceano portando il mondo sul dorso',
    '{god} pianse per mille anni e le lacrime divennero i mari',
    'il primo albero crebbe nel vuoto e i suoi frutti caduti divennero popoli',
    'un uovo di fuoco si schiuse e ne uscirono il sole, la luna e {god}',
    '{god} sognò il mondo e teme ancora di svegliarsi',
  ];
  const RELIGION_TYPES = ['politeismo', 'monoteismo', 'animismo', 'culto degli antenati', 'dualismo', 'culto astrale'];
  const RITES = ['offerte di grano bruciato all\'alba', 'immersioni rituali nei fiumi', 'danze mascherate al plenilunio', 'digiuni di sette giorni', 'sacrifici di bestiame nei giorni sacri', 'processioni con lanterne', 'canti funebri di tre notti', 'tatuaggi sacri all\'età adulta', 'pellegrinaggi alle vette', 'letture pubbliche dei testi sacri'];
  const AFTERLIFE = ['i giusti rinascono come uccelli', 'le anime attraversano un fiume di stelle', 'i morti dimorano in una sala dorata', 'lo spirito si dissolve nel vento', 'ogni anima viene pesata su una bilancia di rame', 'i defunti vegliano sui discendenti come ombre'];

  let CULTURE_SEQ = 0, RELIGION_SEQ = 0;

  class Culture {
    constructor(seed, worldName) {
      this.id = CULTURE_SEQ++;
      const rng = new PCS.RNG(seed);
      this.language = new PCS.Language(seed + ':lang');
      this.name = this.language.surname(rng); // demonym base
      this.demonym = this.name + (rng.chance(0.5) ? 'i' : 'ani');
      this.architecture = rng.pick(ARCH_STYLES);
      this.clothing = rng.pick(CLOTHING);
      this.music = rng.pick(MUSIC);
      this.foods = [rng.pick(FOOD_BASE), rng.pick(FOOD_BASE), rng.pick(FOOD_DRINK)];
      this.symbol = rng.pick(SYMBOLS);
      this.values = rng.shuffle(VALUES_POOL.slice()).slice(0, 3);
      this.festivals = [
        { name: 'Festa di ' + U.cap(this.language.concept('festa1')), reason: rng.pick(FEST_REASONS), season: rng.i(0, 3) },
        { name: 'Notte di ' + U.cap(this.language.concept('festa2')), reason: rng.pick(FEST_REASONS), season: rng.i(0, 3) },
      ];
      this.flag = {
        bg: rng.i(0, 359), fg: (rng.i(0, 359) + 120 + rng.i(0, 120)) % 360,
        pattern: rng.pick(['bands', 'cross', 'circle', 'triangle', 'diag', 'star']),
      };
      this.traditions = [
        `gli ospiti ricevono sempre ${rng.pick(['sale e pane', 'una tazza di ' + rng.pick(FOOD_DRINK), 'un piccolo dono intagliato'])}`,
        `${rng.pick(['gli anziani', 'le madri', 'i guerrieri', 'i sacerdoti'])} hanno l'ultima parola nelle dispute`,
        rng.pick(['i nomi si ereditano dal nonno paterno', 'ci si sposa solo in primavera', 'è tabù indicare le stelle col dito', 'ogni casa custodisce un focolare mai spento', 'i debiti si perdonano ogni sette anni']),
      ];
      this.mythology = null; // set when religion is created
      this.usedNames = 0;
    }
    static fromJSON(o) {
      const c = Object.create(Culture.prototype);
      Object.assign(c, o);
      c.language = PCS.Language.fromJSON(o.language);
      return c;
    }
  }

  class Religion {
    constructor(seed, culture, founder, year, parent) {
      this.id = RELIGION_SEQ++;
      const rng = new PCS.RNG(seed);
      const lang = culture.language;
      this.type = parent ? parent.type : rng.pick(RELIGION_TYPES);
      const godCount = this.type === 'monoteismo' ? 1 : this.type === 'dualismo' ? 2 : rng.i(3, 6);
      this.gods = [];
      const DOMAINS = ['del cielo', 'del mare', 'della guerra', 'del raccolto', 'della morte', 'della sapienza', 'del fuoco', 'della luna', 'delle tempeste', 'dell\'amore', 'della fortuna', 'dei sogni'];
      rng.shuffle(DOMAINS);
      for (let g = 0; g < godCount; g++) {
        this.gods.push({ name: lang.godName(rng), domain: this.type === 'monoteismo' ? 'di tutte le cose' : DOMAINS[g % DOMAINS.length] });
      }
      this.name = parent
        ? rng.pick(['Nuova Via di ', 'Riforma di ', 'Vero Culto di ']) + this.gods[0].name
        : rng.pick(['Culto di ', 'Via di ', 'Fede di ', 'Chiesa di ', 'Sentiero di ']) + this.gods[0].name;
      this.founderId = founder ? founder.id : null;
      this.prophetName = founder ? founder.name + ' ' + founder.surname : lang.firstName(rng, rng.chance(0.5) ? 'F' : 'M') + ' il Veggente';
      this.foundedYear = year;
      this.parentId = parent ? parent.id : null;
      this.holyCityId = null;
      this.sacredText = 'Il ' + U.cap(lang.concept('libro')) + ' di ' + this.gods[0].name;
      this.symbol = rng.pick(SYMBOLS);
      this.rites = rng.shuffle(RITES.slice()).slice(0, 2);
      this.afterlife = rng.pick(AFTERLIFE);
      this.holyDay = { name: 'Giorno di ' + this.gods[0].name, season: rng.i(0, 3) };
      this.tenets = rng.shuffle([
        'la carità verso i poveri', 'la purezza del corpo', 'l\'obbedienza ai sacerdoti',
        'il pellegrinaggio almeno una volta nella vita', 'il rifiuto della violenza ingiustificata',
        'la memoria degli antenati', 'la ricerca della conoscenza', 'il sacrificio del primo raccolto',
      ].slice()).slice(0, 3);
      this.followers = 0; // recomputed each tick
      this.dead = false;
      this.mythos = rng.pick(MYTH_ORIGINS).replace('{god}', this.gods[0].name);
    }
    static fromJSON(o) {
      const r = Object.create(Religion.prototype);
      Object.assign(r, o);
      return r;
    }
  }

  PCS.Culture = Culture;
  PCS.Religion = Religion;
  PCS.setCultureSeq = v => { CULTURE_SEQ = v; };
  PCS.setReligionSeq = v => { RELIGION_SEQ = v; };
  PCS.getCultureSeq = () => CULTURE_SEQ;
  PCS.getReligionSeq = () => RELIGION_SEQ;
})();
