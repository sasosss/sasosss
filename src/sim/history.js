/* World chronicle: every meaningful event is recorded and browsable by year.
   Major events receive epic procedural names ("La Grande Guerra delle Tre
   Corone") and become part of the shared knowledge NPCs can talk about. */
(function () {
  'use strict';
  const PCS = (globalThis.PCS = globalThis.PCS || {});

  // categories: guerra, politica, religione, disastro, scoperta, economia,
  // cultura, persona, natura, giocatore
  class Chronicle {
    constructor() {
      this.events = []; // {id, y, cat, text, imp(1..10), civIds?, personIds?, name?}
      this.seq = 0;
    }
    add(y, cat, text, imp, extra) {
      const ev = Object.assign({ id: this.seq++, y: Math.floor(y), cat, text, imp: imp || 3 }, extra || {});
      this.events.push(ev);
      // hard cap to protect saves: drop old low-importance events
      if (this.events.length > 4200) {
        const keep = this.events.filter((e, i) => e.imp >= 7 || i > this.events.length - 2400);
        this.events = keep;
        if (this.events.length > 4000) this.events = this.events.slice(-4000);
      }
      PCS.bus.emit('event', ev);
      return ev;
    }
    byYear(y) { return this.events.filter(e => e.y === y); }
    inRange(a, b) { return this.events.filter(e => e.y >= a && e.y <= b); }
    major(n) { return this.events.filter(e => e.imp >= 7).slice(-(n || 50)); }
    recent(n) { return this.events.slice(-(n || 30)); }
    toJSON() { return { seq: this.seq, events: this.events }; }
    static fromJSON(o) {
      const c = new Chronicle();
      c.seq = o.seq; c.events = o.events || [];
      return c;
    }
  }

  // --- epic name generators ---
  const WAR_ADJ = ['Grande', 'Lunga', 'Sanguinosa', 'Amara', 'Dimenticata', 'Ultima', 'Silenziosa', 'Rossa'];
  const WAR_OBJ = ['delle Due Corone', 'delle Tre Corone', 'dei Fiumi', 'del Sale', 'delle Ceneri', 'dei Confini', 'delle Spade Spezzate', 'dell\'Aquila', 'dei Fratelli', 'del Lungo Inverno'];
  function warName(rng, a, b, cause) {
    const r = rng.next();
    if (r < 0.3) return `Guerra ${rng.pick(WAR_ADJ)} ${rng.pick(WAR_OBJ)}`;
    if (r < 0.55) return `Guerra tra ${a} e ${b}`;
    if (cause === 'religione') return `Guerra Santa di ${a}`;
    if (cause === 'vendetta') return `Guerra della Vendetta ${rng.pick(['Rossa', 'Amara', 'di Sangue'])}`;
    return `${rng.pick(['Conflitto', 'Guerra', 'Campagna'])} ${rng.pick(WAR_ADJ)} di ${rng.chance(0.5) ? a : b}`;
  }
  const PLAGUE_NAMES = ['Peste Grigia', 'Morbo Rosso', 'Febbre delle Paludi', 'Male Oscuro', 'Peste Danzante', 'Sudore Nero', 'Febbre del Fiume', 'Morbo dei Mille Giorni'];
  function plagueName(rng) { return rng.pick(PLAGUE_NAMES); }

  PCS.Chronicle = Chronicle;
  PCS.warName = warName;
  PCS.plagueName = plagueName;
})();
