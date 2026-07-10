/* NPC conversation engine.
   Rule-based natural-language chat in Italian. Every reply is assembled from
   the NPC's actual state: age, education, culture, religion, profession,
   personality, emotions, health, wealth, government, ongoing wars, memories
   and the real chronicle of the world. NPCs remember every conversation with
   the player, can lie, gossip, hold prejudice, and only know what a person in
   their position could plausibly know. Conversations change the world. */
(function () {
  'use strict';
  const PCS = (globalThis.PCS = globalThis.PCS || {});
  const { U } = PCS;

  // ---------- lexicon for intent detection ----------
  const LEX = {
    greet: ['ciao', 'salve', 'buongiorno', 'buonasera', 'saluti', 'ehi', 'hey', 'salute'],
    bye: ['addio', 'arrivederci', 'a presto', 'devo andare', 'ci vediamo', 'vado'],
    whoAreYou: ['chi sei', 'come ti chiami', 'il tuo nome', 'presentati', 'parlami di te', 'chi e lei'],
    age: ['quanti anni', 'che eta', 'quanto sei vecchi', 'sei giovane', 'sei vecchi'],
    family: ['famiglia', 'genitori', 'parenti'],
    father: ['padre', 'papa'],
    mother: ['madre', 'mamma'],
    spouse: ['moglie', 'marito', 'sposat', 'coniuge', 'matrimonio'],
    children: ['figli', 'figlio', 'figlia', 'bambini tuoi'],
    siblings: ['fratell', 'sorell'],
    grandparents: ['nonn'],
    friends: ['amici', 'amico', 'amica', 'compagni'],
    enemies: ['nemici', 'nemico', 'rivali', 'rivale', 'odii qualcuno', 'chi odi'],
    love: ['amore', 'innamorat', 'ami qualcuno', 'cuore'],
    work: ['lavoro', 'mestiere', 'professione', 'che fai', 'di cosa ti occupi', 'cosa fai nella vita', 'occupazione'],
    wealth: ['ricco', 'ricca', 'soldi', 'denaro', 'ricchezza', 'quanto guadagni', 'povero', 'povera', 'monete'],
    city: ['citta', 'villaggio', 'dove vivi', 'questo posto', 'qui intorno', 'paese tuo'],
    religion: ['religione', 'dio', 'dei', 'divinita', 'fede', 'credi', 'preghi', 'tempio', 'sacro', 'aldila', 'anima', 'profeta'],
    leader: ['re ', ' re', 'regina', 'capo', 'governo', 'sovrano', 'imperatore', 'console', 'presidente', 'chi comanda', 'chi governa', 'politica', 'leader', 'dittatore'],
    war: ['guerra', 'battaglia', 'combattut', 'soldato tu', 'esercito', 'nemici del regno', 'pace'],
    history: ['storia', 'passato del mondo', 'anni fa', 'raccontami cosa e successo', 'eventi', 'cronaca', 'accaduto'],
    memories: ['ricordi', 'ricordo', 'memoria', 'raccontami di te', 'la tua vita', 'infanzia', 'da bambin', 'gioventu', 'miglior ricordo', 'peggior ricordo'],
    feelings: ['come stai', 'come ti senti', 'sei felice', 'sei triste', 'stai bene', 'umore', 'emozioni'],
    health: ['salute', 'malat', 'stai male', 'medico', 'febbre', 'malattia'],
    dreams: ['sogni', 'sogno', 'obiettivi', 'obiettivo', 'desideri', 'cosa vuoi dalla vita', 'ambizioni', 'futuro tuo', 'speranze'],
    fears: ['paura', 'paure', 'temi', 'spaventa', 'terrore'],
    secrets: ['segreto', 'segreti', 'nascondi', 'confessa', 'confidati'],
    gossip: ['pettegolezz', 'voci', 'si dice', 'novita', 'notizie', 'che si racconta', 'rumor'],
    trade: ['prezzo', 'prezzi', 'mercato', 'comprare', 'vendere', 'commercio', 'quanto costa', 'grano quanto', 'mercante'],
    tech: ['tecnologia', 'invenzion', 'scopert', 'progresso', 'sapete costruire', 'conoscenze', 'scienza'],
    nature: ['animali', 'lupi', 'caccia', 'foresta', 'bestie', 'natura', 'raccolto', 'stagione', 'tempo fa', 'clima', 'inverno', 'estate'],
    food: ['cibo', 'mangia', 'cucina', 'piatto', 'bere', 'bevanda', 'fame tu'],
    culture: ['tradizioni', 'usanze', 'costumi', 'festa', 'festivita', 'musica', 'vestiti', 'abiti', 'cultura', 'leggend', 'mito', 'canzoni'],
    travel: ['viaggiat', 'viaggio', 'mondo hai visto', 'altre citta', 'estero', 'lontano sei stato'],
    insult: ['stupido', 'stupida', 'idiota', 'imbecille', 'brutto', 'brutta', 'ti odio', 'sei orribile', 'cretino', 'cretina', 'fai schifo', 'inutile', 'vergognati', 'patetico', 'patetica', 'zitto', 'zitta', 'maledetto', 'maledetta', 'sciocco', 'sciocca', 'buffone'],
    praise: ['sei grande', 'sei fantastic', 'ammiro', 'ti stimo', 'bravo', 'brava', 'sei bell', 'sei simpatic', 'sei saggi', 'complimenti', 'sei gentile', 'mi piaci', 'sei forte', 'ben fatto', 'ottimo lavoro', 'sei intelligente', 'ti voglio bene', 'ti amo'],
    thanks: ['grazie', 'ti ringrazio', 'riconoscente'],
    help: ['ti aiuto', 'posso aiutarti', 'ti dono', 'ti regalo', 'prendi questo', 'ti offro', 'eccoti', 'per te'],
    promise: ['prometto', 'giuro', 'ti do la mia parola', 'un giorno ti', 'tornero'],
    whoAmI: ['chi sono io', 'mi conosci', 'sai chi sono', 'ti ricordi di me', 'mi riconosci'],
    playerName: ['mi chiamo', 'il mio nome e', 'sono io,'],
    god: ['sono un dio', 'sono una dea', 'vengo dal cielo', 'sono immortale', 'adorami', 'inginocchiati', 'sono il tuo dio', 'fonda una religione', 'seguimi e', 'io sono eterno'],
    yes: ['si', 'certo', 'ovvio', 'va bene', 'ok', 'daccordo', 'esatto'],
    no: ['no', 'mai', 'non credo', 'assolutamente no'],
    opinionCue: ['cosa pensi di', 'che pensi di', 'opinione su', 'cosa ne pensi di', 'che ne dici di', 'ti piace', 'conosci', 'parlami di', 'chi e', 'raccontami di', 'che sai di'],
  };

  function hasAny(txt, keys) {
    for (const k of keys) if (txt.includes(k)) return true;
    return false;
  }

  // ---------- per-NPC speech style ----------
  function styleOf(p, world) {
    const civ = world.civOf(p);
    return {
      verbose: p.traits.intelligence * 0.5 + (p.educated ? 0.35 : 0) + p.skills.oratoria * 0.3,
      warm: p.traits.empathy,
      formal: (p.title ? 0.5 : 0) + (p.educated ? 0.25 : 0) + p.traits.honesty * 0.15,
      pious: p.traits.piety,
      blunt: 1 - p.traits.empathy,
      old: p.age(world.year) >= 60,
      young: p.age(world.year) < 20,
      liar: p.traits.honesty < 0.3,
      proud: p.traits.ambition > 0.7,
      fearful: p.emotions.paura > 0.5,
      angry: p.emotions.rabbia > 0.5,
      sad: p.emotions.dolore > 0.5,
      happy: p.emotions.gioia > 0.6,
    };
  }

  // interjections that give each speaker a recognizable voice
  function tic(p, world, rng) {
    const s = styleOf(p, world);
    const civ = world.civOf(p);
    const culture = civ ? world.cultures[civ.cultureId] : null;
    const rel = p.religionId != null ? world.religions[p.religionId] : null;
    const opts = [];
    if (s.pious > 0.65 && rel) opts.push(`${rel.gods[0].name} mi è testimone, `, `che ${rel.gods[0].name} ci guardi, `);
    if (s.old) opts.push('Ai miei tempi si diceva: ', 'Alla mia età, ', 'Vecchio come sono, ');
    if (s.young) opts.push('Boh, ', 'Cioè, ');
    if (s.blunt > 0.7) opts.push('Parlo chiaro: ', 'Senza girarci intorno: ');
    if (s.proud) opts.push('Come tutti sanno, ', 'E lo dico con orgoglio: ');
    if (culture && rng.chance(0.25)) opts.push(`Come diciamo noi ${culture.demonym}: "${culture.language.concept('proverbio')}", cioè... be', `);
    if (s.fearful) opts.push('Di questi tempi è meglio sussurrare... ');
    if (!opts.length) return '';
    return rng.chance(0.4) ? rng.pick(opts) : '';
  }

  // how much this person can know about distant/political matters (0..1)
  function worldliness(p, world) {
    let k = 0.15;
    if (p.educated) k += 0.25;
    if (/mercant|commerc|banchier|capitan|navigat|marina/.test(p.profession)) k += 0.3;
    if (/scrib|studios|storic|giornal|professor|sacerdot|giudice|scienz/.test(p.profession)) k += 0.35;
    if (p.title) k += 0.35;
    if (p.travelled) k += 0.15;
    if (p.reputation > 50) k += 0.1;
    return Math.min(1, k);
  }

  class ChatSession {
    constructor(world, person) {
      this.world = world;
      this.p = person;
      this.rng = new PCS.RNG(world.seed + ':chat:' + person.id + ':' + world.year + ':' + Math.floor(Math.random() * 1e9));
      this.turns = 0;
      this.topicsDiscussed = new Set();
      this.gistParts = [];
      this.tone = 0; // running tone of the conversation
    }

    // main entry
    respond(raw) {
      const world = this.world, p = this.p, rng = this.rng;
      const txt = U.norm(raw);
      this.turns++;
      let out = '';
      let effects = [];

      const s = styleOf(p, world);
      const civ = world.civOf(p);
      const city = world.cities[p.cityId];
      const year = world.year;

      // -------- first meeting / recognition --------
      let opener = '';
      if (this.turns === 1) opener = this.openingLine();

      // -------- tone handling first (insults / praise / thanks / help / promise) --------
      if (hasAny(txt, LEX.insult)) {
        return opener + this.handleInsult(txt);
      }
      if (hasAny(txt, LEX.promise)) {
        out = this.handlePromise(raw);
        return opener + out;
      }
      if (hasAny(txt, LEX.help)) {
        return opener + this.handleHelp(raw);
      }
      if (hasAny(txt, LEX.god)) {
        return opener + this.handleDivineClaim();
      }
      if (hasAny(txt, LEX.praise)) {
        out += this.handlePraise();
        // may continue answering a question too
        if (!txt.includes('?') && out) return opener + out;
      }
      if (hasAny(txt, LEX.thanks)) {
        p.playerRel = U.clamp(p.playerRel + 2, -100, 100);
        return opener + this.pickWarm([
          'Non c\'è di che.', 'Figurati, straniero.', 'È stato un piacere parlare con te.',
          s.pious > 0.6 ? `Che ${this.godName()} ti accompagni.` : 'Buona fortuna a te.',
        ]);
      }

      // -------- player introduces themself --------
      const nameIntro = txt.match(/(?:mi chiamo|il mio nome e|sono) ([a-z]{2,20})\b/);
      if (nameIntro && hasAny(txt, LEX.playerName)) {
        const nm = U.cap(nameIntro[1]);
        world.player.name = nm;
        p.playerNickname = nm;
        this.remember(`mi ha detto di chiamarsi ${nm}`);
        return opener + this.speak([
          `${nm}... un nome ${rng.chance(0.5) ? 'insolito da queste parti' : 'che non dimenticherò'}. Io sono ${p.name}.`,
        ]);
      }

      // -------- topic intents --------
      const answer =
        this.tryOpinion(txt) ||
        (hasAny(txt, LEX.whoAmI) ? this.handleWhoAmI() : null) ||
        (hasAny(txt, LEX.whoAreYou) ? this.handleWhoAreYou() : null) ||
        (hasAny(txt, LEX.age) ? this.handleAge() : null) ||
        (hasAny(txt, LEX.father) ? this.handleParent('M') : null) ||
        (hasAny(txt, LEX.mother) ? this.handleParent('F') : null) ||
        (hasAny(txt, LEX.spouse) ? this.handleSpouse() : null) ||
        (hasAny(txt, LEX.children) ? this.handleChildren() : null) ||
        (hasAny(txt, LEX.siblings) ? this.handleSiblings() : null) ||
        (hasAny(txt, LEX.grandparents) ? this.handleGrandparents() : null) ||
        (hasAny(txt, LEX.family) ? this.handleFamily() : null) ||
        (hasAny(txt, LEX.friends) ? this.handleFriends() : null) ||
        (hasAny(txt, LEX.enemies) ? this.handleEnemies() : null) ||
        (hasAny(txt, LEX.love) ? this.handleLove() : null) ||
        (hasAny(txt, LEX.work) ? this.handleWork() : null) ||
        (hasAny(txt, LEX.wealth) ? this.handleWealth() : null) ||
        (hasAny(txt, LEX.religion) ? this.handleReligion() : null) ||
        (hasAny(txt, LEX.leader) ? this.handlePolitics() : null) ||
        (hasAny(txt, LEX.war) ? this.handleWar() : null) ||
        (hasAny(txt, LEX.memories) ? this.handleMemories() : null) ||
        (hasAny(txt, LEX.history) ? this.handleHistory() : null) ||
        (hasAny(txt, LEX.feelings) ? this.handleFeelings() : null) ||
        (hasAny(txt, LEX.health) ? this.handleHealth() : null) ||
        (hasAny(txt, LEX.dreams) ? this.handleDreams() : null) ||
        (hasAny(txt, LEX.fears) ? this.handleFears() : null) ||
        (hasAny(txt, LEX.secrets) ? this.handleSecrets() : null) ||
        (hasAny(txt, LEX.gossip) ? this.handleGossip() : null) ||
        (hasAny(txt, LEX.trade) ? this.handleTrade() : null) ||
        (hasAny(txt, LEX.tech) ? this.handleTech() : null) ||
        (hasAny(txt, LEX.culture) ? this.handleCulture() : null) ||
        (hasAny(txt, LEX.food) ? this.handleFood() : null) ||
        (hasAny(txt, LEX.nature) ? this.handleNature() : null) ||
        (hasAny(txt, LEX.travel) ? this.handleTravel() : null) ||
        (hasAny(txt, LEX.city) ? this.handleCity() : null) ||
        (hasAny(txt, LEX.bye) ? this.handleBye() : null) ||
        (hasAny(txt, LEX.greet) && this.turns <= 2 ? this.handleGreet() : null) ||
        this.handleFallback(txt);

      out += answer;
      return opener + out;
    }

    // ---------- helpers ----------
    speak(options) { return this.rng.pick(options); }
    pickWarm(options) { return this.rng.pick(options); }
    godName() {
      const r = this.p.religionId != null ? this.world.religions[this.p.religionId] : null;
      return r ? r.gods[0].name : 'gli spiriti';
    }
    remember(gist, tone) {
      const p = this.p;
      this.gistParts.push(gist);
      p.playerChats.push({ y: this.world.year, gist, tone: tone || 0 });
      if (p.playerChats.length > 30) p.playerChats.splice(0, p.playerChats.length - 30);
      if (!p.playerMet) {
        p.playerMet = true;
        this.world.player.knownBy++;
      }
    }
    rel() { return this.p.playerRel; }
    moodPrefix() {
      const p = this.p, s = styleOf(p, this.world);
      if (s.sad) return this.rng.pick(['*sospira* ', '*con lo sguardo basso* ', '']);
      if (s.angry) return this.rng.pick(['*serra i pugni* ', '*ti guarda torvo* ', '']);
      if (s.fearful) return this.rng.pick(['*si guarda intorno* ', '*a bassa voce* ', '']);
      if (s.happy) return this.rng.pick(['*sorride* ', '', '']);
      return '';
    }

    openingLine() {
      const p = this.p, world = this.world, rng = this.rng;
      const s = styleOf(p, world);
      const playerName = world.player.name;
      let line;
      if (p.playerMet && p.playerChats.length) {
        const last = p.playerChats[p.playerChats.length - 1];
        const yearsAgo = world.year - last.y;
        if (p.playerRel < -30) {
          line = rng.pick([
            `Tu di nuovo. Cosa vuoi, ${playerName}? Non ho dimenticato.`,
            `*ti guarda con freddezza* Pensavo di non rivederti più.`,
          ]);
        } else if (yearsAgo > 25) {
          line = rng.pick([
            `Per tutti gli dèi... ${playerName}? Dopo ${yearsAgo} anni? Non sei invecchiato di un giorno... com'è possibile?`,
            `Quel volto... lo conosco. Sei tu, vero? Sono passati ${yearsAgo} anni e sei identico. Mi vengono i brividi.`,
          ]);
        } else if (yearsAgo > 3) {
          line = rng.pick([
            `${playerName}! Quanto tempo... ${yearsAgo} anni, se non sbaglio. ${last.gist ? `L'ultima volta ${last.gist.startsWith('mi') ? '' : 'parlammo e '}${last.gist}.` : ''}`,
            `Bentornato, ${playerName}. Mi chiedevo se ti avrei mai rivisto.`,
          ]);
        } else if (p.playerRel > 40) {
          line = rng.pick([`${playerName}, amico mio! Che piacere vederti.`, `Ah, ${playerName}! Vieni, siediti.`]);
        } else {
          line = rng.pick([`Ancora tu, ${playerName}.`, `Salve di nuovo, straniero.`]);
        }
        // unkept promises resurface
        const broken = p.playerPromises.find(pr => pr.kept === null && world.year - pr.y > 5);
        if (broken && rng.chance(0.5)) {
          line += ` E comunque... ricordo ancora quella promessa: "${broken.text}". ${p.traits.honesty > 0.5 ? 'Le parole hanno un peso, sai.' : 'Ma tanto non ci contavo.'}`;
          broken.kept = false;
          p.playerRel = U.clamp(p.playerRel - 8, -100, 100);
        }
      } else if (this.heardOfPlayer()) {
        line = this.heardOfPlayer();
        p.playerMet = true;
        this.world.player.knownBy++;
      } else {
        const opts = [];
        if (s.fearful) opts.push(`*trasalisce* Oh! Non ti avevo visto... chi sei? Non sei di ${this.cityName()}.`);
        if (s.blunt > 0.6) opts.push(`E tu chi saresti? Non ho tempo da perdere con gli sconosciuti... ma parla pure.`);
        if (s.warm > 0.6) opts.push(`Salve, straniero! Benvenuto a ${this.cityName()}. Posso fare qualcosa per te?`);
        if (s.pious > 0.7) opts.push(`Che ${this.godName()} ti protegga, viandante. Cosa ti porta qui?`);
        if (p.title) opts.push(`Parla, straniero. Non capita spesso che qualcuno avvicini ${p.sex === 'F' ? 'una' : 'un'} ${p.title} così, senza cerimonie.`);
        opts.push(`Uno straniero... non se ne vedono molti da queste parti. Io sono ${p.name}.`);
        line = this.rng.pick(opts);
        this.remember('ci siamo conosciuti');
      }
      return line + '\n\n';
    }

    heardOfPlayer() {
      const p = this.p, world = this.world, rng = this.rng;
      // family lore: parents told about the player
      const father = world.people.get(p.fatherId), mother = world.people.get(p.motherId);
      for (const par of [father, mother]) {
        if (par && par.playerChats && par.playerChats.length && par.playerRel > 30) {
          return rng.pick([
            `Aspetta... quel viso. ${par.sex === 'M' ? 'Mio padre' : 'Mia madre'} ${par.name} mi parlava di uno straniero identico a te. Diceva che ${par.playerRel > 60 ? 'gli salvasti la vita, o quasi' : 'eravate amici'}. Ma... sono passati tanti anni. Chi sei davvero?`,
            `Tu... no, non può essere. ${par.sex === 'M' ? 'Mio padre' : 'Mia madre'} giurava che un giorno saresti tornato. Ti descriveva esattamente così.`,
          ]);
        }
      }
      if (world.player.fame > 40 && rng.chance(0.6)) {
        return rng.pick([
          `Un momento... tu sei ${world.player.name}, vero? Quello delle storie! ${rng.pick(['Dicono che tu non invecchi mai.', 'I cantastorie parlano di te.', 'Pensavo fossi solo una leggenda.'])}`,
          `*sgrana gli occhi* Il Viandante Eterno... esisti davvero. Le leggende erano vere.`,
        ]);
      }
      return null;
    }

    cityName() {
      const c = this.world.cities[this.p.cityId];
      return c ? c.name : 'queste terre';
    }

    // ---------- tone handlers ----------
    handleInsult(txt) {
      const p = this.p, rng = this.rng, world = this.world;
      const s = styleOf(p, world);
      p.playerRel = U.clamp(p.playerRel - rng.i(10, 20), -100, 100);
      p.feel('rabbia', 0.5);
      this.remember('mi ha insultato', -2);
      if (p.playerRel < -40 && !p.memories.some(m => m.t === 'torto' && m.text.includes('straniero'))) {
        p.addMemory(world.year, 'torto', `Quello straniero, ${world.player.name}, mi ha offeso profondamente. Non lo perdonerò`, 6);
      }
      if (s.blunt > 0.65 || p.traits.courage > 0.7) {
        return this.speak([
          `*ti fissa con odio* Ripetilo, se hai coraggio. A ${this.cityName()} chi parla così finisce male.`,
          `Come osi? Vattene, prima che chiami ${p.skills.combattimento > 0.4 ? 'la mia spada a rispondere per me' : 'le guardie'}.`,
          `Ah! E questo sarebbe il famoso straniero? Un ${rng.pick(['cane ringhioso', 'villano', 'buffone'])}. Fuori dalla mia vista.`,
        ]);
      }
      if (s.warm > 0.6) {
        return this.speak([
          `*ferito/a* Perché... perché mi parli così? Non ti ho fatto nulla di male.`.replace('/a', p.sex === 'F' ? 'a' : 'o'),
          `Le tue parole feriscono più delle lame, straniero. Speravo fossi diverso.`,
        ]);
      }
      return this.speak([
        `*si allontana di un passo* Non... non devo ascoltare queste cose. Addio.`,
        `Se sei venuto solo per offendere, hai finito qui.`,
      ]);
    }

    handlePraise() {
      const p = this.p, rng = this.rng;
      const s = styleOf(p, this.world);
      p.playerRel = U.clamp(p.playerRel + rng.i(4, 9), -100, 100);
      p.feel('gioia', 0.3);
      this.remember('mi ha trattato con gentilezza', 1);
      if (s.proud) return this.speak([
        `Finalmente qualcuno che riconosce il mio valore! Mi piaci, straniero. `,
        `Naturalmente. Ma fa piacere sentirlo dire. `,
      ]);
      if (s.warm > 0.6) return this.speak([
        `*arrossisce* Sei molto gentile... non capita spesso di sentire parole così. `,
        `Che parole dolci! Che ${this.godName()} ti benedica. `,
      ]);
      return this.speak([
        `Hm. Le lusinghe non si mangiano, ma... grazie. `,
        `Ti ringrazio, straniero. `,
      ]);
    }

    handlePromise(raw) {
      const p = this.p, world = this.world;
      const text = raw.length > 90 ? raw.slice(0, 90) + '…' : raw;
      p.playerPromises.push({ y: world.year, text, kept: null });
      this.remember(`mi ha promesso: "${text}"`, 1);
      p.playerRel = U.clamp(p.playerRel + 3, -100, 100);
      const trusting = p.traits.honesty > 0.5;
      return this.speak([
        trusting
          ? `Una promessa? *ti guarda negli occhi* D'accordo. Ma sappi che io non dimentico le promesse. Mai.`
          : `Promesse, promesse... ne ho sentite tante. Vedremo se sei diverso dagli altri.`,
        trusting
          ? `Terrò a mente le tue parole, ${world.player.name}. Da noi si dice che una promessa è un debito.`
          : `*alza un sopracciglio* Va bene. Ma le parole volano via col vento, straniero.`,
      ]);
    }

    handleHelp(raw) {
      const p = this.p, world = this.world, rng = this.rng;
      p.playerRel = U.clamp(p.playerRel + rng.i(8, 15), -100, 100);
      p.wealth += 5;
      p.feel('gioia', 0.4);
      this.remember('mi ha aiutato generosamente', 2);
      p.addMemory(world.year, 'gratitudine', `Lo straniero ${world.player.name} mi ha aiutato quando ne avevo bisogno. Non lo dimenticherò`, 7);
      world.player.fame += 1;
      world.player.deeds.push({ y: world.year, text: `Ha aiutato ${p.fullName} a ${this.cityName()}`, kind: 'aiuto' });
      // fulfil pending promise if any
      const pending = p.playerPromises.find(pr => pr.kept === null);
      if (pending) {
        pending.kept = true;
        p.playerRel = U.clamp(p.playerRel + 10, -100, 100);
        return this.speak([
          `*ti stringe la mano* Hai mantenuto la parola. Sai quanti l'avrebbero fatto? Nessuno. Da oggi sei ${p.sex === 'F' ? 'un\'amica' : 'un amico'} per me, ${world.player.name}.`,
        ]);
      }
      const s = styleOf(p, world);
      if (p.wealth < 15) return this.speak([
        `*quasi commosso* Io... non so cosa dire. Nessuno fa niente per niente, di solito. Grazie, ${world.player.name}. Se un giorno avrai bisogno, chiedi di ${p.name} a ${this.cityName()}.`,
      ]);
      return this.speak([
        `Sei generoso, straniero. ${s.pious > 0.5 ? `${this.godName()} ricompensa chi dona.` : 'Me ne ricorderò.'}`,
        `*accetta con un cenno del capo* Un gesto che non dimenticherò, ${world.player.name}.`,
      ]);
    }

    handleDivineClaim() {
      const p = this.p, world = this.world, rng = this.rng;
      const s = styleOf(p, world);
      // pious and trusting followers may actually found a cult of the player
      if (p.traits.piety > 0.65 && p.playerRel > 45 && !world.player.foundedReligionId && world.player.fame > 10) {
        const civ = world.civOf(p);
        const culture = world.cultures[civ.cultureId];
        const rel = new PCS.Religion(world.seed + ':playerrel:' + world.year, culture, p, world.year, null);
        rel.name = 'Culto di ' + world.player.name;
        rel.gods = [{ name: world.player.name, domain: 'il Viandante Eterno che cammina tra i mortali' }];
        rel.prophetName = p.fullName;
        rel.holyCityId = p.cityId;
        rel.mythos = `${world.player.name} apparve a ${p.fullName} a ${this.cityName()} e parlò con voce di mortale, pur essendo eterno`;
        world.religions.push(rel);
        world.player.foundedReligionId = rel.id;
        p.religionId = rel.id;
        p.title = p.sex === 'F' ? 'Profetessa' : 'Profeta';
        p.reputation += 50;
        world.player.fame += 30;
        p.addMemory(world.year, 'successo', `Ho riconosciuto la natura divina di ${world.player.name} e ho fondato il suo Culto`, 10);
        world.chronicle.add(world.year, 'religione', `${p.fullName} proclama la divinità dello straniero ${world.player.name}: nasce il Culto di ${world.player.name} a ${this.cityName()}!`, 9, { personIds: [p.id], name: `La Rivelazione di ${this.cityName()}` });
        this.remember('gli ho giurato fede eterna come mio dio', 2);
        return `*cade in ginocchio* Lo... lo sapevo. Lo sentivo! Nessun mortale parla come te, nessuno attraversa gli anni senza invecchiare! Da oggi io, ${p.fullName}, sarò ${p.sex === 'F' ? 'la tua profetessa' : 'il tuo profeta'}. Racconterò a tutti del giorno in cui ${world.player.name} camminò a ${this.cityName()}!`;
      }
      if (s.pious > 0.6) {
        p.feel('paura', 0.3);
        this.remember('ha bestemmiato dicendo di essere un dio', -1);
        p.playerRel = U.clamp(p.playerRel - 6, -100, 100);
        return this.speak([
          `*fa un gesto scaramantico* Non bestemmiare! ${this.godName()} punisce chi si finge divino. Anche se... c'è qualcosa di strano in te, lo ammetto.`,
          `Blasfemia! Eppure... *ti scruta* ...i tuoi occhi sono antichi. No, no. Non voglio pensarci.`,
        ]);
      }
      return this.speak([
        `*ride* Un dio, certo. E io sono ${rng.pick(['la regina della luna', 'l\'imperatore dei pesci'])}. Però sei divertente, straniero.`,
        `Ne ho conosciuti di matti, ma tu li batti tutti. ...Perché mi guardi così? Smettila.`,
      ]);
    }

    // ---------- identity ----------
    handleWhoAreYou() {
      const p = this.p, world = this.world, rng = this.rng;
      this.topicsDiscussed.add('me');
      const civ = world.civOf(p);
      const s = styleOf(p, world);
      const age = p.age(world.year);
      let out = `${this.moodPrefix()}${tic(p, world, rng)}Sono ${p.fullName}`;
      if (p.title) out += `, ${p.title} di ${civ ? civ.name : this.cityName()}`;
      out += `. ${age < 20 ? 'Ho' : age > 60 ? 'Porto sulle spalle' : 'Ho'} ${age} anni, ${p.profession !== 'bambino' && p.profession !== 'bambina' ? `faccio ${p.sex === 'F' ? 'la' : 'il'} ${p.profession}` : 'sono ancora giovane'} qui a ${this.cityName()}.`;
      if (s.verbose > 0.5) {
        out += ` La gente dice che sono ${p.personalityDesc(rng)}.`;
        const goal = p.goals.find(g => !g.done);
        if (goal && rng.chance(0.6)) out += ` Il mio sogno? ${U.cap(goal.text)}.`;
      }
      if (s.proud && p.reputation > 40) out += ` E se chiedi in giro di me, vedrai che il mio nome è rispettato.`;
      this.remember('gli ho chiesto chi fosse');
      return out;
    }

    handleWhoAmI() {
      const p = this.p, world = this.world, rng = this.rng;
      if (p.playerChats.length > 1) {
        const first = p.playerChats[0];
        const years = world.year - first.y;
        let out = `Se ti conosco? ${years > 0 ? `Ti conosco da ${years} anni, ${world.player.name}.` : `Ci siamo appena conosciuti, ma mi ricordo tutto.`}`;
        const notable = p.playerChats.filter(c => c.tone !== 0).slice(-2);
        for (const c of notable) out += ` Ricordo che ${c.gist}${c.y < world.year ? ` (era il ${U.yearLabel(c.y)})` : ''}.`;
        if (p.playerRel > 50) out += ` Per me sei ${p.sex === 'F' ? 'un amico prezioso' : 'un amico prezioso'}.`;
        else if (p.playerRel < -30) out += ` E francamente, preferirei non conoscerti affatto.`;
        return out;
      }
      return this.speak([
        `Non ti ho mai visto prima d'ora, straniero. Dovrei conoscerti?`,
        `Il tuo volto non mi dice nulla... anche se c'è qualcosa di strano in te.`,
      ]);
    }

    handleAge() {
      const p = this.p, world = this.world;
      const age = p.age(world.year);
      const s = styleOf(p, world);
      if (age > 65) return this.speak([
        `${age} inverni, straniero. Pochi arrivano a tanto, da queste parti. Ho seppellito quasi tutti quelli con cui sono ${p.sex === 'F' ? 'cresciuta' : 'cresciuto'}.`,
        `Sono del ${U.yearLabel(p.birthYear)}: fai i conti tu, io ormai li ho persi. *ride senza denti*`,
      ]);
      if (age < 16) return this.speak([
        `Ho ${age} anni! ${s.fearful ? 'La mamma dice di non parlare con gli stranieri...' : 'Quasi grande, no?'}`,
      ]);
      return this.speak([
        `${age} anni. Nato/a nel ${U.yearLabel(p.birthYear)}, qui${p.travelled ? '... anche se di strada ne ho fatta' : ' e qui probabilmente morirò'}.`.replace('/a', p.sex === 'F' ? 'a' : 'o'),
      ]);
    }

    // ---------- family ----------
    personRef(id) { return this.world.people.get(id); }

    handleParent(sex) {
      const p = this.p, world = this.world, rng = this.rng;
      const parent = this.personRef(sex === 'M' ? p.fatherId : p.motherId);
      const label = sex === 'M' ? 'Mio padre' : 'Mia madre';
      if (!parent) return `${label}? Non l'ho mai ${sex === 'M' ? 'conosciuto' : 'conosciuta'}. ${p.orphan ? 'Sono cresciuto tra mille difficoltà, e forse per questo sono quello che sono.' : 'È una storia che preferisco non raccontare.'}`;
      const mem = p.memories.find(m => m.subj && m.subj.includes(parent.id));
      let out;
      if (parent.alive) {
        out = `${label} si chiama ${parent.fullName}: fa ${parent.sex === 'F' ? 'la' : 'il'} ${parent.profession}, ha ${parent.age(world.year)} anni${parent.cityId === p.cityId ? ' e vive qui vicino' : ` e vive a ${world.cities[parent.cityId] ? world.cities[parent.cityId].name : 'altrove'}`}.`;
        if (p.relTo(parent.id) > 30) out += ` ${rng.pick(['Gli devo tutto.', 'Siamo molto legati.', 'È la mia roccia.'])}`;
        else if (p.relTo(parent.id) < -10) out += ` Non... non parliamo molto, a dire il vero. Vecchie ruggini.`;
      } else {
        out = `${label}, ${parent.fullName}, è ${sex === 'M' ? 'morto' : 'morta'} ${parent.deathYear ? `nel ${U.yearLabel(parent.deathYear)}` : 'anni fa'}${parent.deathCause === 'guerra' ? ', in guerra' : parent.deathCause === 'peste' || (parent.deathCause || '').includes('febbre') ? `, per ${parent.deathCause}` : parent.deathCause === 'vecchiaia' ? ', di vecchiaia' : parent.deathCause ? ` (${parent.deathCause})` : ''}.`;
        if (mem) out += ` ${rng.pick(['Ci penso ancora, sai?', 'Certe ferite non guariscono.', 'Il tempo aiuta, ma non cancella.'])}`;
        if (parent.deathCause === 'guerra') out += ` La guerra... la guerra si è presa più di quanto abbia mai restituito.`;
      }
      this.remember(`abbiamo parlato di ${sex === 'M' ? 'suo padre' : 'sua madre'}`);
      return this.moodPrefix() + out;
    }

    handleSpouse() {
      const p = this.p, world = this.world, rng = this.rng;
      const sp = this.personRef(p.spouseId);
      if (sp && sp.alive) {
        const relv = p.relTo(sp.id);
        let out = `${p.sex === 'M' ? 'Mia moglie' : 'Mio marito'} si chiama ${sp.fullName}. Ci siamo sposati ${(() => { const m = p.memories.find(m => m.t === 'matrimonio'); return m ? `nel ${U.yearLabel(m.y)}` : 'tanti anni fa'; })()}.`;
        if (relv > 40) out += ` ${rng.pick(['È la cosa migliore che mi sia capitata.', 'Dopo tutti questi anni, ancora mi sorprende.', 'Che altro dire? Sono fortunato.'])}`;
        else if (relv < 0) out += ` *abbassa la voce* Le cose... non vanno bene tra noi, se proprio vuoi saperlo. Ma sono affari nostri.`;
        else out += ` Un matrimonio come tanti: giorni buoni e giorni cattivi.`;
        return out;
      }
      const widowMem = p.memories.find(m => m.t === 'lutto' && /marito|moglie/.test(m.text));
      if (widowMem) return `${this.moodPrefix()}Ero ${p.sex === 'F' ? 'sposata' : 'sposato'}... ${widowMem.text.toLowerCase()}. ${rng.pick(['Da allora la casa è silenziosa.', 'Non mi sono più risposato.', 'C\'è un vuoto che nulla riempie.']).replace('risposato', p.sex === 'F' ? 'risposata' : 'risposato')}`;
      const betrayMem = p.memories.find(m => m.t === 'tradimento');
      if (betrayMem) return `*si irrigidisce* ${betrayMem.text}. Ecco tutto quello che c'è da dire sul matrimonio.`;
      const age = p.age(world.year);
      if (age < 20) return `Sposarmi? Sono giovane! ${p.traits.ambition > 0.6 ? 'Prima voglio costruirmi un futuro.' : 'Ma chissà, se incontro la persona giusta...'}`;
      return this.speak([
        `Non sono ${p.sex === 'F' ? 'sposata' : 'sposato'}. ${p.traits.empathy > 0.5 ? 'Il cuore non si comanda: aspetto ancora.' : 'E sto benissimo così, credimi.'}`,
      ]);
    }

    handleChildren() {
      const p = this.p, world = this.world, rng = this.rng;
      const kids = p.childrenIds.map(id => this.personRef(id)).filter(Boolean);
      if (!kids.length) {
        if (p.age(world.year) > 45) return this.speak([
          `Non ho avuto figli. ${p.traits.empathy > 0.5 ? 'È il mio più grande rimpianto, se devo essere sincero.' : 'Meglio così: il mondo è un posto crudele.'}`,
        ]);
        return `Figli non ne ho... ${p.spouseId ? 'ancora. Speriamo.' : 'e senza sposarmi, direi che è normale, no?'}`;
      }
      const alive = kids.filter(k => k.alive), dead = kids.filter(k => !k.alive);
      let out = `Ho ${kids.length === 1 ? `${kids[0].sex === 'F' ? 'una figlia' : 'un figlio'}` : kids.length + ' figli'}`;
      if (alive.length) out += `: ${alive.slice(0, 4).map(k => `${k.name}${k.age(world.year) >= 14 ? ` (${k.profession}, ${k.age(world.year)} anni)` : ` (${k.age(world.year)} anni)`}`).join(', ')}.`;
      else out += '.';
      if (dead.length) {
        out += ` ${dead.length === 1 ? `${dead[0].name} però non c'è più...` : `${dead.length} di loro non ci sono più...`} ${rng.pick(['Nessun genitore dovrebbe seppellire un figlio.', '*gli occhi si fanno lucidi* Perdonami, è dura parlarne.'])}`;
        p.feel('dolore', 0.2);
      } else if (p.traits.empathy > 0.5) {
        out += ` ${rng.pick(['Sono la mia gioia più grande.', 'Tutto quello che faccio, lo faccio per loro.'])}`;
      }
      this.remember('mi ha chiesto dei miei figli');
      return this.moodPrefix() + out;
    }

    handleSiblings() {
      const p = this.p, world = this.world;
      const sibs = [];
      for (const other of world.people.values()) {
        if (other.id !== p.id && ((p.fatherId != null && other.fatherId === p.fatherId) || (p.motherId != null && other.motherId === p.motherId))) sibs.push(other);
      }
      if (!sibs.length) return `Sono ${p.sex === 'F' ? 'figlia unica' : 'figlio unico'}. ${p.traits.empathy > 0.6 ? 'Avrei voluto dei fratelli, sai?' : 'E forse è stato meglio così.'}`;
      const alive = sibs.filter(s => s.alive);
      let out = `Siamo ${sibs.length + 1} in famiglia. `;
      if (alive.length) out += alive.slice(0, 3).map(s => `${s.sex === 'F' ? 'Mia sorella' : 'Mio fratello'} ${s.name}${s.alive ? ` fa ${s.sex === 'F' ? 'la' : 'il'} ${s.profession}` : ''}`).join('; ') + '.';
      const deadSib = sibs.find(s => !s.alive);
      if (deadSib) out += ` ${deadSib.sex === 'F' ? 'Mia sorella' : 'Mio fratello'} ${deadSib.name} ci ha lasciati${deadSib.deathCause === 'guerra' ? ': la guerra, maledetta guerra' : ''}.`;
      const rival = sibs.find(s => s.alive && p.relTo(s.id) < -20);
      if (rival) out += ` Con ${rival.name} però non ci parliamo: ${this.rng.pick(['questioni di eredità', 'una vecchia lite mai chiarita', 'siamo troppo diversi'])}.`;
      return out;
    }

    handleGrandparents() {
      const p = this.p, world = this.world;
      const gps = [];
      for (const pid of [p.fatherId, p.motherId]) {
        const par = this.personRef(pid);
        if (par) for (const gid of [par.fatherId, par.motherId]) {
          const gp = this.personRef(gid);
          if (gp) gps.push(gp);
        }
      }
      if (!gps.length) return `I miei nonni? Non li ho mai conosciuti. Erano di un'altra epoca... si dice fossero tra i fondatori di queste terre.`;
      const g = gps[0];
      let out = `${g.sex === 'F' ? 'Mia nonna' : 'Mio nonno'} ${g.fullName} ${g.alive ? `è ancora tra noi, ${g.age(world.year)} anni e una lingua tagliente` : `è ${g.sex === 'F' ? 'morta' : 'morto'} ${g.deathYear ? `nel ${U.yearLabel(g.deathYear)}` : 'tempo fa'}`}.`;
      if (gps.length > 1) out += ` Degli altri ricordo poco: storie davanti al fuoco, mani rugose, canzoni antiche.`;
      return out;
    }

    handleFamily() {
      // summary combining spouse+children
      const a = this.handleSpouse();
      const b = this.handleChildren();
      return a + '\n\n' + b;
    }

    handleFriends() {
      const p = this.p, world = this.world, rng = this.rng;
      const ids = p.friends();
      if (!ids.length) return this.speak([
        `Amici veri? ${p.traits.empathy < 0.4 ? 'Non ne ho bisogno. La gente delude, sempre.' : 'Pochi, pochissimi. La vita mi ha insegnato la prudenza.'}`,
      ]);
      const f = this.personRef(ids[0]);
      let out = `${f && f.alive ? `${f.fullName} è ${p.sex === 'F' ? 'la mia più cara amica... be\', amico' : 'il mio più caro amico'}: ${rng.pick(['ci conosciamo da una vita', 'abbiamo passato insieme momenti belli e terribili', 'è una delle poche persone di cui mi fido ciecamente'])}.` : 'I miei amici più cari non ci sono più, uno a uno se li è presi il tempo.'}`;
      if (ids.length > 1) out += ` E poi c'è ${(this.personRef(ids[1]) || {}).fullName || 'qualcun altro'}, certo.`;
      if (p.playerRel > 50) out += ` E ormai, ${world.player.name}, conto anche te tra loro.`;
      return out;
    }

    handleEnemies() {
      const p = this.p, world = this.world, rng = this.rng;
      const s = styleOf(p, world);
      const ids = p.enemies();
      const grudges = p.memoriesOfType('rivalita').concat(p.memoriesOfType('torto'));
      if (!ids.length && !grudges.length) return this.speak([
        `Nemici? ${s.warm > 0.5 ? 'Cerco di non farmene. La vita è già abbastanza dura.' : 'Nessuno che sia ancora vivo.'} `,
      ]);
      if (ids.length) {
        const e = this.personRef(ids[0]);
        if (e) {
          const mem = grudges.find(m => m.subj && m.subj.includes(e.id));
          let out = `*abbassa la voce* C'è una persona... ${e.fullName}. ${mem ? mem.text + '.' : rng.pick(['Vecchie storie che non ti riguardano.', 'Diciamo che se sparisse domani non piangerei.'])}`;
          if (s.blunt > 0.6) out += ` Se lo incontri, digli pure che l'ho detto. Non ho paura.`;
          else out += ` Ma non dirlo in giro, ti prego.`;
          this.remember('mi ha confidato chi sono i suoi nemici', 1);
          return out;
        }
      }
      return `${this.moodPrefix()}${grudges[0].text}. Ecco chi sono i miei nemici. ${p.traits.courage > 0.6 ? 'E prima o poi, i conti si pagano.' : 'Ma io sono una persona tranquilla: lascio fare al destino.'}`;
    }

    handleLove() {
      const p = this.p, world = this.world, rng = this.rng;
      if (p.spouseId) return this.handleSpouse();
      const crush = Object.entries(p.rel).filter(([id, v]) => {
        const o = this.personRef(+id);
        return v > 25 && o && o.alive && o.sex !== p.sex && !o.spouseId && Math.abs(o.age(world.year) - p.age(world.year)) < 15;
      })[0];
      if (crush && p.traits.honesty > 0.4) {
        const o = this.personRef(+crush[0]);
        this.remember('mi ha confidato di chi è innamorato', 1);
        return `*si guarda intorno e sussurra* C'è... c'è ${o.sex === 'F' ? 'una donna' : 'un uomo'}. ${o.name}. ${rng.pick(['Ogni volta che passa, il cuore mi impazzisce.', 'Ma non ho ancora trovato il coraggio di parlarle... cioè, di parlargli... insomma, hai capito.', 'Non dirlo a nessuno, ti prego!'])}`;
      }
      return this.speak([
        `L'amore... ${p.age(world.year) > 50 ? 'roba da giovani. Io ormai amo solo il mio focolare.' : rng.pick(['non è ancora bussato alla mia porta.', 'è un lusso che non posso permettermi, con i tempi che corrono.', 'Chissà. Il destino ha i suoi tempi.'])}`,
      ]);
    }

    // ---------- daily life ----------
    handleWork() {
      const p = this.p, world = this.world, rng = this.rng;
      const s = styleOf(p, world);
      const city = world.cities[p.cityId];
      const age = p.age(world.year);
      if (age < 14) return `Sono troppo piccolo per lavorare! Aiuto in casa, e gioco ${rng.pick(['al fiume', 'vicino alle mura', 'nei campi'])}.`;
      let out = `Faccio ${p.sex === 'F' ? 'la' : 'il'} ${p.profession}${p.skills.lavoro > 0.8 ? ', e senza falsa modestia: sono tra i migliori' : p.skills.lavoro < 0.3 ? '... si fa quel che si può' : ''}.`;
      const mem = p.memoriesOfType('lavoro')[0];
      if (mem && s.verbose > 0.4) out += ` ${mem.text}.`;
      if (city && city.famine) out += ` Ma con la carestia, il lavoro è l'ultimo dei problemi: si pensa solo a mangiare.`;
      else if (city && city.prosperity > 0.7) out += ` E di questi tempi gli affari vanno bene: ${city.name} prospera.`;
      else if (city && city.prosperity < 0.3) out += ` Tempi duri però: si tira la cinghia.`;
      this.remember('abbiamo parlato del suo lavoro');
      return this.moodPrefix() + out;
    }

    handleWealth() {
      const p = this.p, rng = this.rng;
      const s = styleOf(p, this.world);
      // people lie about money
      if (s.liar && p.wealth > 100) return `*allarga le braccia* Ricco io? Ma se non ho neanche gli occhi per piangere! Sono tempi durissimi... *le sue vesti dicono altro*`;
      if (p.wealth > 200) return this.speak([
        `${s.proud ? 'Non mi lamento: ho lavorato una vita e si vede.' : 'Diciamo che non mi manca nulla, per grazia degli dèi.'} Ma la ricchezza attira invidie: meglio parlarne poco.`,
      ]);
      if (p.wealth < 15) return this.speak([
        `*ride amaro* Guardami: ti sembro ricco? Ho ${Math.round(p.wealth)} monete si e no. ${p.traits.ambition > 0.6 ? 'Ma un giorno le cose cambieranno, te lo giuro.' : 'Ma si campa lo stesso.'}`,
      ]);
      return `Né ricco né povero: quel che basta per ${rng.pick(['il pane e un tetto', 'vivere con dignità', 'non dover chiedere niente a nessuno'])}.`;
    }

    handleCity() {
      const p = this.p, world = this.world, rng = this.rng;
      const city = world.cities[p.cityId];
      if (!city) return 'Non ho più una casa, straniero. Sono solo ombra e polvere di strada.';
      const civ = world.civs[city.civId];
      let out = `${city.name}? ${rng.pick([`È casa mia${city.foundedYear < p.birthYear ? ', da sempre' : ''}`, 'Che vuoi che ti dica: è casa'])}. Fa parte di ${civ.name}, ${U.fmt(city.pop)} anime circa.`;
      const bits = [];
      if (city.famine) bits.push('la carestia ci sta piegando: i granai sono vuoti e i bambini piangono');
      if (city.plague) bits.push(`la ${city.plague.name} miete vittime ogni settimana: si bruciano erbe amare agli angoli delle strade`);
      if (city.unrest > 0.5) bits.push('l\'aria è tesa: la gente mormora contro chi comanda');
      if (city.prosperity > 0.7) bits.push('il mercato trabocca di merci e si costruisce ovunque');
      if (city.buildings.includes('porto')) bits.push('il porto è pieno di vele straniere');
      if (city.walls > 1) bits.push('le nostre mura hanno respinto più di un esercito');
      if (bits.length) out += ' Di questi tempi ' + rng.pick(bits) + '.';
      const res = city.resourcesNearby(world);
      if (res.length && rng.chance(0.5)) out += ` Da queste parti si vive di ${res.slice(0, 2).join(' e ')}.`;
      this.remember('mi ha parlato della sua città');
      return out;
    }

    handleReligion() {
      const p = this.p, world = this.world, rng = this.rng;
      const s = styleOf(p, world);
      const rel = p.religionId != null ? world.religions[p.religionId] : null;
      if (!rel) return `Credo... credo in quello che vedo: la terra, la pioggia, le stagioni. Gli dèi, se ci sono, non si sono mai fatti vivi con me.`;
      let out;
      if (s.pious > 0.6) {
        out = `${tic(p, world, rng)}Seguo la ${rel.name}. ${rel.gods.length === 1 ? `${rel.gods[0].name} è ${rel.gods[0].domain === 'di tutte le cose' ? 'l\'unico vero dio' : 'il dio ' + rel.gods[0].domain}` : `Venero soprattutto ${rel.gods[0].name}, ${rel.gods[0].domain}`}. ${rng.pick([`Il ${rel.rites[0]}: ecco cosa mi tiene in piedi nei giorni bui.`, `Sta scritto nel ${rel.sacredText}: chi ha fede non cammina mai solo.`, `Da noi si insegna ${rel.tenets[0]}.`])}`;
        if (rng.chance(0.4)) out += ` E quando morirò? ${U.cap(rel.afterlife)}: così ci è stato promesso.`;
      } else if (p.traits.piety < 0.3) {
        out = `*si stringe nelle spalle* Ufficialmente seguo la ${rel.name}, come tutti qui. Tra me e te? ${rng.pick(['I sacerdoti mangiano bene e lavorano poco, ecco cosa penso.', 'Ho visto troppi innocenti morire per credere davvero.', 'Vado al tempio per non dare nell\'occhio, nient\'altro.'])} Ma non ripeterlo in giro.`;
        this.remember('mi ha confessato i suoi dubbi sulla fede', 1);
      } else {
        out = `Seguo la ${rel.name}, la fede ${rng.pick(['dei miei padri', 'di questa città'])}. Il profeta fu ${rel.prophetName}, e si narra che ${rel.mythos}.`;
      }
      return out;
    }

    handlePolitics() {
      const p = this.p, world = this.world, rng = this.rng;
      const civ = world.civOf(p);
      if (!civ) return 'Politica? Io non ho più patria, straniero.';
      const s = styleOf(p, world);
      const know = worldliness(p, world);
      const leader = world.people.get(civ.leaderId);
      const gi = civ.govInfo();
      let out = `Qui comanda ${leader ? `${leader.title} ${leader.fullName}` : 'nessuno, al momento: tempi confusi'}: siamo una ${gi.name.toLowerCase()} (${civ.name}).`;
      // personal opinion, colored by memories & traits
      if (leader) {
        const hate = p.memories.some(m => m.subj && m.subj.includes(leader.id) && (m.t === 'torto' || m.t === 'rivalita')) || p.relTo(leader.id) < -20;
        if (hate) {
          out += ` E se vuoi la mia... ${s.fearful ? '*sussurra* ' : ''}lo detesto. ${rng.pick(['Ha le mani sporche, credimi.', 'Un giorno pagherà per quello che ha fatto.', 'Sotto di lui, la gente comune conta meno del fango.'])}`;
          this.remember('mi ha detto che odia chi governa', 1);
        } else if (civ.stability > 0.6 && p.traits.ambition < 0.6) {
          out += ` ${rng.pick(['Tutto sommato si vive: le strade sono sicure e il pane arriva.', 'Non mi lamento: c\'è chi sta molto peggio.', 'Che gli dèi lo conservino, o almeno che non peggiori.'])}`;
        } else {
          out += ` ${rng.pick(['Mah... le tasse salgono e le promesse volano.', 'La stabilità è una coperta corta, di questi tempi.', 'Diciamo che non mi faccio sentire troppo quando parlo di lui.'])}`;
        }
      }
      // distant politics: only worldly people know
      if (know > 0.5) {
        const others = world.civs.filter(c => !c.dead && c.id !== civ.id);
        if (others.length) {
          const o = rng.pick(others);
          const rel = civ.relTo(o.id);
          out += ` Quanto al mondo là fuori: con ${o.name} ${rel > 30 ? 'siamo in ottimi rapporti, quasi fratelli' : rel < -30 ? 'l\'aria è pesante: ci sarà da combattere, prima o poi' : 'ci si tollera, né amici né nemici'}.`;
        }
      } else if (rng.chance(0.5)) {
        out += ` Degli intrighi dei regni lontani non so nulla: io conosco ${rng.pick(['il mio campo e la mia strada', 'la mia bottega e poco altro'])}. Chiedi a un mercante, o a chi ha studiato.`;
      }
      return out;
    }

    handleWar() {
      const p = this.p, world = this.world, rng = this.rng;
      const civ = world.civOf(p);
      const wars = world.wars.filter(w => !w.endYear && civ && (w.attackerId === civ.id || w.defenderId === civ.id));
      const warMems = p.memoriesOfType('guerra');
      let out = '';
      if (wars.length) {
        const w = wars[0];
        const foe = world.civs[w.attackerId === civ.id ? w.defenderId : w.attackerId];
        out = `${this.moodPrefix()}Siamo in guerra, sì: la ${w.name}, contro ${foe ? foe.name : 'un nemico spietato'}. È iniziata nel ${U.yearLabel(w.startYear)} per ${w.cause}. `;
        out += p.traits.courage > 0.6
          ? rng.pick(['E vinceremo, dovessi impugnare la lancia io stesso.', 'Il nemico imparerà a temerci.'])
          : rng.pick(['Ho paura, te lo confesso. Ogni settimana arrivano nomi di caduti.', 'Prego solo che finisca presto. La guerra non risparmia nessuno.']);
      } else if (warMems.length) {
        const m = warMems[0];
        out = `${this.moodPrefix()}Ora c'è pace, per fortuna. Ma io la guerra l'ho vista: ${m.text.toLowerCase()}. ${p.veteran ? rng.pick(['Certe notti sento ancora le urla.', 'Chi non c\'era non può capire.', 'Ho fatto cose di cui non vado fiero.']) : 'E spero di non vederla mai più.'}`;
        if (p.veteran) this.remember('mi ha raccontato della guerra che ha combattuto', 1);
      } else {
        const pastWars = world.wars.filter(w => w.endYear && civ && (w.attackerId === civ.id || w.defenderId === civ.id)).slice(-1);
        if (pastWars.length && worldliness(p, world) > 0.3) {
          const w = pastWars[0];
          out = `Ora è tempo di pace. I vecchi però raccontano ancora della ${w.name} (${U.yearLabel(w.startYear)}–${U.yearLabel(w.endYear)}): ${U.fmt(w.deaths)} morti, dicono. ${rng.pick(['Che non si ripeta mai.', 'I confini di oggi sono scritti con quel sangue.'])}`;
        } else {
          out = `Guerra? Qui no, grazie agli dèi. ${rng.pick(['E che duri.', 'Si sente di scontri in terre lontane, ma sono solo voci di mercanti.'])}`;
        }
      }
      return out;
    }

    handleMemories() {
      const p = this.p, world = this.world, rng = this.rng;
      const tops = p.topMemories(6).filter(m => !this.topicsDiscussed.has('mem' + m.y + m.t));
      if (!tops.length) return this.speak([
        `Ti ho già raccontato tutto quello che conta della mia vita, straniero. Il resto sono giorni uguali ad altri giorni.`,
      ]);
      const m = rng.pick(tops.slice(0, 3));
      this.topicsDiscussed.add('mem' + m.y + m.t);
      let out = `${this.moodPrefix()}${tic(p, world, rng)}`;
      const intro = {
        lutto: ['C\'è un dolore che porto sempre con me: ', 'Se chiudo gli occhi, rivedo tutto: '],
        guerra: ['La guerra lascia segni che non si vedono: ', 'Te lo racconto, ma non chiedermi i dettagli: '],
        matrimonio: ['Il giorno più bello? Facile: ', 'Ah, questa è una storia dolce: '],
        nascita: ['Il ricordo più luminoso: ', ''],
        eroismo: ['Non amo vantarmi, ma una cosa la dirò: ', 'Una volta ho fatto qualcosa di buono: '],
        trauma: ['*esita a lungo* Ci sono notti in cui ancora sogno quel giorno: ', 'Non ne parlo quasi mai, ma... '],
        successo: ['Con orgoglio posso dire: ', ''],
        infanzia: ['Che tempi, l\'infanzia: ', 'Ricordo bene: '],
        viaggio: ['Ho conosciuto il mondo, sai: ', ''],
        gratitudine: ['C\'è un debito che non potrò mai ripagare: ', ''],
        crimine: ['*si assicura che nessuno ascolti* Se te lo dico, resta tra noi: ', ''],
        malattia: ['Il mio corpo ricorda: ', ''],
        tradimento: ['*il volto si indurisce* ', ''],
        rivalita: ['', ''],
        torto: ['*stringe i denti* ', ''],
        studio: ['', ''],
        lavoro: ['', ''],
        storia: ['Ho visto la storia coi miei occhi: ', ''],
        amicizia: ['', ''],
      };
      out += rng.pick(intro[m.t] || ['']) + m.text + ` (${U.yearLabel(m.y)}, avevo ${Math.max(0, m.y - p.birthYear)} anni).`;
      if (m.t === 'crimine') { p.secretShared = true; this.remember('mi ha confessato un segreto terribile', 2); }
      else this.remember('mi ha raccontato ricordi della sua vita');
      return out;
    }

    handleHistory() {
      const p = this.p, world = this.world, rng = this.rng;
      const know = worldliness(p, world);
      const age = p.age(world.year);
      // events within lifetime OR famous (imp>=8) if educated
      const canKnow = world.chronicle.events.filter(e =>
        (e.y >= p.birthYear && e.imp >= 4) || (e.imp >= 8 && know > 0.5));
      if (!canKnow.length) return `La storia la lascio ai cantastorie. Io conosco solo le mie giornate.`;
      const picks = rng.shuffle(canKnow.slice(-140)).slice(0, 2);
      let out = know > 0.6
        ? `${tic(p, world, rng)}Qualcosa la so, sì. `
        : `Io non sono ${p.sex === 'F' ? 'una studiosa' : 'uno studioso'}, ma certe cose le ricorda chiunque. `;
      for (const e of picks) {
        const seen = e.y >= p.birthYear && e.y <= world.year;
        out += `${seen && age - (world.year - e.y) > 8 ? `Nel ${U.yearLabel(e.y)} — me lo ricordo bene — ` : `Si racconta che nel ${U.yearLabel(e.y)} `}${e.text} `;
      }
      if (know < 0.35 && rng.chance(0.4)) out += `Ma prendi le mie parole con cautela: le storie cambiano a ogni bocca che le racconta.`;
      this.remember('abbiamo parlato di storia');
      return out;
    }

    handleFeelings() {
      const p = this.p, world = this.world, rng = this.rng;
      const emo = p.dominantEmotion();
      const city = world.cities[p.cityId];
      const map = {
        gioia: [`Sto bene, davvero! ${city && city.prosperity > 0.6 ? 'La città prospera, la famiglia è in salute...' : 'Nonostante tutto, il cuore è leggero.'} Che chiedere di più?`],
        dolore: [`*sospira a lungo* Si tira avanti. ${p.memories.filter(m => m.t === 'lutto').length ? 'Ho perso persone care, e certe assenze pesano ogni giorno.' : 'Sono giorni grigi, ecco.'}`],
        rabbia: [`*a denti stretti* Sto come chi ha ingoiato un rospo. ${rng.pick(['Meglio se non chiedi.', 'C\'è chi mi deve delle scuse, ecco tutto.'])}`],
        paura: [`*si guarda intorno* Non... non è un buon momento. ${city && city.plague ? 'Con la pestilenza in giro, ogni colpo di tosse è una condanna.' : city && world.wars.some(w => !w.endYear && (w.attackerId === city.civId || w.defenderId === city.civId)) ? 'La guerra ci tiene tutti col fiato sospeso.' : 'Ho brutti presentimenti, ultimamente.'}`],
        calma: [`Non mi lamento. ${rng.pick(['Un giorno dopo l\'altro, come le stagioni.', 'La vita scorre tranquilla, e va bene così.'])}`],
      };
      this.remember('mi ha chiesto come stavo');
      return this.speak(map[emo] || map.calma);
    }

    handleHealth() {
      const p = this.p, world = this.world, rng = this.rng;
      const age = p.age(world.year);
      if (p.sick) return `${this.moodPrefix()}Non bene, a dirtela tutta: ho ${p.sick.name}. ${world.civOf(p) && world.civOf(p).techs.includes('medicina') ? 'Il medico dice che ne uscirò, ma intanto...' : rng.pick(['Il guaritore mi ha dato erbe amare e preghiere.', 'Mi affido agli dèi: che altro posso fare?'])}`;
      if (age > 60) return `Per la mia età? Benone! ${rng.pick(['Qualche acciacco, ossa che scricchiolano come una vecchia nave, ma la testa funziona.', 'Sono sopravvissuto a tutto: figurati se mi abbatte un raffreddore.'])}`;
      if (p.health < 0.5) return `Così così... ${rng.pick(['una vecchia malattia mi ha lasciato debole.', 'non sono più forte come un tempo.'])}`;
      return `Sano come un pesce, grazie agli dèi. ${p.traits.courage > 0.6 ? 'E pronto a tutto.' : 'E che duri.'}`;
    }

    handleDreams() {
      const p = this.p, world = this.world, rng = this.rng;
      const active = p.goals.filter(g => !g.done);
      const done = p.goals.filter(g => g.done);
      let out = '';
      if (active.length) {
        out = `${tic(p, world, rng)}Il mio sogno? ${U.cap(active[0].text)}. ${rng.pick(['Ci penso ogni giorno.', 'Riderai, ma è quello che mi tiene in piedi.', 'Un giorno ci arriverò, vedrai.'])}`;
        if (active.length > 1 && styleOf(p, world).verbose > 0.5) out += ` E poi, certo, vorrei anche ${active[1].text}.`;
      } else if (done.length) {
        out = `Ho già avuto dalla vita quello che sognavo: ${done[0].text}. ${p.age(world.year) > 50 ? 'Ora sogno solo tramonti tranquilli.' : 'Ora si vive e basta, ed è già molto.'}`;
      } else {
        out = `Sogni... ${rng.pick(['sopravvivere è già un mestiere a tempo pieno, da queste parti.', 'una volta ne avevo. Poi la vita ha deciso altrimenti.'])}`;
      }
      this.remember('mi ha confidato i suoi sogni', 1);
      return out;
    }

    handleFears() {
      const p = this.p, world = this.world, rng = this.rng;
      const city = world.cities[p.cityId];
      const fears = [];
      if (city && city.plague) fears.push(`la ${city.plague.name}: ogni mattina conto i vivi`);
      if (city && world.wars.some(w => !w.endYear && (w.attackerId === city.civId || w.defenderId === city.civId))) fears.push('questa guerra: che si prenda i miei cari');
      if (city && city.famine) fears.push('la fame: ho visto cosa fa alle persone');
      if (p.childrenIds.length) fears.push(`che accada qualcosa ai miei figli`);
      if (p.memoriesOfType('trauma').length) fears.push(`che torni ciò che ho già vissuto: ${p.memoriesOfType('trauma')[0].text.toLowerCase()}`);
      if (p.traits.piety > 0.6) fears.push(`l'ira di ${this.godName()}`);
      if (!fears.length) fears.push(rng.pick(['la vecchiaia che avanza', 'di essere dimenticato', 'i lupi d\'inverno', 'niente: la paura è un lusso']));
      this.remember('mi ha confidato le sue paure', 1);
      return `${this.moodPrefix()}Di cosa ho paura? ${U.cap(rng.pick(fears))}. ${p.traits.courage > 0.65 ? 'Ma la paura si guarda in faccia, non le si dà la schiena.' : 'Te lo dico perché mi sembri una persona fidata.'}`;
    }

    handleSecrets() {
      const p = this.p, world = this.world, rng = this.rng;
      if (p.playerRel < 25) return this.speak([
        `*ti squadra* I segreti si confidano agli amici, straniero. E noi due ci conosciamo appena.`,
        `E perché dovrei dirti i fatti miei? ${p.traits.honesty < 0.4 ? 'Tutti hanno qualcosa da nascondere. Anche tu, scommetto.' : 'Non offenderti, ma la prudenza non è mai troppa.'}`,
      ]);
      const secret = p.memories.find(m => m.t === 'crimine') || p.memories.find(m => m.imp >= 8 && (m.t === 'tradimento' || m.t === 'trauma'));
      if (secret && !p.secretShared) {
        p.secretShared = true;
        p.playerRel = U.clamp(p.playerRel + 5, -100, 100);
        this.remember('mi ha confidato il suo segreto più oscuro', 2);
        return `*ti prende in disparte, voce bassissima* Va bene. Te lo dico perché... perché mi fido, e questo peso mi schiaccia da anni. ${secret.text}. Ecco. Ora lo sai. Se lo racconti a qualcuno, negherò tutto.`;
      }
      if (p.secretShared) return `Ti ho già affidato il mio segreto, ${world.player.name}. Non costringermi a ripeterlo nemmeno a bassa voce.`;
      return this.speak([
        `Segreti? *sorride appena* La mia vita è un libro aperto... be', quasi. Ma le pagine strappate restano strappate.`,
        `Ho solo piccole vergogne come tutti: ${rng.pick(['una volta ho rubato mele al vicino', 'da giovane fuggii da una rissa', 'annacquo il vino quando vengono ospiti che non sopporto'])}. Deluso?`,
      ]);
    }

    handleGossip() {
      const p = this.p, world = this.world, rng = this.rng;
      const city = world.cities[p.cityId];
      if (!city) return 'Le voci corrono dove c\'è gente. Io non ho più nessuno.';
      const folks = city.people(world).filter(o => o.id !== p.id && o.alive);
      const bits = [];
      // real gossip generated from actual state
      const rich = folks.find(o => o.wealth > 150);
      if (rich) bits.push(`si dice che ${rich.fullName} nasconda un tesoro sotto il pavimento... io dico solo che spende troppo per uno col suo mestiere`);
      const widow = folks.find(o => !o.spouseId && o.memories.some(m => m.t === 'lutto' && /marito|moglie/.test(m.text)));
      const single = folks.find(o => !o.spouseId && o.age(world.year) > 25 && o.age(world.year) < 45);
      if (widow && single && widow.id !== single.id) bits.push(`pare che ${widow.name} e ${single.name} si vedano di nascosto... ma non l'hai saputo da me`);
      const criminal = folks.find(o => o.killCount > 0);
      if (criminal && rng.chance(0.5)) bits.push(`girano brutte voci su ${criminal.fullName}: c'è chi giura che abbia le mani sporche di sangue`);
      const leader = world.people.get((world.civOf(p) || {}).leaderId);
      if (leader && rng.chance(0.4)) bits.push(`a palazzo si mormora che ${leader.title} ${leader.name} ${rng.pick(['non chiuda occhio la notte', 'non si fidi più nemmeno delle sue guardie', 'abbia un erede segreto'])}`);
      const sickOne = folks.find(o => o.sick);
      if (sickOne) bits.push(`la famiglia di ${sickOne.name} è in pena: ${sickOne.sex === 'F' ? 'la poveretta' : 'il poveretto'} è a letto con ${sickOne.sick.name}`);
      // false rumor: dishonest or gullible people spread inaccurate news
      if ((p.traits.honesty < 0.4 || p.traits.intelligence < 0.35) && rng.chance(0.5)) {
        bits.push(rng.pick([
          `un pastore giura di aver visto un drago sulle montagne. Io ci credo poco... però due capre sono sparite davvero`,
          `dicono che nel regno vicino il re sia morto e lo tengano nascosto per paura della guerra. Chissà`,
          `un mercante raccontava di una città d'oro oltre il mare. Frottole, probabilmente. Probabilmente...`,
        ]));
      }
      if (!bits.length) bits.push('per una volta, tutto tace. Brutto segno: quando tutto tace, qualcosa bolle in pentola');
      this.remember('mi ha chiesto i pettegolezzi del posto');
      return `*si avvicina con aria complice* Vuoi le voci di ${city.name}? Allora: ${rng.pick(bits)}.`;
    }

    handleTrade() {
      const p = this.p, world = this.world, rng = this.rng;
      const city = world.cities[p.cityId];
      const civ = world.civOf(p);
      if (!city || !civ) return 'Il mercato più vicino è lontano da qui, temo.';
      if (!civ.techs.includes('moneta')) return `Monete? Qui si baratta, straniero: ${rng.pick(['pelli contro grano', 'sale contro utensili', 'una capra vale tre sacchi d\'orzo'])}. Le monete sono roba da popoli lontani.`;
      const isMerchant = /mercant|commerc|banchier/.test(p.profession);
      let out = isMerchant
        ? `${tic(p, world, rng)}Hai trovato ${p.sex === 'F' ? 'la persona giusta' : 'l\'uomo giusto'}! Ascolta i prezzi di oggi a ${city.name}: `
        : `Di mercato ne capisco quanto basta per fare la spesa. Ma i prezzi li conosco, eccome: `;
      out += `il grano va a ${city.prices.grano} monete, gli utensili a ${city.prices.utensili}, le stoffe a ${city.prices.stoffe}, i metalli a ${city.prices.metalli}.`;
      if (city.prices.grano > 2.5) out += ` Il grano è alle stelle${city.famine ? ': con la carestia c\'è chi vende i mobili per un sacco di farina' : ': qualcuno sta speculando, ci giurerei'}.`;
      if (isMerchant && city.tradeRoutes.length) {
        const dest = world.cities[city.tradeRoutes[0]];
        if (dest) out += ` Io commercio soprattutto con ${dest.name}: ${rng.pick(['viaggio due volte l\'anno, pirati permettendo', 'buoni affari, se il tempo regge'])}.`;
      }
      this.remember('abbiamo parlato di commerci e prezzi');
      return out;
    }

    handleTech() {
      const p = this.p, world = this.world, rng = this.rng;
      const civ = world.civOf(p);
      if (!civ) return 'Non saprei, straniero.';
      const recent = civ.techs.slice(-3).map(id => PCS.TECH_BY_ID[id]);
      const know = worldliness(p, world);
      let out;
      if (know > 0.5) {
        out = `${tic(p, world, rng)}Viviamo tempi straordinari: ${civ.name} conosce ormai ${recent.map(t => t.name.toLowerCase()).join(', ')}.`;
        if (civ.researching) out += ` E i sapienti sono al lavoro su qualcosa di nuovo: si parla di "${PCS.TECH_BY_ID[civ.researching].name}".`;
      } else {
        const t = recent[recent.length - 1];
        out = `Io so fare il mio mestiere, il resto lo lascio ai sapienti. Però ho visto ${t ? `con i miei occhi ${t.name.toLowerCase()}: roba che i nonni non avrebbero creduto` : 'poco e niente, a dire il vero'}.`;
      }
      return out;
    }

    handleCulture() {
      const p = this.p, world = this.world, rng = this.rng;
      const civ = world.civOf(p);
      if (!civ) return '...';
      const cu = world.cultures[civ.cultureId];
      const opts = [
        `Da noi ${cu.demonym} si tramanda che ${cu.traditions[0]}, e che ${cu.traditions[1]}.`,
        `Vuoi conoscerci davvero? Vieni alla ${cu.festivals[0].name}: si celebra ${cu.festivals[0].reason} con ${cu.music}. ${p.traits.empathy > 0.5 ? 'Ti farò posto accanto alla mia famiglia.' : ''}`,
        `Il nostro simbolo è ${cu.symbol}: lo trovi inciso su ogni porta. Per noi contano ${cu.values.join(', ')}: chi li tradisce è perduto.`,
        `Le nostre case? ${U.cap(cu.architecture)}. I nostri abiti? ${U.cap(cu.clothing)}. Ci riconosci ovunque, noi ${cu.demonym}.`,
        `Le leggende dicono che ${cu.mythology || 'il mondo nacque dal silenzio'}. Da bambino mi faceva paura; adesso... adesso un po' ci credo.`,
      ];
      this.remember('mi ha raccontato le tradizioni della sua gente');
      return `${tic(p, world, rng)}${rng.pick(opts)}`;
    }

    handleFood() {
      const p = this.p, world = this.world, rng = this.rng;
      const civ = world.civOf(p);
      const cu = civ ? world.cultures[civ.cultureId] : null;
      const city = world.cities[p.cityId];
      if (city && city.famine) return `${this.moodPrefix()}Non parlarmi di cibo, ti prego... con questa carestia sogno ${cu ? cu.foods[0] : 'il pane'} anche di giorno. I bambini masticano radici.`;
      if (!cu) return 'Quel che c\'è, si mangia.';
      return this.speak([
        `Da noi si mangia ${cu.foods[0]} e ${cu.foods[1]}, e si beve ${cu.foods[2]}. ${p.traits.empathy > 0.6 ? 'Resta a cena, se vuoi: dove mangiano quattro, mangiano cinque.' : 'Roba semplice, ma onesta.'}`,
        `${cu.foods[0]}! ${rng.pick(['Come lo faceva mia madre, nessuno.', 'Con una brocca di ' + cu.foods[2] + ', è il paradiso dei poveri.'])}`,
      ]);
    }

    handleNature() {
      const p = this.p, world = this.world, rng = this.rng;
      const city = world.cities[p.cityId];
      const season = PCS.SEASONS[world.season];
      let out = `Siamo in ${season.toLowerCase()}${season === 'Inverno' ? ': si sta vicini al fuoco e si raccontano storie' : season === 'Autunno' ? ': tempo di raccolto, le giornate si accorciano' : season === 'Estate' ? ': il sole spacca le pietre' : ': tutto rinasce, e anche l\'umore migliora'}.`;
      if (city) {
        const nearAnimals = world.animals.filter(a => !a.extinct && U.dist(a.x, a.y, city.x, city.y) < 30);
        if (nearAnimals.length) {
          const a = rng.pick(nearAnimals);
          if (a.type === 'predatore') out += ` Occhio ai ${a.species}, se viaggi: ${a.count > 100 ? 'quest\'anno sono tanti e affamati' : 'ce ne sono ancora, anche se pochi'}. ${p.traits.courage > 0.6 ? 'Io non li temo, ma tu vai armato.' : 'Io dopo il tramonto non esco.'}`;
          else out += ` I cacciatori dicono che i ${a.species} ${a.count > 800 ? 'abbondano: carne per tutti quest\'anno' : 'scarseggiano: brutte notizie per l\'inverno'}.`;
        }
        const extinct = world.animals.find(a => a.extinct && U.dist(a.x, a.y, city.x, city.y) < 40);
        if (extinct && rng.chance(0.4)) out += ` Pensa che i ${extinct.species} da queste parti non ci sono più: mio nonno li cacciava, io non ne ho mai visto uno.`;
      }
      return out;
    }

    handleTravel() {
      const p = this.p, world = this.world, rng = this.rng;
      const travelMems = p.memoriesOfType('viaggio');
      if (travelMems.length) {
        return `${tic(p, world, rng)}${travelMems[0].text}. ${rng.pick(['Il mondo è grande e strano, straniero: più di quanto si creda qui.', 'Viaggiare apre gli occhi, ma li riempie anche di polvere.'])}`;
      }
      if (p.travelled) return `Ho girato un po', sì. ${rng.pick(['Ho visto città dove le nostre mura sembrerebbero staccionate.', 'Ma alla fine si torna sempre dove batte il cuore.'])}`;
      return this.speak([
        `Mai uscito da ${this.cityName()} e dintorni. ${p.goals.some(g => g.key === 'travel' && !g.done) ? 'Ma un giorno, te lo giuro, vedrò il mare.' : 'Tutto quello che mi serve è qui.'}`,
      ]);
    }

    handleGreet() {
      const p = this.p;
      return this.speak([
        `Salve a te. Allora, cosa vuoi sapere? ${p.traits.empathy > 0.5 ? 'Chiedi pure senza timore.' : 'Ma sii breve: ho da fare.'}`,
        `Ben trovato. Non capita spesso di fare due chiacchiere con un forestiero.`,
      ]);
    }

    handleBye() {
      const p = this.p, world = this.world;
      const relv = p.playerRel;
      this.remember('ci siamo salutati');
      if (relv > 50) return this.speak([
        `Torna presto, ${world.player.name}. Qui ci sarà sempre ${p.sex === 'F' ? 'un\'amica' : 'un amico'} per te. Che gli dèi accompagnino i tuoi passi.`,
        `*ti abbraccia* Abbi cura di te, dovunque ti portino le strade. E ricordati di ${p.name}!`,
      ]);
      if (relv < -20) return this.speak([
        `Sì, vai pure. E non affrettarti a tornare.`,
        `*volta le spalle senza rispondere*`,
      ]);
      return this.speak([
        `Buon viaggio, straniero. Che le strade ti siano leggere.`,
        `Addio. ${p.traits.piety > 0.5 ? `${this.godName()} vegli su di te.` : 'E occhio ai briganti, là fuori.'}`,
      ]);
    }

    // ---------- opinions about named entities ----------
    tryOpinion(txt) {
      const world = this.world, p = this.p, rng = this.rng;
      if (!hasAny(txt, LEX.opinionCue) && !txt.includes('come e ') && !txt.includes('com e ')) return null;
      // search entity names in the text
      const find = (name) => name && txt.includes(U.norm(name));
      // people (city first, then leaders and famous)
      const cityFolk = (world.cities[p.cityId] ? world.cities[p.cityId].people(world) : []);
      let target = cityFolk.find(o => o.id !== p.id && (find(o.name) || find(o.fullName)));
      if (!target) {
        for (const o of world.people.values()) {
          if (o.id !== p.id && (o.title || o.reputation > 40) && (find(o.fullName) || find(o.name))) { target = o; break; }
        }
      }
      if (target) return this.opinionOnPerson(target);
      for (const civ of world.civs) if (!civ.dead && find(civ.name)) return this.opinionOnCiv(civ);
      for (const c of world.cities) if (find(c.name)) return this.opinionOnCity(c);
      for (const r of world.religions) if (find(r.name) || find(r.gods[0].name)) return this.opinionOnReligion(r);
      for (const w of world.wars) if (w.name && find(w.name)) { return this.handleWar(); }
      return null;
    }

    opinionOnPerson(o) {
      const p = this.p, world = this.world, rng = this.rng;
      const relv = p.relTo(o.id);
      const mem = p.memories.find(m => m.subj && m.subj.includes(o.id));
      let out = '';
      if (!o.alive) {
        out = `${o.fullName}? ${o.deathYear ? `È ${o.sex === 'F' ? 'morta' : 'morto'} nel ${U.yearLabel(o.deathYear)}${o.deathCause ? ` (${o.deathCause})` : ''}.` : 'Non è più tra noi.'} `;
        if (mem) out += mem.text + '.';
        else if (relv > 30) out += `${rng.pick(['Che la terra gli sia lieve: era una brava persona.', 'Mi manca, se devo dirla tutta.'])}`;
        else if (relv < -20) out += `Non dirò male dei morti. Ma nemmeno bene.`;
        else out += `${rng.pick(['Lo conoscevo appena.', 'Una vita come tante, immagino.'])}`;
        this.remember(`mi ha chiesto di ${o.fullName}`);
        return out;
      }
      if (o.cityId === p.cityId || relv !== 0 || o.reputation > 40) {
        out = `${o.name}${o.surname ? ' ' + o.surname : ''}... `;
        if (mem) out += `${mem.text}. `;
        if (relv > 40) out += rng.pick([`${o.sex === 'F' ? 'Un\'amica vera' : 'Un amico vero'}: per ${o.name} metterei la mano sul fuoco.`, 'Gli voglio bene come a un fratello.']);
        else if (relv > 10) out += rng.pick(['Brava persona, direi.', 'Ci si saluta, ci si rispetta.']);
        else if (relv < -40) out += rng.pick([`*sputa per terra* Non pronunciare quel nome davanti a me.`, `${o.name} e io abbiamo conti in sospeso. Lascia perdere.`]);
        else if (relv < -10) out += rng.pick(['Non è tra le mie persone preferite, ecco.', 'Diciamo che non ci prendiamo.']);
        else if (o.title) out += `${p.traits.ambition > 0.6 ? 'Uno con del potere. Utile saperlo.' : 'Gente importante: io mi tengo alla larga da quelli.'}`;
        else out += rng.pick(['Lo conosco di vista, poco più.', `So chi è, ma non saprei dirti molto: ${o.profession}, mi pare.`]);
        this.remember(`mi ha chiesto cosa penso di ${o.fullName}`);
        return out;
      }
      return `${o.name}? Mai sentito. ${rng.pick(['E credimi, a ' + this.cityName() + ' conosco tutti.', 'Sarà di qualche altra città.'])}`;
    }

    opinionOnCiv(civ) {
      const p = this.p, world = this.world, rng = this.rng;
      const mine = world.civOf(p);
      if (mine && civ.id === mine.id) return this.handlePolitics();
      const know = worldliness(p, world);
      if (know < 0.3 && (!mine || Math.abs(civ.id - mine.id) > 0)) {
        const cap = world.cities[civ.capitalId];
        if (cap && U.dist(cap.x, cap.y, world.cities[p.cityId].x, world.cities[p.cityId].y) > 50) {
          return `${civ.name}? Nomi lontani... ne parlano i mercanti, a volte. ${rng.pick(['Dicono che laggiù la gente abbia usanze stranissime, ma chissà.', 'Per me potrebbero anche non esistere: io da qui non mi muovo.'])}`;
        }
      }
      const rel = mine ? mine.relTo(civ.id) : 0;
      const atW = mine && PCS.atWar(world, mine.id, civ.id);
      const grudgeMem = p.memories.find(m => m.text.includes(civ.name));
      let out = `${civ.name}... `;
      if (atW) out += `Il nemico! ${p.traits.courage > 0.6 ? 'Che vengano pure: li ricacceremo a casa loro.' : 'Che questa guerra maledetta finisca presto.'}`;
      else if (grudgeMem) out += `${grudgeMem.text}. Il sangue non diventa acqua, straniero.`;
      else if (rel > 30) out += `${rng.pick(['Buoni vicini, buoni commerci: che duri.', 'Con loro c\'è amicizia, per ora. E le loro stoffe sono ottime.'])}`;
      else if (rel < -30) out += `${rng.pick(['Non mi fido: sorridono e affilano i coltelli.', 'Prima o poi con quelli finisce male, ricordati le mie parole.'])}`;
      else out += `${rng.pick(['Gente come noi, alla fine: contadini, madri, mercanti.', 'Né amici né nemici. Che restino a casa loro, e noi a casa nostra.'])}`;
      this.remember(`mi ha chiesto di ${civ.name}`);
      return out;
    }

    opinionOnCity(c) {
      const p = this.p, world = this.world, rng = this.rng;
      if (c.id === p.cityId) return this.handleCity();
      if (c.dead) return `${c.name}? Ormai sono solo rovine e memoria: la città è morta ${c.deadYear ? 'nel ' + U.yearLabel(c.deadYear) : 'tempo fa'}. ${rng.pick(['Dicono ci si sentano gli spiriti, di notte.', 'Triste fine.'])}`;
      const d = U.dist(c.x, c.y, world.cities[p.cityId].x, world.cities[p.cityId].y);
      const know = worldliness(p, world);
      if (d > 60 && know < 0.5) return `${c.name}... il nome l'ho sentito, ma è lontana: per me è quasi leggenda.`;
      const sameCiv = c.civId === world.cities[p.cityId].civId;
      const traded = world.cities[p.cityId].tradeRoutes.includes(c.id);
      let out = `${c.name}: ${sameCiv ? 'città del nostro stesso regno' : `sta sotto ${world.civs[c.civId].name}`}. `;
      if (traded) out += `Da lì arrivano carovane cariche di merci: gente d'affari.`;
      else if (p.travelled && rng.chance(0.5)) out += `Ci sono ${p.sex === 'F' ? 'passata' : 'passato'} una volta: ${rng.pick(['bella, ma non è casa', 'confusione e odori strani, per i miei gusti', 'gente ospitale, devo ammetterlo'])}.`;
      else out += rng.pick(['Ne parlano bene i viaggiatori.', 'So che esiste, e mi basta.']);
      return out;
    }

    opinionOnReligion(r) {
      const p = this.p, world = this.world, rng = this.rng;
      const mine = p.religionId != null ? world.religions[p.religionId] : null;
      if (mine && r.id === mine.id) return this.handleReligion();
      const s = styleOf(p, world);
      if (r.dead) return `La ${r.name}? Una fede spenta: i suoi ultimi fedeli sono polvere. ${s.pious > 0.5 ? 'Così finisce chi segue falsi dèi.' : 'Prima o poi tocca a tutte le fedi, temo.'}`;
      if (r.id === world.player.foundedReligionId) {
        return p.religionId === r.id
          ? `*si illumina* La nostra fede! La fede in te, ${world.player.name}! Ogni giorno racconto della tua venuta.`
          : `Il Culto di ${world.player.name}... *ti fissa a lungo* Aspetta. Il nome. Il volto. Tu... tu sei... no, non è possibile. Vero?`;
      }
      if (s.pious > 0.6 && mine) return `${this.moodPrefix()}La ${r.name}? *si fa serio* Seguono ${r.gods[0].name}, ma la verità è una sola, e sta nella ${mine.name}. ${p.traits.empathy > 0.5 ? 'Comunque, ognuno cerca la luce come può.' : 'Idolatri, se chiedi a me.'}`;
      return `So che venerano ${r.gods[0].name}${r.gods.length > 1 ? ' e altri dèi' : ''}: il loro profeta fu ${r.prophetName}. ${rng.pick(['Fedi ne nascono e ne muoiono: io guardo e non giudico.', 'Ognuno ha i suoi altari.'])}`;
    }

    handleFallback(txt) {
      const p = this.p, rng = this.rng, world = this.world;
      const s = styleOf(p, world);
      const isQuestion = txt.includes('perche') || txt.includes('come') || txt.includes('cosa') || txt.includes('quando') || txt.includes('dove') || txt.includes('chi') || txt.includes('quanto');
      if (isQuestion) return this.speak([
        `Hm. ${s.blunt > 0.6 ? 'Non ho capito la domanda, e non amo gli indovinelli.' : 'Perdonami, non sono sicuro di aver capito.'} Chiedimi della mia vita, della città, della fede, delle guerre... su quelle so risponderti.`,
        `${p.traits.intelligence < 0.35 ? 'Uh... parole difficili. Io sono una persona semplice, straniero.' : 'Domanda curiosa... ma temo di non sapere che risponderti.'} Prova a chiedermi ${rng.pick(['della mia famiglia', 'di cosa si dice in giro', 'di chi comanda qui', 'dei miei ricordi'])}.`,
      ]);
      return this.speak([
        `${rng.pick(['Capisco...', 'Ah sì?', 'Mh.', 'Se lo dici tu...'])} ${s.warm > 0.6 ? 'Raccontami di più, mi piace ascoltare i viandanti.' : rng.pick(['E quindi?', 'Comunque io avrei da fare, se non c\'è altro.'])}`,
        `${s.verbose > 0.6 ? 'Interessante. Sai, qui le giornate si somigliano tutte: ogni parola nuova è una finestra.' : 'Mh-mh.'} C'è altro che vuoi sapere?`,
      ]);
    }

    // called by UI when the conversation window closes
    end() {
      const p = this.p, world = this.world;
      if (this.turns >= 4) {
        world.player.fame += 0.5;
        if (p.playerRel > 60 && !p.memories.some(m => m.t === 'amicizia' && m.text.includes(world.player.name))) {
          p.addMemory(world.year, 'amicizia', `Lo straniero ${world.player.name} è diventato per me un vero amico`, 6);
        }
      }
    }
  }

  // ---------- yearly player-legacy simulation ----------
  PCS.playerLegacyTick = function (world) {
    const rng = world.rng, year = world.year;
    // fame decays slowly unless a religion keeps it alive
    if (world.player.foundedReligionId != null) {
      const rel = world.religions[world.player.foundedReligionId];
      if (rel && !rel.dead && rel.followers > 50) world.player.fame = Math.min(100, world.player.fame + 0.5);
    } else {
      world.player.fame = Math.max(0, world.player.fame - 0.05);
    }
    // NPCs slowly forget the player without contact; strong bonds persist
    for (const p of world.people.values()) {
      if (!p.alive || !p.playerMet) continue;
      const lastChat = p.playerChats.length ? p.playerChats[p.playerChats.length - 1].y : -999;
      if (year - lastChat > 10 && Math.abs(p.playerRel) < 25 && rng.chance(0.1)) {
        p.playerRel = Math.round(p.playerRel * 0.8);
        if (p.playerRel === 0 && rng.chance(0.3)) p.playerMet = false; // truly forgotten
      }
    }
  };

  PCS.ChatSession = ChatSession;
})();
