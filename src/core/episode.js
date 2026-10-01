// =============================================================
//  episode.js — één "leven": groeien → bewegen → score
// =============================================================
//
//  Tijdlijn van een episode:
//
//   t=0        groeifase               growEnd        +maxTime
//   ●──────────●──●──●──●──────────────┃───────────────────────┃
//   1 bol      elke 0.12 s groeit       spieren gaan aan,      stop
//              een nieuwe bol uit       organisme loopt
//
//  Stoppen gebeurt ook bij: finish gehaald, in een gat gevallen,
//  of 5 seconden geen vooruitgang (stagnatie).
GROW_MODULE(function (G) {
  'use strict';
  const clamp = G.clamp;
  const M = G.M; // deterministische sin/cos/tanh (zie dmath.js)

  const smooth = u => u * u * (3 - 2 * u);

  // "Domain randomization": elk organisme wordt meerdere keren getest met
  // een iets andere start (positie, draaiing, ritme). Zo winnen ROBUUSTE
  // lopers i.p.v. geluksvogels die alleen vanaf precies één plek werken.
  //   NOMINAL     = de standaard-start (wat je in de replay ziet)
  //   randomVariant(rng)  = willekeurige start, elke generatie opnieuw
  //   VALIDATION  = 8 vaste starts om de kampioen eerlijk te meten
  const NOMINAL = { dx: 0, dz: 0, phase: 0, yaw: 0 };
  function randomVariant(rng) {
    return {
      dx: rng.range(-0.3, 0.3), dz: rng.range(-0.6, 0.6),
      phase: rng.range(0, 2 * Math.PI), yaw: rng.range(-0.35, 0.35) // ±20°
    };
  }
  const VALIDATION = [NOMINAL];
  { const r = new G.RNG(424242); for (let i = 0; i < 7; i++) VALIDATION.push(randomVariant(r)); }

  class Episode {
    // variant = kleine variatie in startpositie/draaiing/ritme (zie hierboven)
    constructor(genome, track, cfg, variant = NOMINAL) {
      this.genome = genome;
      this.variant = variant;
      this.track = track;
      this.cfg = cfg;
      const P = cfg.physics, B = cfg.body, GR = cfg.growth;
      const W = (this.world = new G.World(track.colliders, P));
      const N = genome.nodes.length;
      // draai het hele bouwplan om de verticale as (yaw)
      this.cyaw = M.cos(variant.yaw || 0); this.syaw = M.sin(variant.yaw || 0);
      const bp = G.Genome.blueprint(genome).map(p => this._rot(p));

      // Hoofdbol staat op de grond bij de start
      const sx = track.start[0] + variant.dx, sy = track.start[1] + B.rootRadius + 0.01;
      const sz = track.start[2] + variant.dz;
      this.startX = track.start[0]; // afstand altijd vanaf de echte startlijn
      genome.nodes.forEach((n, i) => {
        const mass = (n.r * n.r) / 0.0225; // grotere bol = zwaarder (∝ r²)
        W.addNode(sx + bp[i][0], sy + bp[i][1], sz + bp[i][2], n.r, mass);
        W.nodes[i].active = i === 0; // alleen de hoofdbol bestaat al
      });

      this.sticks = genome.sticks.map(s => {
        const rest = clamp(M.len3(bp[s.a][0] - bp[s.b][0], bp[s.a][1] - bp[s.b][1],
          bp[s.a][2] - bp[s.b][2]), B.minStick, B.maxStick * 1.25);
        // sterkte-gen: een nieuw gegroeid stokje begint zwak en wordt
        // (via mutaties) sterker — zo is groeien geen schok
        const strength = Math.max(B.minStrength, s.k === undefined ? 1 : s.k);
        const k = (s.m ? P.muscleStiffness : P.boneStiffness) * strength;
        W.addStick(s.a, s.b, rest, k);
        W.sticks[W.sticks.length - 1].active = false;
        return { rest, act: 0, muscle: s.m, w: s.w, grow: null };
      });

      // per bol: welke stokjes raken hem?
      this.touching = genome.nodes.map(() => []);
      genome.sticks.forEach((s, k) => { this.touching[s.a].push(k); this.touching[s.b].push(k); });

      this.nodeBorn = new Array(N).fill(-1);
      this.nodeBorn[0] = 0;
      this.nextGrow = 1;
      this.growEnd = (N - 1) * GR.interval + GR.ramp + 0.2;

      this.t = 0;
      this.done = false;
      this.reason = '';
      this.maxX = 0;
      this.lastImproveX = 0;
      this.lastImproveT = this.growEnd;
      this.energy = 0;
      this.finished = false;
      this.finishTime = 0;
      this.dead = false;
      this.sensors = [0, 0, 0];
      this.prox = new Array(N).fill(0);
    }

    get root() { return this.world.nodes[0]; }

    _rot(p) {
      return [p[0] * this.cyaw + p[2] * this.syaw, p[1], -p[0] * this.syaw + p[2] * this.cyaw];
    }

    // Groeistap: activeer bol i dicht bij zijn ouder en laat zijn stokjes uitgroeien
    _activate(i) {
      const W = this.world, gn = this.genome.nodes[i], n = W.nodes[i], par = W.nodes[gn.p];
      const f = this.cfg.growth.spawnFraction, d = this._rot(gn.d);
      n.x = par.x + d[0] * gn.l * f;
      n.y = par.y + d[1] * gn.l * f;
      n.z = par.z + d[2] * gn.l * f;
      n.ox = n.x - (par.x - par.ox); // erft de snelheid van de ouder
      n.oy = n.y - (par.y - par.oy);
      n.oz = n.z - (par.z - par.oz);
      n.active = true;
      this.nodeBorn[i] = this.t;
      for (const k of this.touching[i]) {
        const ws = W.sticks[k], other = W.nodes[ws.a === i ? ws.b : ws.a];
        if (!other.active) continue;
        const from = Math.max(0.05, M.len3(other.x - n.x, other.y - n.y, other.z - n.z));
        ws.active = true;
        ws.len = from;
        this.sticks[k].grow = { t0: this.t, from };
      }
    }

    _grow() {
      const GR = this.cfg.growth, N = this.genome.nodes.length;
      while (this.nextGrow < N && this.t >= (this.nextGrow - 1) * GR.interval + 0.05) {
        this._activate(this.nextGrow++);
      }
      for (let k = 0; k < this.sticks.length; k++) {
        const st = this.sticks[k], gr = st.grow;
        if (!gr) continue;
        const u = (this.t - gr.t0) / GR.ramp;
        const ws = this.world.sticks[k];
        if (u >= 1) { ws.len = st.rest; st.grow = null; }
        else ws.len = gr.from + (st.rest - gr.from) * smooth(u);
      }
    }

    // Het brein: elk spier-stokje berekent zijn eigen gewenste lengte
    _control(dt) {
      if (this.t < this.growEnd) return;
      const W = this.world, root = W.nodes[0], tr = this.track;
      const tt = this.t - this.growEnd;
      const fade = Math.min(1, tt / 0.5);
      const ph = 2 * Math.PI * this.genome.f * tt + this.variant.phase;
      const s0 = M.sin(ph), c0 = M.cos(ph);

      // "Ogen": kijk op 0.5, 1.0 en 1.5 m vooruit naar de grond.
      // Vloeiende waarden (geen aan/uit) → kleine verandering in de wereld
      // geeft een kleine verandering in gedrag. Dat maakt leren veel makkelijker.
      const hHere = tr.heightAt(root.x, root.z);
      const base = hHere === -Infinity ? root.y - root.r : hHere;
      let hole = 0, step = 0;
      for (let i = 1; i <= 3; i++) {
        const h = tr.heightAt(root.x + 0.5 * i, root.z);
        if (h === -Infinity) { hole += 1 / 3; continue; }
        hole += clamp((base - h) / 0.5, 0, 1) / 3;
        step += clamp((h - base) * 2, -1, 1) / 3;
      }
      const side = clamp(root.z / tr.halfWidth, -1, 1); // waar op de baan? (-1 links, +1 rechts)
      this.sensors[0] = step; this.sensors[1] = hole; this.sensors[2] = side;

      // "Voelen": hoe dicht zit elke bol bij de grond? (1 = raakt, 0 = ≥15 cm erboven)
      const prox = this.prox;
      for (let i = 0; i < W.nodes.length; i++) {
        const n = W.nodes[i];
        if (!n.active) { prox[i] = 0; continue; }
        const h = tr.heightAt(n.x, n.z);
        prox[i] = h === -Infinity ? n.contact : Math.max(n.contact * 0.5, clamp(1 - (n.y - n.r - h) / 0.15, 0, 1));
      }

      const amp = this.cfg.body.muscleAmp, speed = this.cfg.body.muscleSpeed;
      for (let k = 0; k < this.sticks.length; k++) {
        const st = this.sticks[k];
        if (!st.muscle || st.grow) continue;
        const ws = W.sticks[k], a = W.nodes[ws.a], b = W.nodes[ws.b], w = st.w;
        const tilt = clamp((b.y - a.y) / st.rest, -1, 1);    // wijst het stokje omhoog?
        const fwd = clamp((b.x - a.x) / st.rest, -1, 1);     // wijst het stokje vooruit?
        const sum = w[0] * s0 + w[1] * c0 + w[2] * prox[ws.a] + w[3] * prox[ws.b] +
          w[4] * step + w[5] * hole + w[6] * tilt + w[7] * fwd + w[8] * side + w[9];
        st.act += (M.tanh(sum) - st.act) * speed; // traag bijsturen: geen schokken
        ws.len = st.rest * (1 + amp * st.act * fade);
        this.energy += Math.abs(st.act) * fade * dt;
      }
    }

    _measure() {
      const root = this.root, E = this.cfg.episode;
      if (!Number.isFinite(root.x) || !Number.isFinite(root.y)) {
        this.done = true; this.reason = 'instabiel'; this.maxX = 0; return;
      }
      const x = root.x - this.startX;
      if (x > this.maxX) this.maxX = x;
      if (this.maxX > this.lastImproveX + E.stagnationDist) {
        this.lastImproveX = this.maxX;
        this.lastImproveT = Math.max(this.t, this.growEnd);
      }
      if (root.y < E.deathY) { this.done = true; this.dead = true; this.reason = 'gevallen'; }
      else if (root.x >= this.track.finishX) {
        this.done = true; this.finished = true; this.reason = 'finish!';
        this.finishTime = this.t - this.growEnd;
      } else if (this.t > this.growEnd + E.maxTime) { this.done = true; this.reason = 'tijd op'; }
      else if (this.t - this.lastImproveT > E.stagnationTime) { this.done = true; this.reason = 'vastgelopen'; }
    }

    step() {
      if (this.done) return;
      const dt = this.cfg.physics.dt;
      this.t += dt;
      this._grow();
      this._control(dt);
      this.world.step(dt);
      this._measure();
    }

    // n stappen (of tot klaar). Geeft true als de episode klaar is.
    run(n) {
      for (let i = 0; i < n && !this.done; i++) this.step();
      return this.done;
    }

    summary() {
      const cps = this.track.checkpoints.filter(c => this.startX + this.maxX >= c.x).length;
      return {
        maxX: this.maxX,
        checkpoints: cps,
        passedGap: cps >= 1 ? 1 : 0,
        finished: this.finished,
        finishTime: this.finishTime,
        energy: this.energy,
        nodes: this.genome.nodes.length,
        sticks: this.genome.sticks.length,
        dead: this.dead,
        reason: this.reason,
        time: this.t
      };
    }
  }

  // =============================================================
  //  FITNESS = vooruitgang + bonussen − groeikosten − energie
  // =============================================================
  function computeFitness(s, cfg) {
    const F = cfg.fitness;
    // finishRate = deel van de trials dat de finish haalde (0..1)
    const finishRate = s.finishRate !== undefined ? s.finishRate : (s.finished ? 1 : 0);
    let f = F.progress * s.maxX + F.checkpointBonus * s.checkpoints;
    if (finishRate > 0) {
      f += finishRate * F.finishBonus;
      f += finishRate * F.timeBonus * Math.max(0, cfg.episode.maxTime - s.finishTime / finishRate);
    }
    f -= F.nodeCost * (s.nodes - 1);   // hoofdbol is gratis
    f -= F.stickCost * s.sticks;
    f -= F.energyCost * s.energy;
    return f;
  }

  // Gemiddelde over meerdere trials → één samenvatting
  function mergeSummaries(list) {
    const avg = key => list.reduce((s, x) => s + x[key], 0) / list.length;
    return {
      ...list[0],
      maxX: avg('maxX'),
      checkpoints: avg('checkpoints'),
      finishRate: list.filter(x => x.finished).length / list.length,
      gapRate: avg('passedGap'),          // deel van de runs dat over de spleet kwam
      finishTime: avg('finishTime'),
      energy: avg('energy'),
      trials: list.length,
      first: list[0]
    };
  }

  G.NOMINAL = NOMINAL;
  G.VALIDATION = VALIDATION;
  G.randomVariant = randomVariant;
  G.mergeSummaries = mergeSummaries;
  G.Episode = Episode;
  G.computeFitness = computeFitness;
});
