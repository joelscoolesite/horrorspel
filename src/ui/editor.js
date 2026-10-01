// =============================================================
//  editor.js — BOUW-MODUS: ontwerp je eigen organisme
// =============================================================
//
//   klik in lege ruimte   → nieuwe bol, vast aan de geselecteerde bol
//   klik op een bol       → selecteren        (sleep = verplaatsen)
//   Shift + klik op bol   → stokje erbij / weg (naar de geselecteerde bol)
//   klik op een stokje    → spier (rood) ↔ bot (wit)
//   Delete                → geselecteerde bol weg
//   Ctrl+Z / Ctrl+Y       → ongedaan maken / opnieuw
//
//  SPIEGEL-MODUS 🪞: wat je aan de ene kant bouwt, verschijnt ook aan de
//  andere kant (z → −z). Spiegel-paren delen straks hun brein (zie
//  genome.js), dus de AI hoeft maar half zoveel te leren.
//
//  Het ontwerp wordt daarna omgezet naar een groeiprogramma
//  (Genome.fromDesign): ook jouw wezen begint zijn leven als één bol.
(function (G) {
  'use strict';
  const MAX_NODES = 24, MAX_STICKS = 60, MID = 0.1; // |z| < MID = op de middellijn
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

  // Zoek spiegel-paren op basis van posities (voor startvormen en oude ontwerpen)
  function autoMirror(design) {
    const N = design.nodes;
    N.forEach(n => { n.mir = -1; });
    N.forEach((n, i) => {
      if (Math.abs(n.z) < MID || n.mir >= 0) return;
      const j = N.findIndex((o, k) => k !== i && o.mir < 0 && Math.abs(o.x - n.x) < 1e-6 &&
        Math.abs(o.y - n.y) < 1e-6 && Math.abs(o.z + n.z) < 1e-6);
      if (j >= 0) { n.mir = j; N[j].mir = i; }
    });
    const S = design.sticks;
    S.forEach(s => { s.mir = -1; });
    const mt = i => (N[i].mir >= 0 ? N[i].mir : i);
    S.forEach((s, k) => {
      if (s.mir >= 0) return;
      const a = mt(s.a), b = mt(s.b);
      const j = S.findIndex((o, q) => q !== k && o.mir < 0 &&
        ((o.a === a && o.b === b) || (o.a === b && o.b === a)));
      if (j >= 0 && !((a === s.a && b === s.b) || (a === s.b && b === s.a))) { s.mir = j; S[j].mir = k; }
    });
    return design;
  }

  // ---------- kant-en-klare startvormen ----------
  function preset(name, cfg) {
    const R = cfg.body.rootRadius, r = 0.13;
    const nodes = [], sticks = [];
    const node = (x, y, z, rad = r) => nodes.push({ x, y, z, r: rad }) - 1;
    const stick = (a, b, m = true) => sticks.push({ a, b, m, anti: true });
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
    } else if (name === 'walker') {
      // tweebeens: heupen links/rechts, knieën, voeten
      const root = node(0, 1.0, 0, R);
      for (const z of [0.3, -0.3]) {
        const hip = node(0, 0.85, z), knee = node(0.2, 0.45, z), foot = node(0, r, z);
        const toe = node(0.35, r, z);
        stick(root, hip, false); stick(hip, knee, true); stick(knee, foot, true);
        stick(foot, toe, false); stick(knee, toe, true); stick(root, knee, true);
      }
    } else {
      node(0, R + 0.01, 0, R); // leeg: alleen de hoofdbol
    }
    return autoMirror({ nodes, sticks });
  }

  class Editor {
    constructor(view, cfg, hooks) {
      this.view = view;
      this.cfg = cfg;
      this.hooks = hooks; // { toast, onChange, sound }
      this.active = false;
      this.linkMode = false;
      this.mirrorMode = true;
      this.design = preset('blank', cfg);
      this.sel = 0;
      this.undoStack = [];
      this.redoStack = [];
      const el = view.renderer.domElement;
      // capture: wij zijn eerder dan OrbitControls (nodig om bollen te slepen)
      el.addEventListener('pointerdown', e => this._down(e), { capture: true });
      el.addEventListener('pointermove', e => this._move(e));
      window.addEventListener('pointerup', e => this._up(e));
      window.addEventListener('keydown', e => {
        if (!this.active || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
        const key = e.key.toLowerCase();
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.deleteSelected(); }
        else if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
        else if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); this.redo(); }
      });
    }

    open(design) {
      this.active = true;
      if (design) { this._snapshot(); this.design = autoMirrorIfNeeded(design); this.sel = 0; }
      this.view.setEditMode(true);
      this.refresh();
    }

    close() {
      this.active = false;
      this.view.controls.enabled = true;
      this.view.setEditMode(false);
    }

    loadPreset(name) {
      this._snapshot();
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
      const pairs = d.nodes.filter((n, i) => n.mir > i).length;
      const g = G.Genome.fromDesign(d, new G.RNG(1));
      return {
        text: `${d.nodes.length} spheres · ${d.sticks.length} sticks (${muscles} muscles)` +
          (pairs ? ` · ${pairs} mirror pair${pairs > 1 ? 's' : ''}` : ''),
        problem: !g ? 'Not every sphere is connected to the orange main sphere.'
          : muscles === 0 ? 'Add at least one muscle (click a stick to make it red).' : '',
        canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0
      };
    }

    // ---------- ongedaan maken ----------
    _snapshot() {
      this.undoStack.push(JSON.stringify({ design: this.design, sel: this.sel }));
      if (this.undoStack.length > 100) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    undo() {
      if (!this.undoStack.length) return this.hooks.toast('Nothing to undo');
      this.redoStack.push(JSON.stringify({ design: this.design, sel: this.sel }));
      this._restore(this.undoStack.pop());
      this.hooks.sound('unlink');
    }
    redo() {
      if (!this.redoStack.length) return this.hooks.toast('Nothing to redo');
      this.undoStack.push(JSON.stringify({ design: this.design, sel: this.sel }));
      this._restore(this.redoStack.pop());
      this.hooks.sound('link');
    }
    _restore(json) {
      const s = JSON.parse(json);
      this.design = s.design;
      this.sel = Math.min(s.sel, this.design.nodes.length - 1);
      this.refresh();
    }

    // ---------- spiegel-hulpjes ----------
    _partner(i) { const m = this.design.nodes[i].mir; return m >= 0 ? m : -1; }
    _onMid(i) { return Math.abs(this.design.nodes[i].z) < MID; }
    // spiegel-doel van bol i: zijn partner, of hijzelf als hij op de middellijn ligt, anders -1
    _mirrorOf(i) { const p = this._partner(i); return p >= 0 ? p : this._onMid(i) ? i : -1; }
    _findStick(a, b) {
      return this.design.sticks.findIndex(s => (s.a === a && s.b === b) || (s.a === b && s.b === a));
    }

    // ---------- bewerkingen ----------
    _clampY(p, r) { if (p.y < r) p.y = r; return p; }

    addNodeAt(p) {
      const d = this.design, from = d.nodes[this.sel];
      const q = this._clampY(this._limitDistance(from, p), 0.13);
      const r = 0.13;
      const mf = this._mirrorOf(this.sel);
      const mirror = this.mirrorMode && Math.abs(q.z) >= MID && mf >= 0;
      const need = mirror ? 2 : 1;
      if (d.nodes.length + need > MAX_NODES) return this.hooks.toast(`Max ${MAX_NODES} spheres`);
      if (d.sticks.length + need > MAX_STICKS) return this.hooks.toast(`Max ${MAX_STICKS} sticks`);
      const mq = { x: q.x, y: q.y, z: -q.z };
      const tooClose = pt => d.nodes.some(n => dist(n, pt) < n.r + r);
      if (tooClose(q) || (mirror && (tooClose(mq) || dist(q, mq) < 2 * r))) {
        return this.hooks.toast('Too close to another sphere');
      }
      this._snapshot();
      const i = d.nodes.push({ x: q.x, y: q.y, z: q.z, r, mir: -1 }) - 1;
      const k = d.sticks.push({ a: this.sel, b: i, m: true, mir: -1, anti: true }) - 1;
      if (mirror) {
        const j = d.nodes.push({ x: mq.x, y: mq.y, z: mq.z, r, mir: i }) - 1;
        d.nodes[i].mir = j;
        const k2 = d.sticks.push({ a: mf, b: j, m: true, mir: k, anti: true }) - 1;
        d.sticks[k].mir = k2;
      }
      this.sel = i;
      this.hooks.sound('add');
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
      const k = this._findStick(a, b);
      if (k >= 0) {
        this._snapshot();
        const partner = d.sticks[k].mir;
        this._removeSticks(new Set(partner >= 0 ? [k, partner] : [k]));
        this.hooks.sound('unlink');
        this.refresh();
        return;
      }
      const na = d.nodes[a], nb = d.nodes[b];
      const len = dist(na, nb);
      if (len > B.maxStick) return this.hooks.toast(`Too far apart for a stick (${len.toFixed(2)} m, max ${B.maxStick} m)`);
      if (d.sticks.length >= MAX_STICKS) return this.hooks.toast(`Max ${MAX_STICKS} sticks`);
      this._snapshot();
      const k1 = d.sticks.push({ a, b, m: true, mir: -1, anti: true }) - 1;
      if (this.mirrorMode) {
        const ma = this._mirrorOf(a), mb = this._mirrorOf(b);
        const same = (ma === a && mb === b) || (ma === b && mb === a);
        if (ma >= 0 && mb >= 0 && ma !== mb && !same && this._findStick(ma, mb) < 0 && d.sticks.length < MAX_STICKS) {
          const k2 = d.sticks.push({ a: ma, b: mb, m: true, mir: k1, anti: true }) - 1;
          d.sticks[k1].mir = k2;
        }
      }
      this.hooks.sound('link');
      this.refresh();
    }

    // stokjes weghalen en spiegel-verwijzingen bijwerken
    _removeSticks(gone) {
      const d = this.design, map = [];
      let n = 0;
      d.sticks.forEach((s, k) => { map[k] = gone.has(k) ? -1 : n++; });
      d.sticks = d.sticks.filter((s, k) => !gone.has(k));
      for (const s of d.sticks) s.mir = s.mir >= 0 ? map[s.mir] : -1;
    }

    deleteSelected() {
      const d = this.design, i = this.sel;
      if (i === 0) return this.hooks.toast("The orange main sphere can't be deleted");
      this._snapshot();
      const gone = new Set([i]);
      if (this.mirrorMode && d.nodes[i].mir >= 0) gone.add(d.nodes[i].mir);
      // stokjes die een verwijderde bol raken gaan ook weg
      const goneSticks = new Set();
      d.sticks.forEach((s, k) => { if (gone.has(s.a) || gone.has(s.b)) goneSticks.add(k); });
      this._removeSticks(goneSticks);
      const map = [];
      let n = 0;
      d.nodes.forEach((x, k) => { map[k] = gone.has(k) ? -1 : n++; });
      d.nodes = d.nodes.filter((x, k) => !gone.has(k));
      for (const x of d.nodes) x.mir = x.mir >= 0 ? map[x.mir] : -1;
      for (const s of d.sticks) { s.a = map[s.a]; s.b = map[s.b]; }
      this.sel = 0;
      this.hooks.sound('delete');
      this.refresh();
    }

    resizeSelected(delta) {
      const B = this.cfg.body;
      if (this.sel === 0) return this.hooks.toast('The main sphere has a fixed size');
      this._snapshot();
      for (const i of [this.sel, this._partner(this.sel)]) {
        if (i < 0) continue;
        const n = this.design.nodes[i];
        n.r = Math.min(B.nodeRadiusMax + 0.07, Math.max(B.nodeRadiusMin, n.r + delta));
        this._clampY(n, n.r);
      }
      this.refresh();
    }

    // Spiegel-spieren: in tegenfase (om en om, zoals lopen) of samen (zoals springen)
    setMirrorPhase(anti) {
      this._snapshot();
      for (const s of this.design.sticks) s.anti = anti;
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
        if (!pr.dragging) this._snapshot();
        pr.dragging = true;
        const p = this.view.planePoint(e.clientX, e.clientY, pr.start);
        if (!p) return;
        const i = pr.hit.index, n = this.design.nodes[i], B = this.cfg.body;
        this._clampY(p, n.r);
        const partner = this.mirrorMode ? this._partner(i) : -1;
        if (partner >= 0 && Math.abs(p.z) < MID) p.z = Math.sign(n.z || 1) * MID; // niet door het midden
        if (i === 0) { p.z = 0; } // hoofdbol blijft op de middellijn
        const mp = { x: p.x, y: p.y, z: -p.z };
        // alle stokjes moeten binnen de maximale lengte blijven
        const pos = idx => (idx === i ? p : idx === partner ? mp : this.design.nodes[idx]);
        const ok = this.design.sticks.every(s => {
          if (s.a !== i && s.b !== i && s.a !== partner && s.b !== partner) return true;
          return dist(pos(s.a), pos(s.b)) <= B.maxStick;
        });
        if (ok) {
          Object.assign(n, { x: p.x, y: p.y, z: p.z });
          if (partner >= 0) Object.assign(this.design.nodes[partner], mp);
          this.sel = i;
          this.view.showDesign(this.design, this.sel);
        }
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
        else this.hooks.sound('select');
        this.sel = hit.index;
        this.refresh();
      } else if (hit.type === 'stick') {
        this._snapshot();
        const s = this.design.sticks[hit.index];
        s.m = !s.m;
        if (s.mir >= 0) this.design.sticks[s.mir].m = s.m;
        this.hooks.sound('toggle');
        this.refresh();
      }
    }

    // Klaar met bouwen → genoom (of null + reden)
    toGenome(rng) {
      const info = this.info();
      if (info.problem) return { error: info.problem };
      return { genome: G.Genome.fromDesign(this.design, rng) };
    }
  }

  // ontwerpen zonder spiegel-info (oud of van buitenaf) krijgen die automatisch
  function autoMirrorIfNeeded(d) {
    const has = d.nodes.some(n => n.mir !== undefined);
    if (!has) return autoMirror(d);
    d.nodes.forEach(n => { if (n.mir === undefined) n.mir = -1; });
    d.sticks.forEach(s => { if (s.mir === undefined) s.mir = -1; });
    return d;
  }

  G.Editor = Editor;
  G.designPreset = preset;
  G.autoMirror = autoMirror;
})((globalThis.GROW = globalThis.GROW || {}));
