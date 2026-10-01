// =============================================================
//  genome.js — het DNA: groei-instructies + spier-brein
// =============================================================
//
//  Een genoom is een GROEIPROGRAMMA dat start bij één bol:
//
//    nodes[0]  = hoofdbol (root)
//    nodes[i]  = { p: ouder, d: richting, l: lengte, r: straal }
//                "groei vanuit bol p, in richting d, op afstand l"
//    sticks[k] = { a, b, m: spier?, w: [10 gewichten] }
//                verbinding tussen bol a en b. Als m = true is het
//                een spier met zijn eigen mini-brein (w).
//
//    Voorbeeld:          (2)
//                        / \        nodes:  0 ← root
//                     s1/   \s2             1: p=0
//                      /     \              2: p=1
//         (1)───s0───(0)      ...     sticks: s0(0,1) s1(1,2) s2(0,2)
//
//  Elk spier-brein is een klein neuraal netwerk (1 neuron):
//    activatie = tanh( w · [sin(t), cos(t), contactA, contactB,
//                           hoogteVerschilVooruit, gatVooruit,
//                           kantelingStokje, richtingStokje,
//                           zijwaartsePositie, 1] )
//  Omdat élk stokje zijn eigen kleine brein heeft, maakt het niet
//  uit hoeveel stokjes er groeien: het brein groeit gewoon mee.
//  (Dit is een "modulaire controller" — familie van Graph Neural Nets.)
(function (G) {
  'use strict';
  const clamp = G.clamp;
  const NIN = 10;
  let nextId = 1;

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  const Genome = {
    NIN,
    INPUT_NAMES: ['sin(t)', 'cos(t)', 'contact A', 'contact B',
      'trede vooruit', 'gat vooruit', 'kanteling', 'richting', 'zijwaarts', 'bias'],

    // Eén enkele bol: hier begint alles
    root(cfg) {
      return {
        id: nextId++, parent: 0, f: 1.2,
        nodes: [{ p: -1, d: [0, 0, 0], l: 0, r: cfg.body.rootRadius }],
        sticks: []
      };
    },

    // Startpopulatie: één bol + een paar willekeurige groeistappen
    initial(rng, cfg) {
      const g = Genome.root(cfg);
      g.f = rng.range(0.6, 2.0);
      const k = 1 + rng.int(4);
      for (let i = 0; i < k; i++) Genome.addNode(g, rng, cfg);
      return g;
    },

    clone(g) { return JSON.parse(JSON.stringify(g)); },

    randomWeights(rng) {
      const w = new Array(NIN);
      for (let i = 0; i < NIN; i++) w[i] = rng.gauss() * 0.6;
      w[0] = rng.gauss() * 1.5; // klok-ingangen sterker → hij gaat meteen bewegen
      w[1] = rng.gauss() * 1.5;
      return w;
    },

    // neutral = true: het nieuwe stokje begint "stil" (gewichten ≈ 0, dus
    // gedraagt zich als een bot). Zo maakt groeien het organisme niet meteen
    // kapot; evolutie leert de nieuwe spier daarna stap voor stap gebruiken.
    // (Hetzelfde principe als NEAT: nieuwe structuur start neutraal.)
    newStick(a, b, rng, neutral = false) {
      const w = neutral ? new Array(NIN).fill(0).map(() => rng.gauss() * 0.05) : Genome.randomWeights(rng);
      return { a, b, m: rng.chance(0.75), w };
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

    // Nieuwe bol + stokje naar ouder (+ soms extra stokjes → driehoeken = stevig)
    addNode(g, rng, cfg, neutral = false) {
      const B = cfg.body;
      if (g.nodes.length >= B.maxNodes || g.sticks.length >= B.maxSticks) return false;
      const P = Genome.blueprint(g);
      for (let tries = 0; tries < 12; tries++) {
        const p = rng.int(g.nodes.length);
        const d = rng.unitVec();
        const l = rng.range(B.minStick + 0.15, 1.0);
        const pos = [P[p][0] + d[0] * l, P[p][1] + d[1] * l, P[p][2] + d[2] * l];
        if (P.some(q => dist(q, pos) < 0.3)) continue; // niet in een andere bol groeien

        const i = g.nodes.length;
        g.nodes.push({ p, d, l, r: rng.range(B.nodeRadiusMin, B.nodeRadiusMax) });
        g.sticks.push(Genome.newStick(p, i, rng, neutral));

        // extra verbindingen naar de dichtstbijzijnde andere bollen
        const cand = P.map((q, j) => ({ j, d: dist(q, pos) }))
          .filter(c => c.j !== p && c.d >= B.minStick && c.d <= B.maxStick)
          .sort((a, b) => a.d - b.d);
        for (let k = 0; k < 2 && k < cand.length; k++) {
          if (g.sticks.length >= B.maxSticks) break;
          if (rng.chance(k === 0 ? 0.65 : 0.3)) g.sticks.push(Genome.newStick(cand[k].j, i, rng, neutral));
        }
        return true;
      }
      return false;
    },

    // Nieuw stokje tussen twee bestaande, nog niet verbonden bollen
    addStick(g, rng, cfg, neutral = true) {
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
      g.sticks.push(Genome.newStick(a, b, rng, neutral));
      return true;
    },

    // ---------------- SNOEI-mutaties ----------------

    removeStick(g, rng) {
      if (!g.sticks.length) return false;
      const k = rng.int(g.sticks.length);
      const removed = g.sticks.splice(k, 1)[0];
      if (Genome.connected(g)) return true;
      g.sticks.splice(k, 0, removed); // zou een bol loskoppelen → terugdraaien
      return false;
    },

    // Verwijder een "blad"-bol (een bol waar niets uit gegroeid is)
    removeNode(g, rng) {
      const leaves = [];
      for (let i = 1; i < g.nodes.length; i++) {
        if (!g.nodes.some(n => n.p === i)) leaves.push(i);
      }
      if (!leaves.length) return false;
      const i = rng.pick(leaves);
      const backup = Genome.clone(g);
      g.nodes.splice(i, 1);
      g.sticks = g.sticks.filter(s => s.a !== i && s.b !== i);
      for (const n of g.nodes) if (n.p > i) n.p--;
      for (const s of g.sticks) { if (s.a > i) s.a--; if (s.b > i) s.b--; }
      if (Genome.connected(g)) return true;
      Object.assign(g, backup);
      return false;
    },

    // ---------------- Hoofd-mutatie ----------------
    mutate(parent, rng, cfg) {
      const g = Genome.clone(parent);
      g.id = nextId++;
      g.parent = parent.id;
      const M = cfg.evo.mut, B = cfg.body;

      // brein bijsturen
      for (const s of g.sticks) {
        for (let k = 0; k < NIN; k++) {
          if (rng.chance(M.weightReset)) s.w[k] = rng.gauss();
          else if (rng.chance(M.weightRate)) s.w[k] += rng.gauss() * M.weightSigma;
        }
        if (rng.chance(M.toggleMuscle)) s.m = !s.m;
      }
      if (rng.chance(M.freqRate)) g.f = clamp(g.f + rng.gauss() * M.freqSigma, 0.3, 3.0);

      // vorm bijsturen
      for (let i = 1; i < g.nodes.length; i++) {
        const n = g.nodes[i];
        if (rng.chance(M.morphRate)) {
          const d = n.d.map(v => v + rng.gauss() * 0.25);
          const l = Math.hypot(d[0], d[1], d[2]) || 1;
          n.d = d.map(v => v / l);
          n.l = clamp(n.l + rng.gauss() * 0.1, B.minStick, B.maxStick);
        }
        if (rng.chance(M.radiusRate)) {
          n.r = clamp(n.r + rng.gauss() * 0.02, B.nodeRadiusMin, B.nodeRadiusMax);
        }
      }

      // groeien / snoeien
      if (rng.chance(M.addNode)) Genome.addNode(g, rng, cfg, true);
      if (rng.chance(M.addStick)) Genome.addStick(g, rng, cfg, true);
      if (rng.chance(M.removeStick)) Genome.removeStick(g, rng);
      if (rng.chance(M.removeNode)) Genome.removeNode(g, rng);
      return g;
    },

    describe(g) {
      const muscles = g.sticks.filter(s => s.m).length;
      return `${g.nodes.length} bollen · ${g.sticks.length} stokjes (${muscles} spieren)`;
    },

    // Na het laden van een JSON-bestand: oudere/onvolledige genomen repareren
    // (ontbrekende gewichten = 0) en zorgen dat de id's niet botsen.
    normalize(g) {
      g.f = Number.isFinite(g.f) ? g.f : 1.2;
      g.id = Number.isFinite(g.id) ? g.id : nextId++;
      for (const s of g.sticks) {
        s.w = (s.w || []).slice(0, NIN);
        while (s.w.length < NIN) s.w.push(0);
        s.m = !!s.m;
      }
      if (g.id >= nextId) nextId = g.id + 1;
      return g;
    },
    registerLoaded(g) { Genome.normalize(g); }
  };

  G.Genome = Genome;
})((globalThis.GROW = globalThis.GROW || {}));
