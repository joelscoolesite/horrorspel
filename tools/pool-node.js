// =============================================================
//  pool-node.js — training op alle CPU-kernen in Node.js
// =============================================================
// Zelfde idee als src/ui/workers.js, maar met Node's worker_threads.
'use strict';
const { Worker } = require('worker_threads');

function workerMain() {
  const { parentPort } = require('worker_threads');
  const G = globalThis.GROW;
  let cfg = null, tracks = {};
  parentPort.on('message', m => {
    if (m.type === 'cfg') { cfg = m.cfg; tracks = {}; return; }
    const track = tracks[m.level] || (tracks[m.level] = G.buildParkour(cfg, m.level));
    const ep = new G.Episode(m.genome, track, cfg, m.variant);
    while (!ep.run(100000));
    parentPort.postMessage({ id: m.id, summary: ep.summary() });
  });
}

class NodePool {
  constructor(n) {
    const src = [
      'globalThis.GROW_MODULE = function (mod) { mod(globalThis.GROW = globalThis.GROW || {}); };',
      ...globalThis.GROW_SRC.map(s => `GROW_MODULE(${s});`),
      `(${workerMain.toString()})();`
    ].join('\n');
    this.callbacks = new Map();
    this.pending = [];
    this.nextId = 1;
    this.idle = [];
    this.workers = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(src, { eval: true });
      w.on('message', m => {
        const cb = this.callbacks.get(m.id);
        this.callbacks.delete(m.id);
        this._next(w); // meteen de volgende taak: workers nooit laten wachten
        if (cb) cb(m.summary);
      });
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

  close() { return Promise.all(this.workers.map(w => w.terminate())); }
}

module.exports = NodePool;
