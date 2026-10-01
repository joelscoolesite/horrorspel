// =============================================================
//  sound.js — alle geluiden, live gemaakt met de Web Audio API
// =============================================================
//
//  Geen geluidsbestanden nodig: elk geluid is een kort "recept" van
//  oscillatoren (pieptonen) en ruis, met een volume-envelop:
//
//     volume
//       ▲   ╱╲
//       │  ╱  ╲___            aanslag (attack) → uitsterven (decay)
//       │ ╱       ╲___
//       └──────────────▶ tijd
//
//  Browsers laten pas geluid toe na een klik/toets van de gebruiker,
//  daarom start de AudioContext bij de eerste interactie (unlock).
(function (G) {
  'use strict';
  const PREF_KEY = 'growbot.sound.v1';

  class Sound {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      this.volume = 0.6;
      this.lastImpact = -1;
      try {
        const p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
        if (p) { this.enabled = !!p.enabled; this.volume = +p.volume; }
      } catch (_) { /* geen opslag: standaardwaarden */ }
      const unlock = () => this.unlock();
      window.addEventListener('pointerdown', unlock, { capture: true });
      window.addEventListener('keydown', unlock, { capture: true });
    }

    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this._init(new AC());
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    // Klankketen opbouwen (ook bruikbaar met een OfflineAudioContext om te testen)
    _init(ctx, offline = false) {
      {
        this.ctx = ctx;
        this.offline = offline;
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? this.volume * 2 : 0;
        // klein beetje galm: maakt de geluiden minder "droog"
        const delay = this.ctx.createDelay();
        delay.delayTime.value = 0.09;
        const fb = this.ctx.createGain();
        fb.gain.value = 0.18;
        delay.connect(fb).connect(delay);
        this.master.connect(this.ctx.destination);
        this.master.connect(delay);
        delay.connect(this.ctx.destination);
        // ruis-buffer (voor tikken en woesj)
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
    }

    get ready() { return this.ctx && this.enabled && (this.ctx.state === 'running' || this.offline); }

    setEnabled(on) { this.enabled = on; this._apply(); }
    setVolume(v) { this.volume = v; this._apply(); }
    _apply() {
      if (this.master) this.master.gain.setTargetAtTime(this.enabled ? this.volume * 2 : 0, this.ctx.currentTime, 0.02);
      try { localStorage.setItem(PREF_KEY, JSON.stringify({ enabled: this.enabled, volume: this.volume })); } catch (_) { /* */ }
    }

    // ---------- bouwstenen ----------
    // toon: golfvorm, start-/eindfrequentie, duur, volume, starttijd (s vanaf nu)
    _tone(type, f0, f1, dur, vol, at = 0) {
      const t = this.ctx.currentTime + at;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.02);
    }

    // gefilterde ruis-stoot
    _noise(freq, q, dur, vol, at = 0, sweepTo = freq) {
      const t = this.ctx.currentTime + at;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = q;
      f.frequency.setValueAtTime(freq, t);
      if (sweepTo !== freq) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(this.master);
      src.start(t, Math.random() * 0.5);
      src.stop(t + dur + 0.02);
    }

    // ---------- geluiden van het wezen ----------
    // Een bol raakt de grond. strength = botssnelheid (m/s), r = straal
    impact(strength, r) {
      if (!this.ready || strength < 0.4) return;
      const now = this.ctx.currentTime;
      if (now - this.lastImpact < 0.035) return; // niet te veel tegelijk
      this.lastImpact = now;
      const vol = Math.min(0.35, 0.04 + strength * 0.06);
      const pitch = 900 * (0.15 / Math.max(0.08, r));   // grote bol = lage toon
      this._noise(pitch * 2.2, 3, 0.07, vol * 0.7);       // "tik"
      this._tone('sine', pitch * 0.35, pitch * 0.18, 0.12, vol); // "bonk"
    }

    // Er groeit een nieuwe bol (i = hoeveelste) → oplopende plopjes
    grow(i) {
      if (!this.ready) return;
      const f = 300 * Math.pow(2, (i % 12) / 12 * 1.5);
      this._tone('sine', f, f * 1.9, 0.09, 0.18);
      this._tone('triangle', f * 2, f * 3, 0.05, 0.05, 0.01);
    }

    checkpoint(i) {
      if (!this.ready) return;
      const base = [659, 784, 880, 988][i % 4];
      this._tone('triangle', base, base, 0.25, 0.22);
      this._tone('sine', base * 2, base * 2, 0.35, 0.1, 0.06);
    }

    finish() {
      if (!this.ready) return;
      [523, 659, 784, 1047].forEach((f, i) => this._tone('triangle', f, f, 0.32, 0.22, i * 0.11));
      this._tone('sine', 1568, 1568, 0.6, 0.12, 0.44);
      this._noise(6000, 0.8, 0.5, 0.06, 0.44); // sprankel
    }

    fall() {
      if (!this.ready) return;
      this._tone('sawtooth', 520, 70, 0.7, 0.14);
      this._noise(1800, 1.2, 0.7, 0.22, 0, 200); // woesj
    }

    stuck() {
      if (!this.ready) return;
      this._tone('square', 140, 110, 0.18, 0.1);
      this._tone('square', 110, 80, 0.25, 0.1, 0.2);
    }

    // ---------- training ----------
    champion() {
      if (!this.ready) return;
      this._tone('triangle', 880, 880, 0.12, 0.15);
      this._tone('triangle', 1319, 1319, 0.25, 0.15, 0.1);
    }

    levelUp() {
      if (!this.ready) return;
      [392, 494, 587, 784, 988].forEach((f, i) => this._tone('square', f, f, 0.14, 0.12, i * 0.07));
    }

    // ---------- bouw-modus ----------
    ui(kind) {
      if (!this.ready) return;
      if (kind === 'add') this._tone('sine', 420, 840, 0.1, 0.2);
      else if (kind === 'link') { this._noise(3000, 4, 0.04, 0.25); this._tone('sine', 1200, 1200, 0.06, 0.08); }
      else if (kind === 'unlink') this._tone('sine', 700, 350, 0.1, 0.15);
      else if (kind === 'toggle') this._tone('triangle', 600, 900, 0.07, 0.15);
      else if (kind === 'delete') this._tone('sawtooth', 300, 90, 0.18, 0.1);
      else if (kind === 'select') this._tone('sine', 1000, 1000, 0.03, 0.08);
      else if (kind === 'error') this._tone('square', 180, 160, 0.15, 0.07);
    }
  }

  G.Sound = Sound;
})((globalThis.GROW = globalThis.GROW || {}));
