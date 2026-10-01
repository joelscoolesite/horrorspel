// =============================================================
//  editor.js — BOUW-MODUS: ontwerp je eigen organisme
// =============================================================
//
//   klik in lege ruimte   → nieuwe bol, vast aan de geselecteerde bol
//   klik op een bol       → selecteren        (sleep = verplaatsen)
//   Shift + klik op bol   → stokje erbij / weg (naar de geselecteerde bol)
//   klik op een stokje    → spier (rood) ↔ bot (wit)
//   Delete                → geselecteerde bol weg
//
//  Het ontwerp wordt daarna omgezet naar een groeiprogramma
//  (Genome.fromDesign): ook jouw wezen begint zijn leven als één bol.
(function (G) {
  'use strict';
  const MAX_NODES = 24, MAX_STICKS = 60;

  // ---------- kant-en-klare startvormen ----------
  function preset(name, cfg) {
    const R = cfg.body.rootRadius, r = 0.13;
    const nodes = [], sticks = [];
    const node = (x, y, z, rad = r) => nodes.push({ x, y, z, r: rad }) - 1;
    const stick = (a, b, m = true) => sticks.push({ a, b, m });
    if (name === 'spider') {
      const root = node(0, 0.75, 0, R);
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2, c = Math.cos(a), s = Math.sin(a);
        const knee = node(c * 0.55, 0.85, s * 0.55);
        const foot = node(c * 0.95, r, s * 0.95);
        stick(root, knee, false);
        stick(knee, foot, true);
        stick(root, foot, true);
      }
    } else if (name === 'snake') {
      const root = node(0, R, 0, R);
      let prev = root, prev2 = -1;
      for (let i = 1; i <= 5; i++) {
        const n = node(-0.55 * i, r, 0);
        stick(prev, n, false);
        if (prev2 >= 0) stick(prev2, n, true);
        prev2 = prev; prev = n;
      }
    } else if (name === 'wheel') {
      const root = node(0, 0.9, 0, R);
      const ring = [];
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        ring.push(node(Math.cos(a) * 0.75, 0.9 + Math.sin(a) * 0.75, 0));
      }
      ring.forEach((n, i) => { stick(root, n, true); stick(n, ring[(i + 1) % 6], false); });
    } else if (name === 'jumper') {
      const root = node(0, 0.7, 0, R);
      const back = node(-0.7, r, 0.3), back2 = node(-0.7, r, -0.3);
      const front = node(0.6, r, 0.3), front2 = node(0.6, r, -0.3);
      const tail = node(-0.9, 0.9, 0);
      [back, back2, front, front2].forEach(n => stick(root, n, true));
      stick(back, back2, false); stick(front, front2, false);
      stick(back, front, true); stick(back2, front2, true);
      stick(root, tail, true); stick(tail, back, false); stick(tail, back2, false);
    } else {
      node(0, R + 0.01, 0, R); // leeg: alleen de hoofdbol
    }
    return { nodes, sticks };
  }

  class Editor {
    constructor(view, cfg, hooks) {
      this.view = view;
      this.cfg = cfg;
      this.hooks = hooks; // { toast, onChange }
      this.active = false;
      this.linkMode = false;
      this.design = preset('blank', cfg);
      this.sel = 0;
      const el = view.renderer.domElement;
      // capture: wij zijn eerder dan OrbitControls (nodig om bollen te slepen)
      el.addEventListener('pointerdown', e => this._down(e), { capture: true });
      el.addEventListener('pointermove', e => this._move(e));
      window.addEventListener('pointerup', e => this._up(e));
      window.addEventListener('keydown', e => {
        if (!this.active || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.deleteSelected(); }
      });
    }

    open(design) {
      this.active = true;
      if (design) { this.design = design; this.sel = 0; }
      this.view.setEditMode(true);
      this.refresh();
    }

    close() {
      this.active = false;
      this.view.controls.enabled = true;
      this.view.setEditMode(false);
    }

    loadPreset(name) {
      this.design = preset(name, this.cfg);
      this.sel = 0;
      this.refresh();
    }

    refresh() {
      this.view.showDesign(this.design, this.sel);
      this.hooks.onChange(this.info());
    }

    info() {
      const d = this.design;
      const muscles = d.sticks.filter(s => s.m).length;
      const g = G.Genome.fromDesign(d, new G.RNG(1));
      return {
        text: `${d.nodes.length} spheres · ${d.sticks.length} sticks (${muscles} muscles)`,
        problem: !g ? 'Not every sphere is connected to the orange main sphere.'
          : muscles === 0 ? 'Add at least one muscle (click a stick to make it red).' : ''
      };
    }

    // ---------- bewerkingen ----------
    _clampY(p, r) { if (p.y < r) p.y = r; return p; }

    addNodeAt(p) {
      const d = this.design, B = this.cfg.body, from = d.nodes[this.sel];
      if (d.nodes.length >= MAX_NODES) return this.hooks.toast(`Max ${MAX_NODES} spheres`);
      if (d.sticks.length >= MAX_STICKS) return this.hooks.toast(`Max ${MAX_STICKS} sticks`);
      const q = this._limitDistance(from, p);
      const r = 0.13;
      this._clampY(q, r);
      if (d.nodes.some(n => Math.hypot(n.x - q.x, n.y - q.y, n.z - q.z) < n.r + r)) {
        return this.hooks.toast('Too close to another sphere');
      }
      const i = d.nodes.push({ x: q.x, y: q.y, z: q.z, r }) - 1;
      d.sticks.push({ a: this.sel, b: i, m: true });
      this.sel = i;
      this.refresh();
    }

    // nieuw punt op afstand [minStick, maxStick] van "from"
    _limitDistance(from, p) {
      const B = this.cfg.body;
      let dx = p.x - from.x, dy = p.y - from.y, dz = p.z - from.z;
      let l = Math.hypot(dx, dy, dz);
      if (l < 1e-6) { dx = 1; dy = 0; dz = 0; l = 1; }
      const t = Math.min(B.maxStick, Math.max(B.minStick + 0.15, l)) / l;
      return { x: from.x + dx * t, y: from.y + dy * t, z: from.z + dz * t };
    }

    toggleStick(a, b) {
      const d = this.design, B = this.cfg.body;
      const k = d.sticks.findIndex(s => (s.a === a && s.b === b) || (s.a === b && s.b === a));
      if (k >= 0) { d.sticks.splice(k, 1); this.refresh(); return; }
      const na = d.nodes[a], nb = d.nodes[b];
      const len = Math.hypot(na.x - nb.x, na.y - nb.y, na.z - nb.z);
      if (len > B.maxStick) return this.hooks.toast(`Too far apart for a stick (${len.toFixed(2)} m, max ${B.maxStick} m)`);
      if (d.sticks.length >= MAX_STICKS) return this.hooks.toast(`Max ${MAX_STICKS} sticks`);
      d.sticks.push({ a, b, m: true });
      this.refresh();
    }

    deleteSelected() {
      const d = this.design, i = this.sel;
      if (i === 0) return this.hooks.toast("The orange main sphere can't be deleted");
      d.nodes.splice(i, 1);
      d.sticks = d.sticks.filter(s => s.a !== i && s.b !== i);
      for (const s of d.sticks) { if (s.a > i) s.a--; if (s.b > i) s.b--; }
      this.sel = 0;
      this.refresh();
    }

    resizeSelected(delta) {
      const B = this.cfg.body, n = this.design.nodes[this.sel];
      if (this.sel === 0) return this.hooks.toast('The main sphere has a fixed size');
      n.r = Math.min(B.nodeRadiusMax + 0.07, Math.max(B.nodeRadiusMin, n.r + delta));
      this._clampY(n, n.r);
      this.refresh();
    }

    // ---------- muis ----------
    _down(e) {
      if (!this.active || e.button !== 0) return;
      const hit = this.view.pick(e.clientX, e.clientY);
      this.press = { x: e.clientX, y: e.clientY, hit, shift: e.shiftKey, dragging: false };
      if (hit && hit.type === 'node' && !(e.shiftKey || this.linkMode)) {
        this.view.controls.enabled = false; // niet draaien terwijl je een bol sleept
        const n = this.design.nodes[hit.index];
        this.press.start = { x: n.x, y: n.y, z: n.z };
      }
    }

    _move(e) {
      if (!this.active) return;
      const pr = this.press;
      if (pr && pr.start) {
        if (!pr.dragging && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) < 5) return;
        pr.dragging = true;
        const p = this.view.planePoint(e.clientX, e.clientY, pr.start);
        if (!p) return;
        const i = pr.hit.index, n = this.design.nodes[i], B = this.cfg.body;
        this._clampY(p, n.r);
        // alle stokjes van deze bol moeten binnen de maximale lengte blijven
        const ok = this.design.sticks.every(s => {
          if (s.a !== i && s.b !== i) return true;
          const o = this.design.nodes[s.a === i ? s.b : s.a];
          return Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z) <= B.maxStick;
        });
        if (ok) { n.x = p.x; n.y = p.y; n.z = p.z; this.sel = i; this.view.showDesign(this.design, this.sel); }
        return;
      }
      if (pr) return;
      // spook-bol laten zien waar een klik een nieuwe bol zou zetten
      const hit = this.view.pick(e.clientX, e.clientY);
      const from = this.design.nodes[this.sel];
      if (hit) { this.view.showGhost(null, null); return; }
      const p = this.view.planePoint(e.clientX, e.clientY, from);
      this.view.showGhost(from, p && this._clampY(this._limitDistance(from, p), 0.13), 0.13);
    }

    _up(e) {
      if (!this.active || !this.press) return;
      const pr = this.press;
      this.press = null;
      this.view.controls.enabled = true;
      if (pr.dragging) { this.refresh(); return; }
      if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > 5) return; // was camera draaien
      const hit = pr.hit;
      if (!hit) {
        const p = this.view.planePoint(e.clientX, e.clientY, this.design.nodes[this.sel]);
        if (p) this.addNodeAt(p);
      } else if (hit.type === 'node') {
        if ((pr.shift || this.linkMode) && hit.index !== this.sel) this.toggleStick(this.sel, hit.index);
        this.sel = hit.index;
        this.refresh();
      } else if (hit.type === 'stick') {
        const s = this.design.sticks[hit.index];
        s.m = !s.m;
        this.refresh();
      }
    }

    // Klaar met bouwen → genoom (of null + reden)
    toGenome(rng) {
      const info = this.info();
      if (info.problem) return { error: info.problem };
      const g = G.Genome.fromDesign(this.design, rng);
      return { genome: g };
    }
  }

  G.Editor = Editor;
  G.designPreset = preset;
})((globalThis.GROW = globalThis.GROW || {}));
