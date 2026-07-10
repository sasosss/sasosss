/* Application bootstrap: main loop, speed control, input, persistence with
   automatic saves and offline catch-up (the world keeps living while the
   page is closed). */
(function () {
  'use strict';
  const PCS = (globalThis.PCS = globalThis.PCS || {});
  const { U } = PCS;
  const SAVE_KEY = 'pcs_world_v1';
  const SPEEDS = [0, 1, 2, 5, 10, 50, 100, 1000];
  const BASE_YEARS_PER_SEC = 0.35;      // at 1×
  const MAX_OFFLINE_YEARS = 300;        // cap for catch-up simulation
  const FRAME_BUDGET_MS = 20;           // max sim time per frame

  class App {
    constructor() {
      this.world = null;
      this.speed = 1;
      this.acc = 0; // accumulated seasons to simulate
      this.lastT = performance.now();
      this.lastSave = Date.now();
      this.canvas = document.getElementById('map');
      this.renderer = new PCS.Renderer(this.canvas, document.getElementById('minimap'));
      this.ui = new PCS.UI(this);
      this.effSpeedNote = 0;
    }

    start() {
      this.resize();
      window.addEventListener('resize', () => this.resize());
      const saved = this.tryLoad();
      if (saved) {
        this.world = saved.world;
        this.renderer.attach(this.world);
        this.hideOverlay(); // catchUp re-shows it only if there is work to do
        this.catchUp(saved.elapsedMs);
      } else {
        this.newWorld(true);
      }
      this.bindInput();
      this.ui.renderPanel();
      this.ui.renderTopbar();
      requestAnimationFrame((t) => this.loop(t));
      // autosave every 20s + on close
      setInterval(() => this.save(), 20000);
      window.addEventListener('beforeunload', () => this.save());
      setInterval(() => { this.renderer.politicalDirty = true; }, 2500);
      setInterval(() => {
        if (this.speed > 0 && (this.ui.tab === 'world' || this.ui.tab === 'civs')) this.ui.renderPanel();
      }, 3000);
    }

    newWorld(first) {
      const seed = 'mondo-' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      this.showOverlay('Creazione del mondo…', 'Continenti, popoli, lingue e divinità stanno prendendo forma');
      setTimeout(() => {
        PCS.setPersonSeq(0); PCS.setCivSeq(0); PCS.setCitySeq(0); PCS.setCultureSeq(0); PCS.setReligionSeq(0);
        this.world = new PCS.World(seed);
        this.renderer.attach(this.world);
        this.ui.feed = [];
        this.ui.inspector = null;
        this.ui.renderInspector();
        this.ui.renderPanel();
        this.save();
        this.hideOverlay();
      }, 50);
    }

    // ---------------- persistence ----------------
    save() {
      if (!this.world) return;
      try {
        const data = this.world.serialize();
        localStorage.setItem(SAVE_KEY, 'LZ1' + PCS.LZ.compress(JSON.stringify(data)));
        this.lastSave = Date.now();
        const el = document.getElementById('save-indicator');
        if (el) el.textContent = '💾 auto-salvataggio attivo';
      } catch (e) {
        console.warn('Salvataggio fallito:', e);
        const el = document.getElementById('save-indicator');
        if (el) el.textContent = '⚠️ salvataggio fallito (memoria piena?)';
      }
    }

    tryLoad() {
      try {
        let raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        if (raw.startsWith('LZ1')) raw = PCS.LZ.decompress(raw.slice(3));
        const data = JSON.parse(raw);
        if (!data || data.v !== 1) return null;
        const world = PCS.World.deserialize(data);
        return { world, elapsedMs: Date.now() - (data.savedAt || Date.now()) };
      } catch (e) {
        console.warn('Caricamento fallito, nuovo mondo:', e);
        return null;
      }
    }

    exportSave() {
      const data = JSON.stringify(this.world.serialize());
      const blob = new Blob([data], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${this.world.worldName || 'mondo'}-anno${this.world.year}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    // While the page was closed the world kept moving: simulate elapsed time.
    catchUp(elapsedMs) {
      const offlineYears = Math.min(MAX_OFFLINE_YEARS, (elapsedMs / 1000) * BASE_YEARS_PER_SEC * Math.max(1, this.speed));
      if (offlineYears < 1) return;
      const seasons = Math.floor(offlineYears * 4);
      const startYear = this.world.year;
      this.showOverlay('Il mondo ha continuato a vivere…', `Simulazione di ${Math.floor(offlineYears)} anni trascorsi durante la tua assenza`);
      let done = 0;
      const step = () => {
        const t0 = performance.now();
        while (done < seasons && performance.now() - t0 < 30) {
          this.world.tick();
          done++;
        }
        this.setOverlayProgress(done / seasons, `${U.yearLabel(this.world.year)} — ${done}/${seasons}`);
        if (done < seasons) {
          setTimeout(step, 0);
        } else {
          this.hideOverlay();
          this.world.chronicle.add(this.world.year, 'giocatore', `Il Viandante torna a osservare il mondo dopo ${this.world.year - startYear} anni.`, 2);
          this.renderer.politicalDirty = true;
          this.ui.renderPanel();
          this.save();
        }
      };
      setTimeout(step, 100);
    }

    showOverlay(title, sub) {
      const o = document.getElementById('overlay');
      o.style.display = 'flex';
      o.querySelector('h1').textContent = title;
      o.querySelector('p').textContent = sub || '';
      this.setOverlayProgress(0, '');
    }
    setOverlayProgress(f, label) {
      const bar = document.querySelector('#overlay .progress-fill');
      if (bar) bar.style.width = Math.round(f * 100) + '%';
      const lb = document.querySelector('#overlay .progress-label');
      if (lb) lb.textContent = label || '';
    }
    hideOverlay() { document.getElementById('overlay').style.display = 'none'; }

    // ---------------- loop ----------------
    setSpeed(s) {
      this.speed = s;
      this.ui.renderTopbar();
    }

    loop(t) {
      const dt = Math.min(0.25, (t - this.lastT) / 1000);
      this.lastT = t;
      if (this.world && this.speed > 0 && !this.ui.chat) {
        this.acc += dt * BASE_YEARS_PER_SEC * this.speed * 4; // seasons
        const t0 = performance.now();
        let steps = 0;
        while (this.acc >= 1 && performance.now() - t0 < FRAME_BUDGET_MS) {
          this.world.tick();
          this.acc -= 1;
          steps++;
        }
        if (this.acc > 8) this.acc = 8; // drop backlog beyond budget (speed becomes "best effort")
        if (steps > 0 && this.world.year % 5 === 0) this.renderer.politicalDirty = true;
      }
      this.renderer.render();
      if ((this._uiT = (this._uiT || 0) + dt) > 0.5) {
        this._uiT = 0;
        this.ui.refresh();
        if (this.ui.inspector && this.speed > 0) this.ui.renderInspector();
      }
      requestAnimationFrame((tt) => this.loop(tt));
    }

    // ---------------- input ----------------
    resize() {
      const wrap = document.getElementById('map-wrap');
      this.canvas.width = wrap.clientWidth;
      this.canvas.height = wrap.clientHeight;
    }

    bindInput() {
      const cv = this.canvas, r = this.renderer;
      let dragging = false, moved = false, lx = 0, ly = 0;
      cv.addEventListener('mousedown', (e) => { dragging = true; moved = false; lx = e.clientX; ly = e.clientY; });
      window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - lx, dy = e.clientY - ly;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        r.cam.x -= dx / r.cam.zoom;
        r.cam.y -= dy / r.cam.zoom;
        r.clampCam();
        lx = e.clientX; ly = e.clientY;
      });
      window.addEventListener('mouseup', () => { dragging = false; });
      cv.addEventListener('click', (e) => {
        if (moved) return;
        const rect = cv.getBoundingClientRect();
        const city = r.cityAt(e.clientX - rect.left, e.clientY - rect.top);
        if (city) {
          r.selectedCity = city.id;
          this.ui.inspect('city', city.id);
        }
      });
      cv.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = cv.getBoundingClientRect();
        r.zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
      }, { passive: false });
      // touch support
      let pinchDist = 0;
      cv.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) { dragging = true; moved = false; lx = e.touches[0].clientX; ly = e.touches[0].clientY; }
        else if (e.touches.length === 2) pinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      }, { passive: true });
      cv.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && dragging) {
          const dx = e.touches[0].clientX - lx, dy = e.touches[0].clientY - ly;
          if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
          r.cam.x -= dx / r.cam.zoom; r.cam.y -= dy / r.cam.zoom; r.clampCam();
          lx = e.touches[0].clientX; ly = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
          const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
          if (pinchDist) r.zoomAt(cv.width / 2, cv.height / 2, d / pinchDist);
          pinchDist = d;
        }
        e.preventDefault();
      }, { passive: false });
      cv.addEventListener('touchend', () => { dragging = false; pinchDist = 0; });
      // minimap click
      const mm = document.getElementById('minimap');
      const mmMove = (e) => {
        const rect = mm.getBoundingClientRect();
        const fx = (e.clientX - rect.left) / rect.width, fy = (e.clientY - rect.top) / rect.height;
        r.centerOn(fx * this.world.map.w, fy * this.world.map.h);
      };
      mm.addEventListener('mousedown', (e) => { mmMove(e); const mv = (ev) => mmMove(ev); const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); });
      // keyboard
      window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === ' ') { e.preventDefault(); this.setSpeed(this.speed === 0 ? 1 : 0); }
        const k = '12345678'.indexOf(e.key);
        if (k >= 0 && k < SPEEDS.length) this.setSpeed(SPEEDS[k]);
      });
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    PCS.app = app;
    app.start();
  });
})();
