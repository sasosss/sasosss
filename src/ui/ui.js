/* UI: top bar, side panels, inspectors (person / city / civ / religion / war /
   family / army), timeline browser, search, charts, live event feed and the
   NPC chat window. Dark theme; all interactions delegated by data-actions. */
(function () {
  'use strict';
  const PCS = (globalThis.PCS = globalThis.PCS || {});
  const { U } = PCS;
  const $ = (s) => document.querySelector(s);

  const CAT_ICONS = {
    guerra: '⚔️', politica: '🏛️', religione: '🕯️', disastro: '🌋', scoperta: '💡',
    economia: '💰', cultura: '🎭', persona: '👤', natura: '🌿', giocatore: '✨',
  };

  class UI {
    constructor(app) {
      this.app = app;
      this.tab = 'world';
      this.inspector = null; // {type, id}
      this.chat = null;      // ChatSession
      this.searchQuery = '';
      this.timelineYear = null;
      this.timelineFilter = 'tutti';
      this.feed = [];
      PCS.bus.on('event', ev => {
        if (ev.imp >= 3) {
          this.feed.push(ev);
          if (this.feed.length > 80) this.feed.shift();
          this.feedDirty = true;
        }
        if (ev.imp >= 7) this.toast(ev);
      });
      this.feedDirty = true;
      this.bindGlobal();
    }
    get world() { return this.app.world; }

    bindGlobal() {
      document.body.addEventListener('click', (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const a = el.dataset.action, id = el.dataset.id;
        switch (a) {
          case 'speed': this.app.setSpeed(+id); break;
          case 'tab': this.tab = id; this.renderPanel(); break;
          case 'inspect-person': this.inspect('person', +id); break;
          case 'inspect-city': this.inspect('city', +id); break;
          case 'inspect-civ': this.inspect('civ', +id); break;
          case 'inspect-religion': this.inspect('religion', +id); break;
          case 'inspect-war': this.inspect('war', +id); break;
          case 'inspect-family': this.inspect('family', +id); break;
          case 'inspect-army': this.inspect('army', +id); break;
          case 'close-inspector': this.inspector = null; this.renderInspector(); break;
          case 'chat': this.openChat(+id); break;
          case 'close-chat': this.closeChat(); break;
          case 'goto-city': {
            const c = this.world.cities[+id];
            if (c) { this.app.renderer.centerOn(c.x, c.y); this.app.renderer.selectedCity = c.id; }
            break;
          }
          case 'timeline-year': this.timelineYear = +id < 0 ? null : +id; this.renderPanel(); break;
          case 'timeline-filter': this.timelineFilter = id; this.renderPanel(); break;
          case 'new-world': if (confirm('Generare un nuovo mondo? Il mondo attuale verrà sostituito (il salvataggio precedente andrà perso).')) this.app.newWorld(); break;
          case 'save-now': this.app.save(); this.flashSaved(); break;
          case 'export-save': this.app.exportSave(); break;
          case 'toggle-borders': this.app.renderer.showBorders = !this.app.renderer.showBorders; break;
        }
      });
      $('#search-input').addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        if (this.tab === 'search') this.renderPanel();
      });
      $('#chat-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendChat(); }
      });
      $('#chat-send').addEventListener('click', () => this.sendChat());
    }

    toast(ev) {
      // at high speed only epochal events pop up, and never more than 4 at once
      if (this.app.speed >= 50 && ev.imp < 8) return;
      const box = $('#toasts');
      while (box.children.length >= 4) box.firstChild.remove();
      const t = document.createElement('div');
      t.className = 'toast';
      t.innerHTML = `<span>${CAT_ICONS[ev.cat] || '📜'}</span> <b>${U.yearLabel(ev.y)}</b> — ${U.esc(ev.text)}`;
      $('#toasts').appendChild(t);
      setTimeout(() => t.classList.add('show'), 30);
      setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 500); }, 7000);
    }
    flashSaved() {
      const el = $('#save-indicator');
      el.textContent = '✓ salvato';
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1200);
    }

    // ---------------- top bar ----------------
    renderTopbar() {
      const w = this.world;
      if (!w) return;
      $('#world-title').textContent = w.worldName ? `🌍 ${w.worldName}` : '🌍';
      $('#date-label').textContent = `${U.yearLabel(w.year)} · ${PCS.SEASONS[w.season]}`;
      const pop = U.sum(w.cities.filter(c => !c.dead), c => c.pop);
      $('#quick-stats').innerHTML =
        `<span title="Popolazione">👥 ${U.fmt(pop)}</span>` +
        `<span title="Civiltà">🏛️ ${w.civs.filter(c => !c.dead).length}</span>` +
        `<span title="Guerre in corso">⚔️ ${w.wars.filter(x => !x.endYear).length}</span>` +
        `<span title="Anime simulate una a una">🧬 ${U.fmt(w.livingCount)}</span>`;
      document.querySelectorAll('#speed-controls button').forEach(b => {
        b.classList.toggle('active', +b.dataset.id === this.app.speed);
      });
    }

    // ---------------- side panel ----------------
    renderPanel() {
      if (!this.world) return;
      const el = $('#panel-content');
      const keepScroll = el.scrollTop;
      document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.id === this.tab));
      switch (this.tab) {
        case 'world': el.innerHTML = this.viewWorld(); this.drawCharts(); break;
        case 'civs': el.innerHTML = this.viewCivs(); break;
        case 'timeline': el.innerHTML = this.viewTimeline(); break;
        case 'search': el.innerHTML = this.viewSearch(); break;
      }
      el.scrollTop = keepScroll;
    }

    viewWorld() {
      const w = this.world;
      const alive = w.cities.filter(c => !c.dead);
      const pop = U.sum(alive, c => c.pop);
      const topCiv = U.maxBy(w.civs.filter(c => !c.dead), c => c.totalPop(w));
      const era = topCiv ? PCS.ERA_NAMES[PCS.civEra(topCiv)] : '—';
      const rels = w.religions.filter(r => !r.dead).sort((a, b) => b.followers - a.followers);
      return `
        <div class="stat-grid">
          <div class="stat"><div class="stat-v">${U.fmt(pop)}</div><div class="stat-l">Abitanti</div></div>
          <div class="stat"><div class="stat-v">${alive.length}</div><div class="stat-l">Città</div></div>
          <div class="stat"><div class="stat-v">${w.civs.filter(c => !c.dead).length}</div><div class="stat-l">Civiltà</div></div>
          <div class="stat"><div class="stat-v">${rels.length}</div><div class="stat-l">Religioni</div></div>
        </div>
        <div class="kv"><span>Era più avanzata</span><b>${era}</b></div>
        <div class="kv"><span>Anime simulate</span><b>${U.fmt(w.livingCount)} individui</b></div>
        <h3>Popolazione</h3><canvas id="chart-pop" width="300" height="90"></canvas>
        <h3>Civiltà & guerre</h3><canvas id="chart-civs" width="300" height="90"></canvas>
        <h3>Religioni principali</h3>
        ${rels.slice(0, 5).map(r => `<div class="row link" data-action="inspect-religion" data-id="${r.id}">🕯️ ${U.esc(r.name)} <span class="dim">${U.fmt(r.followers)} fedeli</span></div>`).join('')}
        <h3>Eventi recenti</h3>
        <div id="feed">${this.feedHTML()}</div>`;
    }

    feedHTML() {
      return this.feed.slice(-25).reverse().map(ev =>
        `<div class="feed-item imp${Math.min(ev.imp, 9)}"><span class="dim">${U.yearLabel(ev.y)}</span> ${CAT_ICONS[ev.cat] || ''} ${U.esc(ev.text)}</div>`
      ).join('') || '<div class="dim">Il mondo è tranquillo…</div>';
    }

    drawCharts() {
      const w = this.world;
      const draw = (id, series, color, fmt) => {
        const cv = document.getElementById(id);
        if (!cv || !w.stats.length) return;
        const ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, cv.width, cv.height);
        const data = w.stats;
        const max = Math.max(...data.map(series), 1);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        data.forEach((s, i) => {
          const x = (i / Math.max(1, data.length - 1)) * (cv.width - 4) + 2;
          const y = cv.height - 6 - (series(s) / max) * (cv.height - 14);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '9px sans-serif';
        ctx.fillText(fmt(max), 3, 9);
        ctx.fillText(U.yearLabel(data[0].y), 2, cv.height - 1);
        const last = U.yearLabel(data[data.length - 1].y);
        ctx.fillText(last, cv.width - ctx.measureText(last).width - 2, cv.height - 1);
      };
      draw('chart-pop', s => s.pop, '#7dc4ff', U.fmt);
      const cv = document.getElementById('chart-civs');
      if (cv && w.stats.length) {
        draw('chart-civs', s => s.civs, '#8fdc8f', v => v + ' civ');
        const ctx = cv.getContext('2d');
        const data = w.stats;
        const maxW = Math.max(...data.map(s => s.wars), 1);
        ctx.strokeStyle = '#ff7d7d';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        data.forEach((s, i) => {
          const x = (i / Math.max(1, data.length - 1)) * (cv.width - 4) + 2;
          const y = cv.height - 6 - (s.wars / maxW) * (cv.height - 14);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.stroke();
      }
    }

    viewCivs() {
      const w = this.world;
      const civs = w.civs.filter(c => !c.dead).sort((a, b) => b.totalPop(w) - a.totalPop(w));
      const dead = w.civs.filter(c => c.dead);
      return civs.map(c => {
        const leader = w.people.get(c.leaderId);
        const wars = w.wars.filter(x => !x.endYear && (x.attackerId === c.id || x.defenderId === c.id)).length;
        return `<div class="civ-card link" data-action="inspect-civ" data-id="${c.id}">
          <span class="flag" style="background:rgb(${c.color.join(',')})"></span>
          <div><b>${U.esc(c.name)}</b> ${wars ? '⚔️' : ''}<br>
          <span class="dim">${c.govInfo().name} · ${U.fmt(c.totalPop(w))} ab. · ${c.cities(w).length} città · ${PCS.ERA_NAMES[PCS.civEra(c)]}</span><br>
          <span class="dim">${leader ? U.esc((leader.title || '') + ' ' + leader.fullName) : 'senza guida'}</span></div>
        </div>`;
      }).join('') + (dead.length ? `<h3>Civiltà scomparse</h3>` + dead.map(c =>
        `<div class="row dim link" data-action="inspect-civ" data-id="${c.id}">💀 ${U.esc(c.name)} (caduta: ${U.yearLabel(c.deadYear || 0)})</div>`).join('') : '');
    }

    viewTimeline() {
      const w = this.world;
      const cats = ['tutti', 'guerra', 'politica', 'religione', 'disastro', 'scoperta', 'economia', 'persona', 'natura', 'giocatore', 'cultura'];
      let events;
      if (this.timelineYear !== null) {
        events = w.chronicle.inRange(this.timelineYear, this.timelineYear + 9);
      } else {
        events = w.chronicle.events.slice(-300);
      }
      if (this.timelineFilter !== 'tutti') events = events.filter(e => e.cat === this.timelineFilter);
      const q = U.norm(this.searchQuery);
      if (q && this.tab === 'timeline') events = events.filter(e => U.norm(e.text).includes(q));
      // decade buttons
      const decades = [];
      for (let y = 1; y <= w.year; y += 10) decades.push(y);
      const major = w.chronicle.major(14).reverse();
      return `
        <h3>Grandi eventi</h3>
        ${major.map(e => `<div class="feed-item imp9">${CAT_ICONS[e.cat] || ''} <b>${U.esc(e.name || '')}</b> <span class="dim">(${U.yearLabel(e.y)})</span><br>${U.esc(e.text)}</div>`).join('') || '<div class="dim">Ancora nessun evento epocale.</div>'}
        <h3>Consulta per decennio</h3>
        <div class="decades">
          <button data-action="timeline-year" data-id="-1" class="${this.timelineYear === null ? 'active' : ''}" onclick="void(0)">recenti</button>
          ${decades.map(d => `<button data-action="timeline-year" data-id="${d}" class="${this.timelineYear === d ? 'active' : ''}">${d}</button>`).join('')}
        </div>
        <div class="filters">${cats.map(c => `<button data-action="timeline-filter" data-id="${c}" class="${this.timelineFilter === c ? 'active' : ''}">${c === 'tutti' ? 'tutti' : (CAT_ICONS[c] || '') + ' ' + c}</button>`).join('')}</div>
        <div class="timeline-list">
          ${events.slice(-250).reverse().map(e => `<div class="feed-item imp${Math.min(e.imp, 9)}"><span class="dim">${U.yearLabel(e.y)}</span> ${CAT_ICONS[e.cat] || ''} ${U.esc(e.text)}</div>`).join('') || '<div class="dim">Nessun evento trovato.</div>'}
        </div>`;
    }

    viewSearch() {
      const w = this.world;
      const q = U.norm(this.searchQuery);
      if (!q || q.length < 2) return `<div class="dim" style="padding:8px">Scrivi almeno 2 lettere nella casella in alto per cercare persone, città, civiltà, religioni e guerre.</div>
        <h3>Persone celebri viventi</h3>` +
        [...w.people.values()].filter(p => p.alive && (p.title || p.reputation > 50)).sort((a, b) => b.reputation - a.reputation).slice(0, 15)
          .map(p => this.personRow(p)).join('');
      const out = [];
      const cities = w.cities.filter(c => U.norm(c.name).includes(q)).slice(0, 8);
      if (cities.length) out.push('<h3>Città</h3>' + cities.map(c =>
        `<div class="row link" data-action="inspect-city" data-id="${c.id}">🏘️ ${U.esc(c.name)} ${c.dead ? '(rovine)' : `<span class="dim">${U.fmt(c.pop)} ab.</span>`}</div>`).join(''));
      const civs = w.civs.filter(c => U.norm(c.name).includes(q)).slice(0, 6);
      if (civs.length) out.push('<h3>Civiltà</h3>' + civs.map(c =>
        `<div class="row link" data-action="inspect-civ" data-id="${c.id}"><span class="flag" style="background:rgb(${c.color.join(',')})"></span> ${U.esc(c.name)}</div>`).join(''));
      const rels = w.religions.filter(r => U.norm(r.name).includes(q)).slice(0, 6);
      if (rels.length) out.push('<h3>Religioni</h3>' + rels.map(r =>
        `<div class="row link" data-action="inspect-religion" data-id="${r.id}">🕯️ ${U.esc(r.name)}</div>`).join(''));
      const wars = w.wars.filter(x => U.norm(x.name).includes(q)).slice(0, 6);
      if (wars.length) out.push('<h3>Guerre</h3>' + wars.map(x =>
        `<div class="row link" data-action="inspect-war" data-id="${x.id}">⚔️ ${U.esc(x.name)} <span class="dim">${U.yearLabel(x.startYear)}${x.endYear ? '–' + U.yearLabel(x.endYear) : ' (in corso)'}</span></div>`).join(''));
      let people = [];
      for (const p of w.people.values()) {
        if (U.norm(p.fullName).includes(q)) {
          people.push(p);
          if (people.length >= 30) break;
        }
      }
      people.sort((a, b) => (b.alive ? 1 : 0) - (a.alive ? 1 : 0) || b.reputation - a.reputation);
      if (people.length) out.push('<h3>Persone</h3>' + people.slice(0, 20).map(p => this.personRow(p)).join(''));
      return out.join('') || '<div class="dim" style="padding:8px">Nessun risultato.</div>';
    }

    personRow(p) {
      const w = this.world;
      const city = w.cities[p.cityId];
      return `<div class="row link" data-action="inspect-person" data-id="${p.id}">${p.alive ? (p.sex === 'F' ? '👩' : '👨') : '💀'} ${U.esc(p.fullName)}${p.title ? ` <span class="title-badge">${U.esc(p.title)}</span>` : ''} <span class="dim">${p.alive ? `${p.age(w.year)} anni, ${U.esc(p.profession)}, ${city ? U.esc(city.name) : '—'}` : `${U.yearLabel(p.birthYear)}–${U.yearLabel(p.deathYear || 0)}`}</span></div>`;
    }

    // ---------------- inspector ----------------
    inspect(type, id) {
      this.inspector = { type, id };
      this.renderInspector();
      if (type === 'city') {
        const c = this.world.cities[id];
        if (c) this.app.renderer.selectedCity = id;
      }
    }

    renderInspector() {
      const box = $('#inspector');
      if (!this.inspector) { box.classList.remove('open'); return; }
      const keepScroll = box.classList.contains('open') ? box.scrollTop : 0;
      box.classList.add('open');
      const { type, id } = this.inspector;
      const w = this.world;
      let html = '';
      try {
        if (type === 'person') html = this.viewPerson(w.people.get(id));
        else if (type === 'city') html = this.viewCity(w.cities[id]);
        else if (type === 'civ') html = this.viewCiv(w.civs[id]);
        else if (type === 'religion') html = this.viewReligion(w.religions[id]);
        else if (type === 'war') html = this.viewWar(w.wars.find(x => x.id === id));
        else if (type === 'family') html = this.viewFamily(w.people.get(id));
        else if (type === 'army') html = this.viewArmy(w.civs[id]);
      } catch (err) { html = `<div class="dim">Errore: ${U.esc(err.message)}</div>`; }
      box.innerHTML = `<button class="close-btn" data-action="close-inspector">✕</button>` + (html || '<div class="dim">Non trovato.</div>');
      box.scrollTop = keepScroll;
    }

    viewPerson(p) {
      if (!p) return '';
      const w = this.world;
      const city = w.cities[p.cityId];
      const civ = city ? w.civs[city.civId] : null;
      const rel = p.religionId != null ? w.religions[p.religionId] : null;
      const rng = new PCS.RNG('desc' + p.id);
      const father = w.people.get(p.fatherId), mother = w.people.get(p.motherId), spouse = w.people.get(p.spouseId);
      const kids = p.childrenIds.map(i => w.people.get(i)).filter(Boolean);
      const emo = p.dominantEmotion();
      const emoIcon = { gioia: '😊', dolore: '😢', rabbia: '😠', paura: '😨', calma: '😐' }[emo];
      const bar = (v, cls) => `<div class="bar"><div class="bar-fill ${cls || ''}" style="width:${Math.round(v * 100)}%"></div></div>`;
      const personLink = (o, label) => o ? `<span class="link" data-action="inspect-person" data-id="${o.id}">${U.esc(label || o.fullName)}${o.alive ? '' : ' †'}</span>` : '<span class="dim">sconosciuto</span>';
      const friendIds = p.friends(), enemyIds = p.enemies();
      return `
        <h2>${p.sex === 'F' ? '👩' : '👨'} ${U.esc(p.fullName)} ${p.alive ? '' : '†'}</h2>
        <div class="dim">${p.title ? `<span class="title-badge">${U.esc(p.title)}</span> ` : ''}${p.alive ? `${p.age(w.year)} anni` : `${U.yearLabel(p.birthYear)} – ${U.yearLabel(p.deathYear)} (${U.esc(p.deathCause || '?')})`} · ${U.esc(p.profession)} · ${p.height} cm ${p.sick ? `· 🤒 ${U.esc(p.sick.name)}` : ''}</div>
        ${p.alive ? `<div class="btn-row">
          <button class="btn primary" data-action="chat" data-id="${p.id}">💬 Parla con ${U.esc(p.name)}</button>
          <button class="btn" data-action="inspect-family" data-id="${p.id}">🌳 Famiglia</button>
          ${city ? `<button class="btn" data-action="goto-city" data-id="${city.id}">📍 ${U.esc(city.name)}</button>` : ''}
        </div>` : `<div class="btn-row"><button class="btn" data-action="inspect-family" data-id="${p.id}">🌳 Famiglia</button></div>`}
        <div class="kv"><span>Personalità</span><b>${U.esc(p.personalityDesc(rng))}</b></div>
        <div class="kv"><span>Valori</span><b>${p.values.map(U.esc).join(', ')}</b></div>
        <div class="kv"><span>Stato d'animo</span><b>${emoIcon} ${emo}</b></div>
        <div class="kv"><span>Città</span><b>${city ? `<span class="link" data-action="inspect-city" data-id="${city.id}">${U.esc(city.name)}</span>` : '—'}${civ ? ` (${U.esc(civ.name)})` : ''}</b></div>
        <div class="kv"><span>Religione</span><b>${rel ? `<span class="link" data-action="inspect-religion" data-id="${rel.id}">${U.esc(rel.name)}</span>` : 'nessuna'}</b></div>
        <div class="kv"><span>Ricchezza</span><b>${Math.round(p.wealth)} monete</b></div>
        <div class="kv"><span>Lingua</span><b>${civ ? U.esc(w.cultures[civ.cultureId].name) + 'ico' : '—'}</b></div>
        <h3>Attributi</h3>
        <div class="attr"><span>Intelligenza</span>${bar(p.traits.intelligence)}</div>
        <div class="attr"><span>Coraggio</span>${bar(p.traits.courage)}</div>
        <div class="attr"><span>Empatia</span>${bar(p.traits.empathy)}</div>
        <div class="attr"><span>Ambizione</span>${bar(p.traits.ambition)}</div>
        <div class="attr"><span>Salute</span>${bar(p.health, p.health < 0.4 ? 'red' : 'green')}</div>
        <h3>Famiglia</h3>
        <div class="kv"><span>Padre</span><b>${personLink(father)}</b></div>
        <div class="kv"><span>Madre</span><b>${personLink(mother)}</b></div>
        <div class="kv"><span>Coniuge</span><b>${spouse ? personLink(spouse) : '<span class="dim">—</span>'}</b></div>
        <div class="kv"><span>Figli</span><b>${kids.length ? kids.map(k => personLink(k, k.name)).join(', ') : '<span class="dim">—</span>'}</b></div>
        ${friendIds.length ? `<h3>Amici</h3>${friendIds.slice(0, 5).map(i => { const o = w.people.get(i); return o ? `<div class="row">${personLink(o)} <span class="dim">(+${p.relTo(i)})</span></div>` : ''; }).join('')}` : ''}
        ${enemyIds.length ? `<h3>Nemici</h3>${enemyIds.slice(0, 5).map(i => { const o = w.people.get(i); return o ? `<div class="row">${personLink(o)} <span class="dim">(${p.relTo(i)})</span></div>` : ''; }).join('')}` : ''}
        <h3>Obiettivi</h3>
        ${p.goals.map(g => `<div class="row">${g.done ? '✅' : '🎯'} ${U.esc(U.cap(g.text))}</div>`).join('') || '<div class="dim">Nessuno</div>'}
        <h3>Ricordi (${p.memories.length})</h3>
        <div class="memories">${p.memories.slice().reverse().slice(0, 25).map(m =>
          `<div class="memory imp${Math.min(m.imp, 9)}"><span class="dim">${U.yearLabel(m.y)}</span> ${U.esc(m.text)}</div>`).join('') || '<div class="dim">Ancora nessun ricordo.</div>'}</div>
        ${p.playerMet ? `<h3>Rapporto con te</h3>
          <div class="kv"><span>Affinità</span><b>${p.playerRel > 50 ? '❤️ amico fidato' : p.playerRel > 15 ? '🙂 buona' : p.playerRel < -40 ? '💢 ti odia' : p.playerRel < -10 ? '😒 diffidente' : '😐 neutrale'} (${p.playerRel})</b></div>
          ${p.playerPromises.filter(x => x.kept === null).map(x => `<div class="row">🤝 In attesa: "${U.esc(x.text)}" (${U.yearLabel(x.y)})</div>`).join('')}` : ''}`;
    }

    viewCity(c) {
      if (!c) return '';
      const w = this.world;
      const civ = w.civs[c.civId];
      const folks = c.people(w).filter(p => p.alive).sort((a, b) => b.reputation - a.reputation);
      const rel = c.mainReligionId != null ? w.religions[c.mainReligionId] : null;
      const res = c.resourcesNearby(w);
      return `
        <h2>🏘️ ${U.esc(c.name)} ${c.dead ? '(rovine)' : ''}</h2>
        <div class="dim">Fondata: ${U.yearLabel(c.foundedYear)} · <span class="link" data-action="inspect-civ" data-id="${civ.id}">${U.esc(civ.name)}</span>${civ.capitalId === c.id ? ' · ⭐ capitale' : ''}</div>
        <div class="btn-row"><button class="btn" data-action="goto-city" data-id="${c.id}">📍 Vai sulla mappa</button></div>
        <div class="stat-grid">
          <div class="stat"><div class="stat-v">${U.fmt(c.pop)}</div><div class="stat-l">Abitanti</div></div>
          <div class="stat"><div class="stat-v">${Math.round(c.prosperity * 100)}%</div><div class="stat-l">Prosperità</div></div>
          <div class="stat"><div class="stat-v">${Math.round(c.unrest * 100)}%</div><div class="stat-l">Malcontento</div></div>
          <div class="stat"><div class="stat-v">${U.fmt(c.wealth)}</div><div class="stat-l">Ricchezza</div></div>
        </div>
        ${c.famine ? '<div class="alert">🌾 Carestia in corso!</div>' : ''}
        ${c.plague ? `<div class="alert">☠️ Epidemia: ${U.esc(c.plague.name)}</div>` : ''}
        ${c.refugees > 0 ? `<div class="alert warn">🏳️ ${U.fmt(c.refugees)} profughi in arrivo</div>` : ''}
        <div class="kv"><span>Religione principale</span><b>${rel ? `<span class="link" data-action="inspect-religion" data-id="${rel.id}">${U.esc(rel.name)}</span>` : '—'}</b></div>
        <div class="kv"><span>Risorse vicine</span><b>${res.map(U.esc).join(', ') || 'poche'}</b></div>
        <div class="kv"><span>Edifici</span><b>${[...c.buildings, ...(c.walls ? ['mura×' + c.walls] : [])].map(U.esc).join(', ') || 'capanni'}</b></div>
        <h3>Mercato</h3>
        ${Object.entries(c.prices).map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v} <span class="dim">monete</span> ${v > 2.5 ? '📈' : v < 0.7 ? '📉' : ''}</b></div>`).join('')}
        <h3>Rotte commerciali</h3>
        ${c.tradeRoutes.map(id => { const o = w.cities[id]; return o ? `<div class="row link" data-action="inspect-city" data-id="${o.id}">⛵ ${U.esc(o.name)}</div>` : ''; }).join('') || '<div class="dim">Nessuna</div>'}
        <h3>Abitanti noti (${folks.length} simulati)</h3>
        ${folks.slice(0, 30).map(p => this.personRow(p)).join('') || '<div class="dim">Nessuno</div>'}`;
    }

    viewCiv(c) {
      if (!c) return '';
      const w = this.world;
      const leader = w.people.get(c.leaderId);
      const cu = w.cultures[c.cultureId];
      const cities = c.cities(w);
      const wars = w.wars.filter(x => x.attackerId === c.id || x.defenderId === c.id);
      const rels = w.civs.filter(o => !o.dead && o.id !== c.id)
        .map(o => ({ o, v: c.relTo(o.id) })).sort((a, b) => b.v - a.v);
      const flagSVG = this.flagSVG(cu.flag);
      return `
        <h2>${flagSVG} ${U.esc(c.name)} ${c.dead ? '💀' : ''}</h2>
        <div class="dim">${c.govInfo().name} · fondata ${U.yearLabel(c.foundedYear)}${c.dead ? ` · caduta ${U.yearLabel(c.deadYear)}` : ''} · ${PCS.ERA_NAMES[PCS.civEra(c)]}</div>
        <div class="kv"><span>Guida</span><b>${leader ? `<span class="link" data-action="inspect-person" data-id="${leader.id}">${U.esc((leader.title || '') + ' ' + leader.fullName)}</span>` : '—'}</b></div>
        ${c.dynasty ? `<div class="kv"><span>Dinastia</span><b>${U.esc(c.dynasty)}</b></div>` : ''}
        <div class="kv"><span>Popolazione</span><b>${U.fmt(c.totalPop(w))}</b></div>
        <div class="kv"><span>Stabilità</span><b>${Math.round(c.stability * 100)}%</b></div>
        <div class="kv"><span>Tesoro</span><b>${U.fmt(c.treasury)} monete</b></div>
        <div class="btn-row"><button class="btn" data-action="inspect-army" data-id="${c.id}">🛡️ Esercito</button></div>
        <h3>Cultura ${U.esc(cu.name)}</h3>
        <div class="kv"><span>Popolo</span><b>${U.esc(cu.demonym)}</b></div>
        <div class="kv"><span>Valori</span><b>${cu.values.map(U.esc).join(', ')}</b></div>
        <div class="kv"><span>Architettura</span><b>${U.esc(cu.architecture)}</b></div>
        <div class="kv"><span>Abiti</span><b>${U.esc(cu.clothing)}</b></div>
        <div class="kv"><span>Musica</span><b>${U.esc(cu.music)}</b></div>
        <div class="kv"><span>Cucina</span><b>${cu.foods.map(U.esc).join(', ')}</b></div>
        <div class="kv"><span>Simbolo</span><b>${U.esc(cu.symbol)}</b></div>
        <div class="kv"><span>Feste</span><b>${cu.festivals.map(f => `${U.esc(f.name)} (${U.esc(f.reason)})`).join('; ')}</b></div>
        <div class="kv"><span>Tradizioni</span><b>${cu.traditions.map(U.esc).join('; ')}</b></div>
        ${cu.mythology ? `<div class="kv"><span>Mito d'origine</span><b>${U.esc(cu.mythology)}</b></div>` : ''}
        <h3>Tecnologie (${c.techs.length}/${PCS.TECHS.length})</h3>
        <div class="tech-list">${c.techs.map(t => `<span class="chip">${U.esc(PCS.TECH_BY_ID[t].name)}</span>`).join('')}</div>
        ${c.researching ? `<div class="kv"><span>In ricerca</span><b>${U.esc(PCS.TECH_BY_ID[c.researching].name)} (${Math.round(c.research / PCS.TECH_BY_ID[c.researching].cost * 100)}%)</b></div>` : ''}
        <h3>Città (${cities.length})</h3>
        ${cities.map(x => `<div class="row link" data-action="inspect-city" data-id="${x.id}">🏘️ ${U.esc(x.name)}${c.capitalId === x.id ? ' ⭐' : ''} <span class="dim">${U.fmt(x.pop)} ab.</span></div>`).join('')}
        <h3>Diplomazia</h3>
        ${rels.slice(0, 8).map(({ o, v }) => `<div class="row link" data-action="inspect-civ" data-id="${o.id}"><span class="flag" style="background:rgb(${o.color.join(',')})"></span> ${U.esc(o.name)} <b class="${v > 20 ? 'pos' : v < -20 ? 'neg' : 'dim'}">${v > 0 ? '+' : ''}${Math.round(v)}</b>${PCS.atWar(w, c.id, o.id) ? ' ⚔️' : c.hasTreaty(o.id, 'alleanza') ? ' 🤝' : c.hasTreaty(o.id, 'commercio') ? ' ⛵' : ''}</div>`).join('') || '<div class="dim">Isolata dal mondo.</div>'}
        <h3>Guerre</h3>
        ${wars.slice(-6).reverse().map(x => `<div class="row link" data-action="inspect-war" data-id="${x.id}">⚔️ ${U.esc(x.name)} <span class="dim">${x.endYear ? 'conclusa' : 'in corso'}</span></div>`).join('') || '<div class="dim">Nessuna guerra combattuta.</div>'}`;
    }

    flagSVG(flag) {
      const bg = `hsl(${flag.bg},55%,38%)`, fg = `hsl(${flag.fg},65%,60%)`;
      let inner = '';
      switch (flag.pattern) {
        case 'bands': inner = `<rect x="0" y="7" width="30" height="6" fill="${fg}"/>`; break;
        case 'cross': inner = `<rect x="12" y="0" width="6" height="20" fill="${fg}"/><rect x="0" y="7" width="30" height="6" fill="${fg}"/>`; break;
        case 'circle': inner = `<circle cx="15" cy="10" r="5.5" fill="${fg}"/>`; break;
        case 'triangle': inner = `<path d="M0,0 L14,10 L0,20 Z" fill="${fg}"/>`; break;
        case 'diag': inner = `<path d="M0,20 L30,0 L30,6 L0,20 Z" fill="${fg}"/>`; break;
        case 'star': inner = `<path d="M15,3 L17,8.5 L23,8.5 L18,12 L20,18 L15,14 L10,18 L12,12 L7,8.5 L13,8.5 Z" fill="${fg}"/>`; break;
      }
      return `<svg class="flag-svg" width="30" height="20" viewBox="0 0 30 20"><rect width="30" height="20" fill="${bg}"/>${inner}</svg>`;
    }

    viewReligion(r) {
      if (!r) return '';
      const w = this.world;
      const holy = r.holyCityId != null ? w.cities[r.holyCityId] : null;
      const parent = r.parentId != null ? w.religions[r.parentId] : null;
      const founder = r.founderId != null ? w.people.get(r.founderId) : null;
      return `
        <h2>🕯️ ${U.esc(r.name)} ${r.dead ? '💀' : ''}</h2>
        <div class="dim">${U.esc(r.type)} · fondata ${U.yearLabel(r.foundedYear)}${parent ? ` · scisma da ${U.esc(parent.name)}` : ''}</div>
        <div class="kv"><span>Fedeli</span><b>${U.fmt(r.followers)}</b></div>
        <div class="kv"><span>Profeta</span><b>${founder ? `<span class="link" data-action="inspect-person" data-id="${founder.id}">${U.esc(r.prophetName)}</span>` : U.esc(r.prophetName)}</b></div>
        <div class="kv"><span>Testo sacro</span><b>${U.esc(r.sacredText)}</b></div>
        <div class="kv"><span>Luogo sacro</span><b>${holy ? `<span class="link" data-action="inspect-city" data-id="${holy.id}">${U.esc(holy.name)}</span>` : '—'}</b></div>
        <div class="kv"><span>Simbolo</span><b>${U.esc(r.symbol)}</b></div>
        <div class="kv"><span>Festa sacra</span><b>${U.esc(r.holyDay.name)} (${PCS.SEASONS[r.holyDay.season].toLowerCase()})</b></div>
        <h3>Divinità</h3>
        ${r.gods.map(g => `<div class="row">✨ <b>${U.esc(g.name)}</b> <span class="dim">${U.esc(g.domain)}</span></div>`).join('')}
        <h3>Mito d'origine</h3><div class="row">${U.esc(U.cap(r.mythos))}.</div>
        <h3>Riti</h3>${r.rites.map(x => `<div class="row">• ${U.esc(U.cap(x))}</div>`).join('')}
        <h3>Precetti</h3>${r.tenets.map(x => `<div class="row">• ${U.esc(U.cap(x))}</div>`).join('')}
        <h3>Aldilà</h3><div class="row">${U.esc(U.cap(r.afterlife))}.</div>`;
    }

    viewWar(x) {
      if (!x) return '';
      const w = this.world;
      const A = w.civs[x.attackerId], D = w.civs[x.defenderId];
      return `
        <h2>⚔️ ${U.esc(x.name)}</h2>
        <div class="dim">${U.yearLabel(x.startYear)} – ${x.endYear ? U.yearLabel(x.endYear) : 'in corso'}</div>
        <div class="kv"><span>Aggressore</span><b>${A ? `<span class="link" data-action="inspect-civ" data-id="${A.id}">${U.esc(A.name)}</span>` : '?'}</b></div>
        <div class="kv"><span>Difensore</span><b>${D ? `<span class="link" data-action="inspect-civ" data-id="${D.id}">${U.esc(D.name)}</span>` : '?'}</b></div>
        <div class="kv"><span>Causa</span><b>${U.esc(x.cause)}</b></div>
        <div class="kv"><span>Morti totali</span><b>${U.fmt(x.deaths)}</b></div>
        ${x.winnerId != null ? `<div class="kv"><span>Vincitore</span><b>${U.esc((w.civs[x.winnerId] || {}).name || '?')}</b></div>` : ''}
        ${x.heroIds && x.heroIds.length ? `<h3>Eroi</h3>${x.heroIds.map(id => { const p = w.people.get(id); return p ? `<div class="row link" data-action="inspect-person" data-id="${p.id}">🎖️ ${U.esc(p.fullName)}</div>` : ''; }).join('')}` : ''}
        <h3>Battaglie (${x.battles.length})</h3>
        ${x.battles.slice(-15).reverse().map(b => `<div class="row">⚔️ <b>${U.esc(b.name)}</b> <span class="dim">${U.yearLabel(b.y)} · vince ${U.esc((w.civs[b.winnerId] || {}).name || '?')} · ${U.fmt(b.deaths)} morti</span></div>`).join('') || '<div class="dim">Nessuna battaglia ancora.</div>'}`;
    }

    viewArmy(c) {
      if (!c) return '';
      const w = this.world;
      const g = w.people.get(c.army.generalId);
      const power = Math.round(PCS.armyPower(w, c));
      return `
        <h2>🛡️ Esercito di ${U.esc(c.name)}</h2>
        <div class="stat-grid">
          <div class="stat"><div class="stat-v">${U.fmt(c.army.size)}</div><div class="stat-l">Soldati</div></div>
          <div class="stat"><div class="stat-v">${Math.round(c.army.quality * 100)}%</div><div class="stat-l">Addestramento</div></div>
          <div class="stat"><div class="stat-v">${Math.round(c.army.morale * 100)}%</div><div class="stat-l">Morale</div></div>
          <div class="stat"><div class="stat-v">${U.fmt(power)}</div><div class="stat-l">Potenza</div></div>
        </div>
        <div class="kv"><span>Generale</span><b>${g ? `<span class="link" data-action="inspect-person" data-id="${g.id}">${U.esc(g.fullName)}</span>` : '—'}</b></div>
        <div class="kv"><span>Logoramento bellico</span><b>${Math.round(c.warExhaustion * 100)}%</b></div>
        <div class="kv"><span>Armamenti</span><b>${['polvere', 'acciaio', 'ferro', 'bronzo'].map(t => c.techs.includes(t) ? PCS.TECH_BY_ID[t].name : null).filter(Boolean)[0] || 'pietra e legno'}</b></div>
        <div class="btn-row"><button class="btn" data-action="inspect-civ" data-id="${c.id}">← ${U.esc(c.name)}</button></div>`;
    }

    viewFamily(p) {
      if (!p) return '';
      const w = this.world;
      const link = (o) => o ? `<span class="link" data-action="inspect-person" data-id="${o.id}">${U.esc(o.fullName)}${o.alive ? ` <span class="dim">(${o.age(w.year)})</span>` : ' †'}</span>` : '<span class="dim">?</span>';
      const get = (id) => w.people.get(id);
      const father = get(p.fatherId), mother = get(p.motherId);
      const gpp = father ? [get(father.fatherId), get(father.motherId)] : [];
      const gpm = mother ? [get(mother.fatherId), get(mother.motherId)] : [];
      const sibs = [];
      for (const o of w.people.values()) {
        if (o.id !== p.id && ((p.fatherId != null && o.fatherId === p.fatherId) || (p.motherId != null && o.motherId === p.motherId))) sibs.push(o);
      }
      // cousins: children of parents' siblings
      const cousins = [];
      for (const par of [father, mother]) {
        if (!par) continue;
        for (const o of w.people.values()) {
          if (o.id !== par.id && ((par.fatherId != null && o.fatherId === par.fatherId) || (par.motherId != null && o.motherId === par.motherId))) {
            for (const cid of o.childrenIds) { const c = get(cid); if (c) cousins.push(c); }
          }
        }
      }
      const renderDesc = (person, depth) => {
        if (depth > 4) return '';
        const kids = person.childrenIds.map(get).filter(Boolean);
        if (!kids.length) return '';
        return `<ul>${kids.map(k => `<li>${link(k)}${renderDesc(k, depth + 1)}</li>`).join('')}</ul>`;
      };
      return `
        <h2>🌳 Famiglia di ${U.esc(p.fullName)}</h2>
        <div class="btn-row"><button class="btn" data-action="inspect-person" data-id="${p.id}">← scheda personale</button></div>
        <h3>Nonni</h3>
        <div class="row">Paterni: ${gpp.length ? gpp.map(link).join(' · ') : '<span class="dim">sconosciuti</span>'}</div>
        <div class="row">Materni: ${gpm.length ? gpm.map(link).join(' · ') : '<span class="dim">sconosciuti</span>'}</div>
        <h3>Genitori</h3>
        <div class="row">${link(father)} ⚭ ${link(mother)}</div>
        <h3>Fratelli e sorelle (${sibs.length})</h3>
        ${sibs.map(s => `<div class="row">${link(s)}</div>`).join('') || '<div class="dim">Nessuno</div>'}
        ${cousins.length ? `<h3>Cugini (${cousins.length})</h3>${cousins.slice(0, 10).map(s => `<div class="row">${link(s)}</div>`).join('')}` : ''}
        <h3>Discendenza</h3>
        <div class="family-tree">${link(p)}${renderDesc(p, 0) || '<div class="dim">Nessun discendente.</div>'}</div>`;
    }

    // ---------------- chat ----------------
    openChat(personId) {
      const p = this.world.people.get(personId);
      if (!p || !p.alive) return;
      this.chat = new PCS.ChatSession(this.world, p);
      this.chat._resumeSpeed = this.app.speed;
      this.app.setSpeed(0); // time pauses while you talk
      $('#chat-modal').classList.add('open');
      $('#chat-title').textContent = `💬 ${p.fullName}`;
      const city = this.world.cities[p.cityId];
      $('#chat-subtitle').textContent = `${p.age(this.world.year)} anni · ${p.profession} · ${city ? city.name : '—'} · ${U.yearLabel(this.world.year)}`;
      $('#chat-log').innerHTML = '';
      $('#chat-input').value = '';
      // NPC opens the conversation
      const opening = this.chat.respond('');
      this.chatBubble('npc', opening);
      $('#chat-input').focus();
    }
    closeChat() {
      if (this.chat) {
        this.chat.end();
        this.app.setSpeed(this.chat._resumeSpeed != null ? this.chat._resumeSpeed : 1);
        this.chat = null;
      }
      $('#chat-modal').classList.remove('open');
      this.renderInspector();
    }
    sendChat() {
      if (!this.chat) return;
      const input = $('#chat-input');
      const txt = input.value.trim();
      if (!txt) return;
      input.value = '';
      this.chatBubble('player', txt);
      const typing = document.createElement('div');
      typing.className = 'bubble npc typing';
      typing.textContent = '…';
      $('#chat-log').appendChild(typing);
      $('#chat-log').scrollTop = $('#chat-log').scrollHeight;
      setTimeout(() => {
        typing.remove();
        const reply = this.chat.respond(txt);
        this.chatBubble('npc', reply);
      }, 350 + Math.random() * 600);
    }
    chatBubble(who, text) {
      const log = $('#chat-log');
      const b = document.createElement('div');
      b.className = 'bubble ' + who;
      // *azioni* in corsivo
      const html = U.esc(text).replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
      b.innerHTML = html;
      log.appendChild(b);
      log.scrollTop = log.scrollHeight;
    }

    // periodic refresh
    refresh() {
      this.renderTopbar();
      if (this.tab === 'world' && this.feedDirty) {
        const feedEl = document.getElementById('feed');
        if (feedEl) { feedEl.innerHTML = this.feedHTML(); this.feedDirty = false; }
      }
    }
  }

  PCS.UI = UI;
})();
