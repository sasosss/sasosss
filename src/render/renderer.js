/* Map renderer: pre-rendered terrain, political overlay, cities, wars,
   animals, smooth zoom & pan, minimap. */
(function () {
  'use strict';
  const PCS = (globalThis.PCS = globalThis.PCS || {});
  const { U } = PCS;

  class Renderer {
    constructor(canvas, minimap) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.minimap = minimap;
      this.mctx = minimap.getContext('2d');
      this.cam = { x: 0, y: 0, zoom: 4 }; // zoom = screen px per tile
      this.terrain = null;   // offscreen base terrain
      this.political = null; // offscreen ownership overlay
      this.politicalDirty = true;
      this.hoverTile = null;
      this.selectedCity = null;
      this.showBorders = true;
      this.showAnimals = true;
      this._flashes = []; // {x,y,color,t} battle/disaster flashes
    }

    attach(world) {
      this.world = world;
      this.buildTerrain();
      this.political = document.createElement('canvas');
      this.political.width = world.map.w;
      this.political.height = world.map.h;
      this.politicalDirty = true;
      // center on first living city
      const c = world.cities.find(c => !c.dead);
      if (c) { this.centerOn(c.x, c.y); }
    }

    buildTerrain() {
      const map = this.world.map;
      const cv = document.createElement('canvas');
      cv.width = map.w; cv.height = map.h;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(map.w, map.h);
      const d = img.data;
      for (let i = 0; i < map.w * map.h; i++) {
        const b = map.biome[i];
        let [r, g, bl] = PCS.BIOME_INFO[b].col;
        // elevation shading
        const e = map.elev[i];
        const shade = b === 0 ? U.clamp(1 + e * 1.6, 0.55, 1) : U.clamp(0.82 + e * 0.5, 0.7, 1.3);
        r *= shade; g *= shade; bl *= shade;
        // forest darkening
        const f = map.forest[i];
        if (f > 0.15) { r = r * (1 - f * 0.35); g = g * (1 - f * 0.12); bl = bl * (1 - f * 0.3); }
        if (map.river[i]) { r = 40; g = 92; bl = 150; }
        d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = bl; d[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      this.terrain = cv;
    }

    rebuildPolitical() {
      const map = this.world.map;
      const ctx = this.political.getContext('2d');
      ctx.clearRect(0, 0, map.w, map.h);
      const img = ctx.createImageData(map.w, map.h);
      const d = img.data;
      for (let i = 0; i < map.w * map.h; i++) {
        const o = map.owner[i];
        if (o < 0) continue;
        const civ = this.world.civs[o];
        if (!civ || civ.dead) continue;
        const [r, g, b] = civ.color;
        d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 64;
        // borders stronger
        const x = i % map.w, y = (i / map.w) | 0;
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (!map.inb(nx, ny) || map.owner[map.idx(nx, ny)] !== o) { d[i * 4 + 3] = 150; break; }
        }
      }
      ctx.putImageData(img, 0, 0);
      this.politicalDirty = false;
    }

    centerOn(tx, ty) {
      this.cam.x = tx - this.canvas.width / (2 * this.cam.zoom);
      this.cam.y = ty - this.canvas.height / (2 * this.cam.zoom);
      this.clampCam();
    }
    clampCam() {
      const map = this.world.map;
      const vw = this.canvas.width / this.cam.zoom, vh = this.canvas.height / this.cam.zoom;
      this.cam.x = U.clamp(this.cam.x, -vw * 0.3, map.w - vw * 0.7);
      this.cam.y = U.clamp(this.cam.y, -vh * 0.3, map.h - vh * 0.7);
    }
    screenToTile(sx, sy) {
      return { x: this.cam.x + sx / this.cam.zoom, y: this.cam.y + sy / this.cam.zoom };
    }
    zoomAt(sx, sy, factor) {
      const before = this.screenToTile(sx, sy);
      this.cam.zoom = U.clamp(this.cam.zoom * factor, 1.2, 42);
      const after = this.screenToTile(sx, sy);
      this.cam.x += before.x - after.x;
      this.cam.y += before.y - after.y;
      this.clampCam();
    }

    flash(x, y, color) {
      this._flashes.push({ x, y, color, t: 1 });
      if (this._flashes.length > 30) this._flashes.shift();
    }

    render() {
      const { ctx, canvas, cam } = this;
      const world = this.world;
      if (!world || !this.terrain) return;
      if (this.politicalDirty) this.rebuildPolitical();
      ctx.fillStyle = '#06090f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = cam.zoom < 6;
      ctx.save();
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);
      ctx.drawImage(this.terrain, 0, 0);
      // seasonal tint
      const tints = ['rgba(120,220,120,0.03)', 'rgba(255,230,120,0.04)', 'rgba(230,150,60,0.05)', 'rgba(180,200,255,0.08)'];
      ctx.fillStyle = tints[world.season];
      ctx.fillRect(cam.x, cam.y, canvas.width / cam.zoom, canvas.height / cam.zoom);
      if (this.showBorders) ctx.drawImage(this.political, 0, 0);
      ctx.restore();

      // trade routes at medium zoom
      if (cam.zoom > 3) {
        ctx.save();
        ctx.strokeStyle = 'rgba(220,200,120,0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 5]);
        for (const c of world.cities) {
          if (c.dead) continue;
          for (const rid of c.tradeRoutes) {
            if (rid < c.id) continue;
            const o = world.cities[rid];
            if (!o || o.dead) continue;
            const [x1, y1] = this.toScreen(c.x + 0.5, c.y + 0.5);
            const [x2, y2] = this.toScreen(o.x + 0.5, o.y + 0.5);
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          }
        }
        ctx.restore();
      }

      // animals
      if (this.showAnimals && cam.zoom > 5) {
        for (const a of world.animals) {
          if (a.extinct) continue;
          const [sx, sy] = this.toScreen(a.x, a.y);
          if (sx < -20 || sy < -20 || sx > canvas.width + 20 || sy > canvas.height + 20) continue;
          ctx.font = `${Math.min(14, cam.zoom)}px sans-serif`;
          ctx.globalAlpha = 0.7;
          ctx.fillText(a.type === 'predatore' ? '🐺' : '🦌', sx, sy);
          ctx.globalAlpha = 1;
        }
      }

      // cities
      for (const c of world.cities) {
        if (c.dead) {
          if (cam.zoom > 8) {
            const [sx, sy] = this.toScreen(c.x + 0.5, c.y + 0.5);
            ctx.fillStyle = 'rgba(150,150,150,0.5)';
            ctx.font = '10px sans-serif';
            ctx.fillText('▲', sx - 4, sy);
          }
          continue;
        }
        const civ = world.civs[c.civId];
        const [sx, sy] = this.toScreen(c.x + 0.5, c.y + 0.5);
        if (sx < -60 || sy < -60 || sx > canvas.width + 60 || sy > canvas.height + 60) continue;
        const r = U.clamp(Math.log2(2 + c.pop / 300) * cam.zoom * 0.24, 2.5, 16);
        // glow for capital
        if (civ && civ.capitalId === c.id) {
          ctx.beginPath();
          ctx.arc(sx, sy, r + 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${civ.color.join(',')},0.3)`;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = civ ? `rgb(${civ.color.join(',')})` : '#888';
        ctx.fill();
        ctx.lineWidth = this.selectedCity === c.id ? 2.5 : 1.2;
        ctx.strokeStyle = this.selectedCity === c.id ? '#fff' : 'rgba(0,0,0,0.55)';
        ctx.stroke();
        // status icons
        if (c.plague) { ctx.font = '11px sans-serif'; ctx.fillText('☠', sx + r, sy - r); }
        if (c.famine) { ctx.font = '11px sans-serif'; ctx.fillText('🌾', sx - r - 10, sy - r); }
        // label
        if (cam.zoom > 3.4) {
          ctx.font = `${civ && civ.capitalId === c.id ? 'bold ' : ''}${U.clamp(cam.zoom * 1.7, 10, 15)}px 'Segoe UI', sans-serif`;
          ctx.fillStyle = 'rgba(0,0,0,0.7)';
          ctx.fillText(c.name, sx + r + 3, sy + 4);
          ctx.fillStyle = '#e8e4da';
          ctx.fillText(c.name, sx + r + 2, sy + 3);
        }
      }

      // war lines between capitals
      ctx.save();
      ctx.strokeStyle = 'rgba(255,60,60,0.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 4]);
      for (const w of world.wars) {
        if (w.endYear) continue;
        const A = world.civs[w.attackerId], D = world.civs[w.defenderId];
        if (!A || !D || A.dead || D.dead) continue;
        const ca = world.cities[A.capitalId], cd = world.cities[D.capitalId];
        if (!ca || !cd) continue;
        const [x1, y1] = this.toScreen(ca.x, ca.y);
        const [x2, y2] = this.toScreen(cd.x, cd.y);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      ctx.restore();

      // event flashes
      for (const f of this._flashes) {
        f.t -= 0.02;
        if (f.t <= 0) continue;
        const [sx, sy] = this.toScreen(f.x, f.y);
        ctx.beginPath();
        ctx.arc(sx, sy, (1 - f.t) * 26 + 4, 0, Math.PI * 2);
        ctx.strokeStyle = f.color.replace('ALPHA', f.t.toFixed(2));
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      this._flashes = this._flashes.filter(f => f.t > 0);

      this.renderMinimap();
    }

    toScreen(tx, ty) {
      return [(tx - this.cam.x) * this.cam.zoom, (ty - this.cam.y) * this.cam.zoom];
    }

    renderMinimap() {
      const { mctx, minimap } = this;
      const map = this.world.map;
      mctx.imageSmoothingEnabled = true;
      mctx.drawImage(this.terrain, 0, 0, minimap.width, minimap.height);
      if (this.showBorders) mctx.drawImage(this.political, 0, 0, minimap.width, minimap.height);
      // cities
      const kx = minimap.width / map.w, ky = minimap.height / map.h;
      for (const c of this.world.cities) {
        if (c.dead) continue;
        const civ = this.world.civs[c.civId];
        mctx.fillStyle = civ ? `rgb(${civ.color.join(',')})` : '#999';
        mctx.fillRect(c.x * kx - 1, c.y * ky - 1, 2.5, 2.5);
      }
      // viewport
      const vw = this.canvas.width / this.cam.zoom, vh = this.canvas.height / this.cam.zoom;
      mctx.strokeStyle = 'rgba(255,255,255,0.85)';
      mctx.lineWidth = 1;
      mctx.strokeRect(this.cam.x * kx, this.cam.y * ky, vw * kx, vh * ky);
    }

    cityAt(sx, sy) {
      const t = this.screenToTile(sx, sy);
      let best = null, bd = 2.2;
      for (const c of this.world.cities) {
        if (c.dead) continue;
        const d = U.dist(c.x + 0.5, c.y + 0.5, t.x, t.y);
        const r = Math.max(1.2, U.clamp(Math.log2(2 + c.pop / 300) * 0.24, 0.5, 3));
        if (d < Math.max(bd, r)) { bd = d; best = c; }
      }
      return best;
    }
  }

  PCS.Renderer = Renderer;
})();
