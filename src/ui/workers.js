// =============================================================
//  workers.js — training op ALLE CPU-kernen (Web Workers)
// =============================================================
//
//   hoofd-thread (tekenen + evolutie)        workers (alleen rekenen)
//   ┌──────────────────────────┐   taak    ┌──────────┐
//   │ wachtrij: DNA × start    │ ────────▶ │ worker 1 │──┐
//   │                          │ ────────▶ │ worker 2 │  │ samenvatting
//   │ resultaten op vaste plek │ ◀──────── │ worker 3 │◀─┘ (afstand, …)
//   └──────────────────────────┘           └──────────┘
//
//  Truc: elke core-file heeft zijn broncode bewaard (GROW_SRC, zie
//  config.js). Daarvan maken we een "blob"-script voor de workers. Zo
//  werkt het ook als je index.html gewoon dubbelklikt (file://).
//  Lukt het niet (oude browser)? Dan rekent alles op de hoofd-thread.
(function (G) {
  'use strict';

  // Deze functie draait IN de worker
  function workerMain() {
    const G = globalThis.GROW;
    let cfg = null, tracks = {};
    globalThis.onmessage = e => {
      const m = e.data;
      if (m.type === 'cfg') { cfg = m.cfg; tracks = {}; return; }
      const track = tracks[m.level] || (tracks[m.level] = G.buildParkour(cfg, m.level));
      const ep = new G.Episode(m.genome, track, cfg, m.variant);
      while (!ep.run(100000));
      postMessage({ id: m.id, summary: ep.summary() });
    };
  }

  class WorkerPool {
    constructor(n) {
      const src = [
        'globalThis.GROW_MODULE = function (mod) { mod(globalThis.GROW = globalThis.GROW || {}); };',
        ...globalThis.GROW_SRC.map(s => `GROW_MODULE(${s});`),
        `(${workerMain.toString()})();`
      ].join('\n');
      this.url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      this.callbacks = new Map();
      this.pending = [];
      this.nextId = 1;
      this.idle = [];
      this.workers = [];
      for (let i = 0; i < n; i++) {
        const w = new Worker(this.url);
        w.onmessage = e => {
          const cb = this.callbacks.get(e.data.id);
          this.callbacks.delete(e.data.id);
          this._next(w); // meteen de volgende taak: workers nooit laten wachten
          if (cb) cb(e.data.summary);
        };
        this.workers.push(w);
        this.idle.push(w);
      }
      this.size = n;
    }

    // Taak toevoegen; een vrije worker begint meteen, anders in de wachtrij
    run(job, cb) {
      this.pending.push({ job, cb });
      if (this.idle.length) this._next(this.idle.pop());
    }

    _next(w) {
      const item = this.pending.shift();
      if (!item) { this.idle.push(w); return; }
      const id = this.nextId++;
      this.callbacks.set(id, item.cb);
      const j = item.job;
      w.postMessage({ id, genome: j.genome, variant: j.variant, level: j.level });
    }

    // Nog niet gestarte taken vergeten (bij een nieuwe generatie/reset)
    cancelPending() { this.pending = []; }

    setConfig(cfg) {
      const copy = JSON.parse(JSON.stringify(cfg));
      for (const w of this.workers) w.postMessage({ type: 'cfg', cfg: copy });
    }

    close() {
      for (const w of this.workers) w.terminate();
      URL.revokeObjectURL(this.url);
    }

    // Probeer een pool te maken; null als de browser het niet toestaat
    static create(n) {
      try {
        if (typeof Worker === 'undefined' || !globalThis.GROW_SRC) return null;
        return new WorkerPool(n);
      } catch (err) {
        console.warn('Web Workers niet beschikbaar, training op één kern:', err);
        return null;
      }
    }
  }

  G.WorkerPool = WorkerPool;
})((globalThis.GROW = globalThis.GROW || {}));
