// =============================================================
//  genome.js — het DNA: groei-instructies + spier-brein
// =============================================================
//
//  Een genoom is een GROEIPROGRAMMA dat start bij één bol:
//
//    nodes[0]  = hoofdbol (root)
//    nodes[i]  = { p: ouder, d: richting, l: lengte, r: straal, uid }
//                "groei vanuit bol p, in richting d, op afstand l"
//    sticks[k] = { a, b, m: spier?, k: sterkte 0..1, w: [11], u: [11], uid }
//                verbinding tussen bol a en b. Als m = true is het
//                een spier met zijn eigen mini-brein (w) én een
//                "zender" (u) waarmee hij berichten naar zijn buren stuurt.
//
//    Voorbeeld:          (2)
//                        / \        nodes:  0 ← root
//                     s1/   \s2             1: p=0
//                      /     \              2: p=1
//         (1)───s0───(0)      ...     sticks: s0(0,1) s1(1,2) s2(0,2)
//
//  SYMMETRIE (spiegel-gen): een bol of stokje kan een SPIEGELBEELD zijn
//  van een ander ("mirOf" = uid van het origineel). Het spiegelbeeld:
//    - staat op dezelfde plek maar dan links ↔ rechts (z → −z)
//    - gebruikt HETZELFDE brein als het origineel (minder om te leren!)
//    - kan in TEGENFASE bewegen (anti = true): links stapt, dan rechts
//
//         links   ●──●                ●──●   rechts
//                   ╲     ⟵ spiegel ⟶   ╱
//                    ●━━━━━━━(0)━━━━━━━●
//
//  Elk spier-brein is een klein neuraal netwerk (1 neuron):
//    activatie = tanh( w · [sin(t), cos(t), grondA, grondB, trede, gat,
//                           kanteling, richting, zijwaarts, 1, bericht] )
//    bericht-uit = tanh( u · dezelfde ingangen )  → naar de buren
//  Omdat élk stokje zijn eigen kleine brein heeft, maakt het niet
//  uit hoeveel stokjes er groeien: het brein groeit gewoon mee.
//  Met de berichten is het een mini "Graph Neural Network".
GROW_MODULE(function (G) {
  'use strict';
  const clamp = G.clamp;
  const NIN = 11; // 9 sensoren + bias (index 9) + bericht van de buren (index 10)
  let nextId = 1;

  const dist = (a, b) => G.M.len3(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const mirrorVec = d => [d[0], d[1], -d[2]];

  const Genome = {
    NIN,
    INPUT_NAMES: ['sin(t)', 'cos(t)', 'grond A', 'grond B', 'trede vooruit', 'gat vooruit',
      'kanteling', 'richting', 'zijwaarts', 'bias', 'bericht buren'],

    // Eén enkele bol: hier begint alles
    root(cfg) {
      return {
        id: nextId++, parent: 0, f: 1.2, nextUid: 2,
        nodes: [{ p: -1, d: [0, 0, 0], l: 0, r: cfg.body.rootRadius, uid: 1 }],
        sticks: []
      };
    },

    // Startpopulatie: één bol + een paar willekeurige groeistappen
    initial(rng, cfg) {
      const g = Genome.root(cfg);
      g.f = rng.range(0.6, 2.0);
      const k = 1 + rng.int(4);
      for (let i = 0; i < k; i++) Genome.addNode(g, rng, cfg, false, rng.chance(cfg.evo.mut.symmetric));
      Genome.ensureMinNodes(g, rng, cfg);
      return g;
    },

    // Groei bij tot het minimum aantal bollen (instelling body.minNodes)
    ensureMinNodes(g, rng, cfg) {
      const min = Math.min(cfg.body.minNodes || 1, cfg.body.maxNodes);
      for (let tries = 0; g.nodes.length < min && tries < 40; tries++) {
        Genome.addNode(g, rng, cfg, false, rng.chance(cfg.evo.mut.symmetric));
      }
    },

    clone(g) { return JSON.parse(JSON.stringify(g)); },

    uid(g) { return g.nextUid++; },

    randomWeights(rng) {
      const w = new Array(NIN);
      for (let i = 0; i < NIN; i++) w[i] = rng.gauss() * 0.6;
      w[0] = rng.gauss() * 1.5; // klok-ingangen sterker → hij gaat meteen bewegen
      w[1] = rng.gauss() * 1.5;
      return w;
    },

    // neutral = true: het nieuwe stokje begint "stil": sterkte ≈ 0 en
    // brein ≈ 0. Het organisme beweegt dus precies zoals zijn ouder.
    // Mutaties maken het stokje daarna stap voor stap sterker.
    // (Hetzelfde principe als NEAT: nieuwe structuur start neutraal.)
    newStick(g, a, b, rng, neutral = false) {
      const w = neutral ? new Array(NIN).fill(0).map(() => rng.gauss() * 0.05) : Genome.randomWeights(rng);
      const u = new Array(NIN).fill(0).map(() => (neutral ? 0 : rng.gauss() * 0.5));
      return { a, b, m: rng.chance(0.75), k: neutral ? 0 : 1, w, u, uid: Genome.uid(g) };
    },

    // Bouwtekening: waar komt elke bol (relatief aan de hoofdbol)?
    blueprint(g) {
      const P = [];
      for (const n of g.nodes) {
        if (n.p < 0) { P.push([0, 0, 0]); continue; }
        const q = P[n.p];
        P.push([q[0] + n.d[0] * n.l, q[1] + n.d[1] * n.l, q[2] + n.d[2] * n.l]);
      }
      return P;
    },

    hasStick(g, a, b) {
      return g.sticks.some(s => (s.a === a && s.b === b) || (s.a === b && s.b === a));
    },

    // ---------------- spiegel-hulpjes ----------------
    nodeIndexByUid(g, uid) { return g.nodes.findIndex(n => n.uid === uid); },

    // Index van de spiegel-partner van bol i (of -1)
    mirrorNode(g, i) {
      const n = g.nodes[i];
      if (n.mirOf !== undefined) return Genome.nodeIndexByUid(g, n.mirOf);
      return g.nodes.findIndex(o => o.mirOf === n.uid);
    },

    // Waar komt het spiegelbeeld van bol i? (partner, of i zelf als hij op de middellijn ligt)
    mirrorTarget(g, i) {
      const j = Genome.mirrorNode(g, i);
      return j >= 0 ? j : i;
    },

    mirrorStick(g, k) {
      const s = g.sticks[k];
      if (s.mirOf !== undefined) return g.sticks.findIndex(o => o.uid === s.mirOf);
      return g.sticks.findIndex(o => o.mirOf === s.uid);
    },

    // Kan bol "slave" exact gespiegeld worden t.o.v. "master"? Alleen als hun
    // ouders elkaars spiegelbeeld zijn, of dezelfde ouder op de middellijn (z = 0).
    mirrorParentOk(g, master, slave, P) {
      const mp = g.nodes[master].p, sp = g.nodes[slave].p;
      if (mp < 0 || sp < 0) return false;
      const partner = Genome.mirrorNode(g, mp);
      if (partner >= 0) return sp === partner;
      return sp === mp && Math.abs(P[mp][2]) < 1e-9;
    },

    // Maak spiegelbeelden weer gelijk aan hun origineel (na mutaties).
    // Van voor naar achter, zodat ouders al goed staan voor hun kinderen.
    syncMirrors(g) {
      const byUid = new Map(g.nodes.map((n, i) => [n.uid, i]));
      const P = [];
      g.nodes.forEach((n, i) => {
        if (n.mirOf !== undefined) {
          const mi = byUid.get(n.mirOf);
          if (mi === undefined || mi >= i) delete n.mirOf; // origineel weg (of na hem gegroeid)
          else {
            const m = g.nodes[mi];
            if (Genome.mirrorParentOk(g, mi, i, P)) { n.d = mirrorVec(m.d); n.l = m.l; }
            n.r = m.r;
          }
        }
        if (n.p < 0) P.push([0, 0, 0]);
        else { const q = P[n.p]; P.push([q[0] + n.d[0] * n.l, q[1] + n.d[1] * n.l, q[2] + n.d[2] * n.l]); }
      });
      const sByUid = new Map(g.sticks.map(s => [s.uid, s]));
      for (const s of g.sticks) {
        if (s.mirOf === undefined) continue;
        const m = sByUid.get(s.mirOf);
        if (!m || m.mirOf !== undefined) { delete s.mirOf; delete s.anti; continue; }
        s.m = m.m; s.k = m.k; s.w = m.w.slice(); s.u = m.u.slice(); // zelfde brein
      }
    },

    // Zijn alle bollen (via stokjes) met de hoofdbol verbonden?
    connected(g) {
      const N = g.nodes.length, seen = new Array(N).fill(false), stack = [0];
      seen[0] = true;
      let count = 1;
      while (stack.length) {
        const i = stack.pop();
        for (const s of g.sticks) {
          const j = s.a === i ? s.b : s.b === i ? s.a : -1;
          if (j >= 0 && !seen[j]) { seen[j] = true; count++; stack.push(j); }
        }
      }
      return count === N;
    },

    // ---------------- GROEI-mutaties ----------------

    // Nieuwe bol + stokje naar ouder (+ soms extra stokjes → driehoeken = stevig).
    // symmetric = true: groei tegelijk het spiegelbeeld aan de andere kant.
    addNode(g, rng, cfg, neutral = false, symmetric = false) {
      const B = cfg.body;
      if (g.nodes.length >= B.maxNodes || g.sticks.length >= B.maxSticks) return false;
      const P = Genome.blueprint(g);
      for (let tries = 0; tries < 12; tries++) {
        const p = rng.int(g.nodes.length);
        const d = rng.unitVec();
        const l = rng.range(B.minStick + 0.15, B.growLenMax);
        const pos = [P[p][0] + d[0] * l, P[p][1] + d[1] * l, P[p][2] + d[2] * l];
        if (P.some(q => dist(q, pos) < 0.3)) continue; // niet in een andere bol groeien

        // spiegelbeeld mogelijk? Ouder moet een partner hebben of op de middellijn
        // liggen; de nieuwe bol zelf niet op de middellijn; en genoeg ruimte.
        const pp = Genome.mirrorTarget(g, p);
        const mpos = [P[pp][0] + d[0] * l, P[pp][1] + d[1] * l, P[pp][2] - d[2] * l];
        const parentOk = pp !== p || Math.abs(P[p][2]) < 1e-9;
        const sym = symmetric && parentOk && Math.abs(pos[2]) > 0.15 &&
          g.nodes.length + 2 <= B.maxNodes && g.sticks.length + 2 <= B.maxSticks &&
          dist(mpos, pos) >= 0.3 && !P.some(q => dist(q, mpos) < 0.3);

        const r = rng.range(B.nodeRadiusMin, B.nodeRadiusMax);
        const i = g.nodes.length;
        const master = { p, d, l, r, uid: Genome.uid(g) };
        g.nodes.push(master);
        const s0 = Genome.newStick(g, p, i, rng, neutral);
        g.sticks.push(s0);
        let j = -1;
        if (sym) {
          j = g.nodes.length;
          g.nodes.push({ p: pp, d: mirrorVec(d), l, r, uid: Genome.uid(g), mirOf: master.uid });
          g.sticks.push({ ...Genome.clone(s0), a: pp, b: j, uid: Genome.uid(g), mirOf: s0.uid, anti: rng.chance(0.5) });
        }

        // extra verbindingen naar de dichtstbijzijnde andere bollen
        const cand = P.map((q, c) => ({ c, d: dist(q, pos) }))
          .filter(c => c.c !== p && c.d >= B.minStick && c.d <= B.maxStick)
          .sort((a, b) => a.d - b.d);
        for (let k = 0; k < 2 && k < cand.length; k++) {
          if (g.sticks.length + (sym ? 2 : 1) > B.maxSticks) break;
          if (!rng.chance(k === 0 ? 0.65 : 0.3)) continue;
          const s = Genome.newStick(g, cand[k].c, i, rng, neutral);
          g.sticks.push(s);
          if (sym) {
            const mc = Genome.mirrorTarget(g, cand[k].c);
            if (!Genome.hasStick(g, mc, j)) {
              g.sticks.push({ ...Genome.clone(s), a: mc, b: j, uid: Genome.uid(g), mirOf: s.uid, anti: rng.chance(0.5) });
            }
          }
        }
        // soms een dwarsverbinding tussen links en rechts (stevig "bekken")
        if (sym && g.sticks.length < B.maxSticks && dist(pos, mpos) <= B.maxStick && rng.chance(0.3)) {
          g.sticks.push(Genome.newStick(g, i, j, rng, neutral));
        }
        return true;
      }
      return false;
    },

    // Nieuw stokje tussen twee bestaande, nog niet verbonden bollen
    addStick(g, rng, cfg, neutral = true, symmetric = false) {
      const B = cfg.body;
      if (g.sticks.length >= B.maxSticks) return false;
      const P = Genome.blueprint(g), cand = [];
      for (let a = 0; a < P.length; a++) {
        for (let b = a + 1; b < P.length; b++) {
          const d = dist(P[a], P[b]);
          if (d >= B.minStick && d <= B.maxStick && !Genome.hasStick(g, a, b)) cand.push([a, b]);
        }
      }
      if (!cand.length) return false;
      const [a, b] = rng.pick(cand);
      const s = Genome.newStick(g, a, b, rng, neutral);
      g.sticks.push(s);
      if (symmetric && g.sticks.length < B.maxSticks) {
        const ma = Genome.mirrorTarget(g, a), mb = Genome.mirrorTarget(g, b);
        const same = (ma === a && mb === b) || (ma === b && mb === a);
        if (!same && ma !== mb && !Genome.hasStick(g, ma, mb)) {
          g.sticks.push({ ...Genome.clone(s), a: ma, b: mb, uid: Genome.uid(g), mirOf: s.uid, anti: rng.chance(0.5) });
        }
      }
      return true;
    },

    // ---------------- SNOEI-mutaties ----------------

    removeStick(g, rng) {
      if (!g.sticks.length) return false;
      const k = rng.int(g.sticks.length);
      const partner = Genome.mirrorStick(g, k);
      const backup = g.sticks.slice();
      const gone = new Set([g.sticks[k].uid]);
      if (partner >= 0) gone.add(g.sticks[partner].uid); // spiegelbeeld gaat mee
      g.sticks = g.sticks.filter(s => !gone.has(s.uid));
      if (Genome.connected(g)) { Genome.syncMirrors(g); return true; }
      g.sticks = backup; // zou een bol loskoppelen → terugdraaien
      return false;
    },

    // Verwijder een "blad"-bol (een bol waar niets uit gegroeid is), en
    // zijn spiegelbeeld als dat ook een blad is
    removeNode(g, rng, cfg) {
      const isLeaf = i => i > 0 && !g.nodes.some(n => n.p === i);
      const leaves = [];
      for (let i = 1; i < g.nodes.length; i++) if (isLeaf(i)) leaves.push(i);
      if (!leaves.length) return false;
      const i = rng.pick(leaves);
      const j = Genome.mirrorNode(g, i);
      const remove = [i];
      if (j >= 0 && isLeaf(j)) remove.push(j);
      if (cfg && g.nodes.length - remove.length < (cfg.body.minNodes || 1)) return false; // niet kleiner dan het minimum
      const backup = Genome.clone(g);
      remove.sort((a, b) => b - a); // van achter naar voren, dan kloppen de indexen
      for (const x of remove) {
        g.nodes.splice(x, 1);
        g.sticks = g.sticks.filter(s => s.a !== x && s.b !== x);
        for (const n of g.nodes) if (n.p > x) n.p--;
        for (const s of g.sticks) { if (s.a > x) s.a--; if (s.b > x) s.b--; }
      }
      if (Genome.connected(g)) { Genome.syncMirrors(g); return true; }
      Object.assign(g, backup);
      return false;
    },

    // ---------------- Hoofd-mutatie ----------------
    mutate(parent, rng, cfg) {
      const g = Genome.clone(parent);
      Genome.normalize(g);
      g.id = nextId++;
      g.parent = parent.id;
      const M = cfg.evo.mut, B = cfg.body;

      // lockBody = zelfgebouwd lichaam: alleen het brein mag veranderen
      const lock = !!cfg.evo.lockBody;

      // brein bijsturen (spiegelbeelden niet: die kopiëren hun origineel)
      for (const s of g.sticks) {
        if (s.mirOf !== undefined) {
          if (rng.chance(M.anti)) s.anti = !s.anti; // in/uit fase met het origineel
          continue;
        }
        for (const arr of [s.w, s.u]) {
          for (let k = 0; k < NIN; k++) {
            if (rng.chance(M.weightReset)) arr[k] = rng.gauss();
            else if (rng.chance(M.weightRate)) arr[k] += rng.gauss() * M.weightSigma;
          }
        }
        if (lock) continue;
        if (rng.chance(M.toggleMuscle)) s.m = !s.m;
        if (rng.chance(M.strengthRate)) s.k = clamp((s.k === undefined ? 1 : s.k) + rng.gauss() * 0.2 + 0.05, 0, 1);
      }
      if (rng.chance(M.freqRate)) g.f = clamp(g.f + rng.gauss() * M.freqSigma, 0.3, 3.0);
      if (lock) { Genome.syncMirrors(g); return g; }

      // vorm bijsturen (spiegelbeelden volgen via syncMirrors)
      for (let i = 1; i < g.nodes.length; i++) {
        const n = g.nodes[i];
        if (n.mirOf !== undefined) continue;
        if (rng.chance(M.morphRate)) {
          const d = n.d.map(v => v + rng.gauss() * 0.25);
          const l = G.M.len3(d[0], d[1], d[2]) || 1;
          n.d = d.map(v => v / l);
          n.l = clamp(n.l + rng.gauss() * 0.1, B.minStick, B.maxStick);
        }
        if (rng.chance(M.radiusRate)) {
          n.r = clamp(n.r + rng.gauss() * 0.02, B.nodeRadiusMin, B.nodeRadiusMax);
        }
      }

      // groeien / snoeien
      if (rng.chance(M.addNode)) Genome.addNode(g, rng, cfg, true, rng.chance(M.symmetric));
      if (rng.chance(M.addStick)) Genome.addStick(g, rng, cfg, true, rng.chance(M.symmetric));
      if (rng.chance(M.removeStick)) Genome.removeStick(g, rng);
      if (rng.chance(M.removeNode)) Genome.removeNode(g, rng, cfg);
      Genome.ensureMinNodes(g, rng, cfg);
      Genome.syncMirrors(g);
      return g;
    },

    // Zelfde lichaam, nieuw (willekeurig) brein
    rebrain(g, rng) {
      const c = Genome.clone(g);
      Genome.normalize(c);
      c.id = nextId++;
      c.f = rng.range(0.6, 2.0);
      for (const s of c.sticks) {
        s.w = Genome.randomWeights(rng);
        s.u = new Array(NIN).fill(0).map(() => rng.gauss() * 0.5);
      }
      Genome.syncMirrors(c);
      return c;
    },

    // ---------------- Bouw-modus ----------------
    // design = { nodes: [{x,y,z,r,mir?}], sticks: [{a,b,m,mir?,anti?}] } met
    // wereld-posities (bol 0 = hoofdbol). mir = index van de spiegel-partner.
    // Wordt omgezet naar een groeiprogramma: elke bol groeit uit een "ouder"
    // die via stokjes dichter bij de hoofdbol zit (breadth-first).
    fromDesign(design, rng) {
      const N = design.nodes.length;
      const adj = design.nodes.map(() => []);
      for (const s of design.sticks) { adj[s.a].push(s.b); adj[s.b].push(s.a); }
      const order = [0], parent = new Array(N).fill(-1), seen = new Array(N).fill(false);
      seen[0] = true;
      for (let q = 0; q < order.length; q++) {
        for (const j of adj[order[q]]) if (!seen[j]) { seen[j] = true; parent[j] = order[q]; order.push(j); }
      }
      if (order.length !== N) return null; // niet alles is verbonden
      const newIdx = new Array(N);
      order.forEach((old, i) => { newIdx[old] = i; });
      const P = design.nodes;
      const g = { id: nextId++, parent: 0, f: 1.2, nextUid: 1, nodes: [], sticks: [] };
      const nodeUid = new Array(N);
      for (const old of order) {
        const n = P[old];
        nodeUid[old] = Genome.uid(g);
        if (parent[old] < 0) { g.nodes.push({ p: -1, d: [0, 0, 0], l: 0, r: n.r, uid: nodeUid[old] }); continue; }
        const q = P[parent[old]];
        const dx = n.x - q.x, dy = n.y - q.y, dz = n.z - q.z;
        const l = G.M.len3(dx, dy, dz) || 1e-6;
        g.nodes.push({ p: newIdx[parent[old]], d: [dx / l, dy / l, dz / l], l, r: n.r, uid: nodeUid[old] });
      }
      // spiegel-paren: de bol die eerder groeit is het origineel
      P.forEach((n, old) => {
        const o = n.mir;
        if (o === undefined || o < 0 || o === old) return;
        if (newIdx[old] > newIdx[o]) g.nodes[newIdx[old]].mirOf = nodeUid[o];
      });
      const stickUid = design.sticks.map(() => Genome.uid(g));
      design.sticks.forEach((s, k) => {
        const st = {
          a: newIdx[s.a], b: newIdx[s.b], m: !!s.m, k: 1, w: Genome.randomWeights(rng),
          u: new Array(NIN).fill(0).map(() => rng.gauss() * 0.5), uid: stickUid[k]
        };
        if (s.mir !== undefined && s.mir >= 0 && s.mir < k) { st.mirOf = stickUid[s.mir]; st.anti = !!s.anti; }
        g.sticks.push(st);
      });
      Genome.syncMirrors(g);
      return g;
    },

    // Omgekeerd: genoom → bewerkbaar ontwerp (posities uit de bouwtekening)
    toDesign(g, origin) {
      Genome.normalize(g);
      const bp = Genome.blueprint(g);
      return {
        nodes: g.nodes.map((n, i) => ({
          x: origin[0] + bp[i][0], y: origin[1] + bp[i][1], z: origin[2] + bp[i][2], r: n.r,
          mir: Genome.mirrorNode(g, i)
        })),
        sticks: g.sticks.map((s, k) => ({ a: s.a, b: s.b, m: s.m, mir: Genome.mirrorStick(g, k), anti: !!s.anti }))
      };
    },

    describe(g) {
      const muscles = g.sticks.filter(s => s.m).length;
      const weak = g.sticks.filter(s => s.k !== undefined && s.k < 0.3).length;
      const mirrored = g.nodes.filter(n => n.mirOf !== undefined).length;
      return `${g.nodes.length} bollen · ${g.sticks.length} stokjes (${muscles} spieren` +
        (weak ? `, ${weak} nog zwak` : '') + ')' + (mirrored ? ` · ${mirrored} gespiegeld` : '');
    },

    // Controleer of een genoom klopt (gooit een fout als dat niet zo is).
    // Gebruikt door de tests om te bewaken dat mutaties niets kapotmaken.
    validate(g, cfg) {
      const fail = m => { throw new Error('ongeldig genoom: ' + m); };
      const N = g.nodes.length;
      if (!N || g.nodes[0].p !== -1) fail('bol 0 moet de hoofdbol zijn');
      const uids = new Set();
      g.nodes.forEach((n, i) => {
        if (i > 0 && !(n.p >= 0 && n.p < i)) fail(`bol ${i} heeft ongeldige ouder ${n.p}`);
        if (![n.l, n.r, ...n.d].every(Number.isFinite)) fail(`bol ${i} heeft geen geldige getallen`);
        if (uids.has(n.uid)) fail(`dubbele uid ${n.uid}`);
        uids.add(n.uid);
      });
      g.nodes.forEach((n, i) => {
        if (n.mirOf !== undefined && !g.nodes.some(o => o.uid === n.mirOf)) fail(`bol ${i}: spiegel-origineel bestaat niet`);
      });
      const pairs = new Set();
      g.sticks.forEach((s, k) => {
        if (!(s.a >= 0 && s.a < N && s.b >= 0 && s.b < N) || s.a === s.b) fail(`stokje ${k} verbindt ${s.a}-${s.b}`);
        const key = Math.min(s.a, s.b) + '-' + Math.max(s.a, s.b);
        if (pairs.has(key)) fail(`dubbel stokje ${key}`);
        pairs.add(key);
        if (!s.w || s.w.length !== NIN || !s.w.every(Number.isFinite)) fail(`stokje ${k} heeft een kapot brein`);
        if (!s.u || s.u.length !== NIN || !s.u.every(Number.isFinite)) fail(`stokje ${k} heeft een kapotte zender`);
        if (uids.has(s.uid)) fail(`dubbele uid ${s.uid}`);
        uids.add(s.uid);
        if (s.mirOf !== undefined) {
          const m = g.sticks.find(o => o.uid === s.mirOf);
          if (!m) fail(`stokje ${k}: spiegel-origineel bestaat niet`);
          if (m.w.some((v, i) => v !== s.w[i])) fail(`stokje ${k}: spiegelbrein loopt niet gelijk`);
        }
      });
      if (!(g.nextUid > Math.max(0, ...uids))) fail('nextUid te laag');
      if (!Genome.connected(g)) fail('niet alle bollen zijn verbonden');
      if (cfg && N > Math.max(cfg.body.maxNodes, 1)) fail(`te veel bollen (${N})`);
      if (cfg && g.sticks.length > cfg.body.maxSticks) fail(`te veel stokjes (${g.sticks.length})`);
      return true;
    },

    // Oudere/onvolledige genomen repareren: ontbrekende gewichten = 0 (dan
    // gedraagt een oud wezen zich precies als vroeger), uid's uitdelen,
    // en zorgen dat de id's niet botsen.
    normalize(g) {
      g.f = Number.isFinite(g.f) ? g.f : 1.2;
      g.id = Number.isFinite(g.id) ? g.id : nextId++;
      let maxUid = 0;
      for (const x of g.nodes.concat(g.sticks)) if (Number.isFinite(x.uid)) maxUid = Math.max(maxUid, x.uid);
      if (!(g.nextUid > maxUid)) g.nextUid = maxUid + 1;
      for (const n of g.nodes) if (!Number.isFinite(n.uid)) n.uid = g.nextUid++;
      for (const s of g.sticks) {
        if (!Number.isFinite(s.uid)) s.uid = g.nextUid++;
        s.w = (s.w || []).slice(0, NIN);
        while (s.w.length < NIN) s.w.push(0);
        s.u = (s.u || []).slice(0, NIN);
        while (s.u.length < NIN) s.u.push(0);
        s.m = !!s.m;
        s.k = Number.isFinite(s.k) ? clamp(s.k, 0, 1) : 1;
      }
      if (g.id >= nextId) nextId = g.id + 1;
      return g;
    },
    registerLoaded(g) { Genome.normalize(g); }
  };

  G.Genome = Genome;
});
