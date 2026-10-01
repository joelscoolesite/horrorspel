// =============================================================
//  music.js — achtergrondmuziek, live gecomponeerd (Web Audio)
// =============================================================
//
//  Geen mp3: de muziek wordt noot voor noot "gespeeld" door een
//  sequencer. Elke 16e noot (een "stap") kijkt hij wat er moet klinken:
//
//   stap:  1 . . . 2 . . . 3 . . . 4 . . .     (16 stappen = 1 maat)
//   pad    ████████████████████████████████    akkoord, hele maat
//   bas    ●               ●                   grondtoon
//   arp    ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ●    akkoordtonen (intensiteit ≥ 1)
//   kick   ●               ●                   (intensiteit 2)
//   snare          ●               ●
//   hihat      ●       ●       ●       ●
//
//  Akkoorden (A-mineur), 8 maten deel A, dan 8 maten deel B:
//    A: Am – F – C – G      B: F – G – Em – Am
//
//  Intensiteit volgt het spel: 0 = bouwen (rustig), 1 = kijken,
//  2 = trainen (met drums). Zo voelt het alsof de muziek meeleeft.
//
//  Timing-truc: JavaScript-timers zijn onnauwkeurig, dus we plannen
//  steeds ~0.15 s vooruit op de klok van de audio-chip (lookahead).
(function (G) {
  'use strict';
  const PREF_KEY = 'growbot.music.v1';
  const BPM = 92;
  const STEP = 60 / BPM / 4; // duur van een 16e noot (s)
  const GAIN = 2.5;          // muziek iets zachter dan de effecten, maar goed hoorbaar
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  // akkoord = [grondtoon bas (midi), akkoordtonen (midi)]
  const CH = {
    Am: [45, [57, 60, 64]], F: [41, [57, 60, 65]], C: [48, [55, 60, 64]],
    G: [43, [55, 59, 62]], Em: [40, [55, 59, 64]]
  };
  const PART_A = ['Am', 'F', 'C', 'G'], PART_B = ['F', 'G', 'Em', 'Am'];
  // arpeggio-patroon: index in akkoordtonen (+3 = octaaf hoger), -1 = rust
  const ARP = [
    [0, 1, 2, 4, 2, 1, 3, 1],
    [0, 2, 1, 3, 2, 4, 1, 2],
    [3, 2, 1, 0, 1, 2, 4, -1],
    [0, -1, 2, 1, 3, -1, 2, 4]
  ];

  class Music {
    constructor(sound) {
      this.s = sound;
      this.enabled = true;
      this.volume = 0.35;
      this.intensity = 1;
      this.step = 0;
      this.timer = null;
      try {
        const p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
        if (p) { this.enabled = !!p.enabled; this.volume = +p.volume; }
      } catch (_) { /* standaardwaarden */ }
      const go = () => this.start();
      window.addEventListener('pointerdown', go, { capture: true });
      window.addEventListener('keydown', go, { capture: true });
    }

    // Start de sequencer (kan pas nadat het geluid "unlocked" is)
    start() {
      const ctx = this.s.ctx;
      if (!ctx || this.timer || this.s.offline) return;
      this._build(ctx);
      this.nextTime = ctx.currentTime + 0.1;
      this.timer = setInterval(() => this._schedule(), 25);
    }

    _build(ctx) {
      this.ctx = ctx;
      this.bus = ctx.createGain();
      this.bus.gain.value = this.enabled ? this.volume * GAIN : 0;
      this.bus.connect(ctx.destination);
      // echo voor het arpeggio (gestippelde 8e)
      this.echo = ctx.createDelay();
      this.echo.delayTime.value = STEP * 3;
      const fb = ctx.createGain();
      fb.gain.value = 0.35;
      const echoLp = ctx.createBiquadFilter();
      echoLp.type = 'lowpass';
      echoLp.frequency.value = 2500;
      this.echo.connect(echoLp).connect(fb).connect(this.echo);
      echoLp.connect(this.bus);
      // zacht filter voor de pads
      this.padFilter = ctx.createBiquadFilter();
      this.padFilter.type = 'lowpass';
      this.padFilter.frequency.value = 1100;
      this.padFilter.Q.value = 0.7;
      this.padFilter.connect(this.bus);
    }

    setEnabled(on) { this.enabled = on; this._apply(); }
    setVolume(v) { this.volume = v; this._apply(); }
    _apply() {
      if (this.bus) this.bus.gain.setTargetAtTime(this.enabled ? this.volume * GAIN : 0, this.ctx.currentTime, 0.3);
      try { localStorage.setItem(PREF_KEY, JSON.stringify({ enabled: this.enabled, volume: this.volume })); } catch (_) { /* */ }
    }

    setIntensity(i) { this.intensity = i; }

    _schedule() {
      if (!this.enabled) { this.nextTime = this.ctx.currentTime + 0.1; return; }
      // tabblad op de achtergrond → timers worden traag: pauzeren i.p.v. haperen
      if (typeof document !== 'undefined' && document.hidden) { this.nextTime = this.ctx.currentTime + 0.1; return; }
      if (this.nextTime < this.ctx.currentTime) this.nextTime = this.ctx.currentTime + 0.05;
      while (this.nextTime < this.ctx.currentTime + 0.15) {
        this.playStep(this.step, this.nextTime);
        this.nextTime += STEP;
        this.step++;
      }
    }

    // Alles wat er op stap i (op tijdstip t) moet klinken
    playStep(i, t) {
      const pos = i % 16, bar = Math.floor(i / 16);
      const part = Math.floor(bar / 8) % 2 === 0 ? PART_A : PART_B;
      const [bass, tones] = CH[part[bar % 4]];
      const I = this.intensity;

      if (pos === 0) {
        for (const m of tones) this._pad(mtof(m), t, STEP * 16);
        this._bass(mtof(bass), t, STEP * 6);
      }
      if (pos === 8) this._bass(mtof(bass + (bar % 2 ? 7 : 0)), t, STEP * 5);
      if (pos === 14 && I >= 1 && bar % 4 === 3) this._bass(mtof(bass + 12), t, STEP * 2);

      if (I >= 1 && pos % 2 === 0) {
        const pat = ARP[(bar >> 1) % ARP.length];
        const k = pat[pos / 2];
        if (k >= 0) {
          const m = tones[k % 3] + 12 + (k >= 3 ? 12 : 0);
          this._pluck(mtof(m), t, pos % 4 === 0 ? 0.05 : 0.035);
        }
      }

      if (I >= 2) {
        if (pos === 0 || pos === 8 || (pos === 10 && bar % 2)) this._kick(t);
        if (pos === 4 || pos === 12) this._snare(t);
        if (pos % 4 === 2) this._hat(t, 0.025);
        if (pos % 2 === 1 && bar % 2) this._hat(t, 0.012);
      }
    }

    // ---------- instrumenten ----------
    _env(g, t, a, peak, dur) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }

    _pad(f, t, dur) {
      const ctx = this.ctx, g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.03, t + 0.6);           // langzaam aanzwellen
      g.gain.setValueAtTime(0.03, t + dur - 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);   // en uitsterven
      for (const cents of [-8, 8]) {                                // 2 iets ontstemde zaagtanden = "breed"
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = cents;
        o.connect(g);
        o.start(t);
        o.stop(t + dur + 0.7);
      }
      g.connect(this.padFilter);
    }

    _bass(f, t, dur) {
      const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      o2.type = 'triangle'; o2.frequency.value = f * 2;
      const g2 = ctx.createGain(); g2.gain.value = 0.25;
      this._env(g, t, 0.02, 0.16, dur);
      o.connect(g); o2.connect(g2).connect(g); g.connect(this.bus);
      o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    }

    _pluck(f, t, vol) {
      const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      this._env(g, t, 0.004, vol, 0.35);
      o.connect(g);
      g.connect(this.bus);
      g.connect(this.echo);
      o.start(t);
      o.stop(t + 0.4);
    }

    _kick(t) {
      const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
      this._env(g, t, 0.003, 0.28, 0.3);
      o.connect(g).connect(this.bus);
      o.start(t); o.stop(t + 0.32);
    }

    _noiseHit(t, type, freq, vol, dur) {
      const ctx = this.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = this.s.noise;
      f.type = type; f.frequency.value = freq;
      this._env(g, t, 0.002, vol, dur);
      src.connect(f).connect(g).connect(this.bus);
      src.start(t, (t * 7.3) % 0.5);
      src.stop(t + dur + 0.02);
    }

    _hat(t, vol) { this._noiseHit(t, 'highpass', 7500, vol, 0.045); }

    _snare(t) {
      this._noiseHit(t, 'bandpass', 1900, 0.07, 0.16);
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
      this._env(g, t, 0.002, 0.05, 0.1);
      o.connect(g).connect(this.bus);
      o.start(t); o.stop(t + 0.12);
    }
  }

  G.Music = Music;
  G.Music.STEP = STEP;
})((globalThis.GROW = globalThis.GROW || {}));
