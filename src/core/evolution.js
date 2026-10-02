// =============================================================
//  evolution.js — de AI: evolutie van vorm + brein tegelijk
// =============================================================
//
//   ┌────────────┐   simuleer   ┌──────────┐   sorteer   ┌───────────┐
//   │ populatie  │ ───────────▶ │ fitness  │ ──────────▶ │ selectie  │
//   │ (60 DNA's) │  (3 starts)  │ per DNA  │             │ + soorten │
//   └────────────┘              └──────────┘             └─────┬─────┘
//         ▲                                                    │
//         │          kopie + mutatie (groei/snoei/brein)       │
//         └────────────────────────────────────────────────────┘
//
//  Drie trucs die het verschil maken:
//
//  1. ROBUUSTHEID — elk DNA loopt meerdere keren, met starts die ELKE
//     generatie opnieuw willekeurig gekozen worden. Een geluksvogel die
//     alleen vanaf één plek werkt, valt zo vanzelf af.
//  2. EERLIJKE KAMPIOEN — de beste van een generatie wordt nog eens
//     getest op 8 vaste starts (VALIDATION). Alleen die score telt.
//  3. SOORTEN (uit NEAT) — DNA's met hetzelfde aantal bollen vormen een
//     soort. Een nieuwe, grotere vorm is eerst vaak slechter (het brein
//     moet nog leren). Door soorten te beschermen krijgt hij de tijd.
//  4. NOVELTY SEARCH — zit de evolutie lang vast (geen betere kampioen),
//     dan telt ook NIEUW GEDRAG mee: "doe iets wat nog niemand deed"
//     (ergens anders eindigen, hoger komen…). Dat helpt over muren heen.
//  5. WISSELENDE TEST — elke 10 generaties krijgt de kampioens-test nieuwe
//     starts, zodat de evolutie die niet uit het hoofd kan leren.
//  6. GRADIËNT-STAP (ADVANCED, "Evolution Strategies") — gewone mutaties zijn
//     blind. Daarom maken we elke generatie ook een paar PROEF-varianten
//     van het brein van de kampioen: θ + σ·ε en θ − σ·ε. Uit hun scores
//     schatten we in welke richting het brein beter wordt (de gradiënt),
//     en we zetten een gerichte stap. Die "getunede" kinderen doen gewoon
//     mee in de volgende generatie; de selectie beslist of ze goed zijn.
//
//         score ▲        ε₁ ●+          θ = huidig brein
//               │    θ ●───────▶ stap   ε = willekeurige richting
//               │   ●−                  + beter dan − → die kant op
//               └────────────────▶ brein-gewichten
//
//  SNELHEID — elke run (organisme × start) is een losse TAAK in een
//  wachtrij. Zonder "pool" draaien de taken hier (één CPU-kern). Met een
//  pool (Web Workers in de browser, worker_threads in Node) draaien ze
//  tegelijk op alle kernen. Resultaten komen op een vaste plek terecht,
//  dus de uitkomst is precies hetzelfde, in welke volgorde ze ook klaar zijn.
GROW_MODULE(function (G) {
  'use strict';
  const now = () => (globalThis.performance ? performance.now() : Date.now());

  class Evolution {
    // opts.seedGenome: start met dit lichaam (bouw-modus) i.p.v. willekeurige DNA's
    constructor(cfg, seed = 1, opts = {}) {
      this.cfg = cfg;
      this.seed = seed;
      this.rng = new G.RNG(seed);
      // Curriculum: begin op level 0 (makkelijk) of meteen op 1 (volledig)
      this.level = cfg.evo.curriculum ? 0 : 1;
      this.track = G.buildParkour(cfg, this.level);
      this.generation = 0;
      this.population = [];
      for (let i = 0; i < cfg.evo.popSize; i++) {
        let genome;
        if (opts.seedGenome) {
          genome = i === 0 ? G.Genome.clone(opts.seedGenome) : G.Genome.rebrain(opts.seedGenome, this.rng);
        } else {
          genome = G.Genome.initial(this.rng, cfg);
        }
        this.population.push({ genome, fitness: null, stats: null });
      }
      this.history = [];
      this.probes = [];                 // proef-varianten voor de gradiënt-stap
      this.tuneStats = { made: 0, wins: 0 };
      this.validation = G.VALIDATION;   // starts voor de kampioens-test
      this.archive = [];                // novelty: gedrag dat we al eens zagen
      this.lastImprove = 0;             // generatie van de laatste verbetering
      this.explore = 0;                 // hoeveel telt "nieuw gedrag" nu mee (0..1)
      this.champion = null;
      this.championVersion = 0;
      this.evaluations = 0;
      this.pool = null;
      this.epoch = 0;
      this._newTrials();
      this._startGeneration();
    }

    // Parallel rekenen aan/uit (pool = null → alles op deze kern)
    setPool(pool) {
      this.pool = pool;
      this._startGeneration(); // lopende taken opnieuw verdelen
    }

    // Starts voor deze generatie: allemaal willekeurig (of, met
    // evo.nominalTrial = 1, altijd ook de standaard-start erbij)
    _newTrials() {
      const n = Math.max(1, this.cfg.evo.trials | 0);
      this.trials = this.cfg.evo.nominalTrial ? [G.NOMINAL] : [];
      while (this.trials.length < n) this.trials.push(G.randomVariant(this.rng));
      // extra starts voor "racing" (zie _startRace)
      this.raceTrials = [];
      if (this.cfg.evo.raceTop > 0) {
        for (let i = 0; i < (this.cfg.evo.raceTrials | 0); i++) this.raceTrials.push(G.randomVariant(this.rng));
      }
    }

    // RACING (ADVANCED): de beste kandidaten van deze generatie krijgen extra
    // testritten vóór de selectie. Zo wint niet wie toevallig 3 goede starts
    // had, maar wie écht goed is. (Bekende truc voor "ruizige" optimalisatie.)
    _startRace() {
      this.phase = 'race';
      const E = this.cfg.evo;
      if (!(E.raceTop > 0) || !this.raceTrials.length) return;
      const order = this.population.map((p, i) => i).sort((a, b) => this.population[b].fitness - this.population[a].fitness);
      for (const i of order.slice(0, E.raceTop)) {
        const ind = this.population[i], base = this.trials.length;
        ind.runs = ind.runs.concat(new Array(this.raceTrials.length).fill(null));
        this.raceTrials.forEach((variant, k) => this.queue.push({ kind: 'race', i, k: base + k, genome: ind.genome, variant }));
      }
    }

    // Zet alle taken voor de huidige generatie in de wachtrij
    _startGeneration() {
      this.epoch++;            // resultaten van oudere taken worden genegeerd
      this.queue = [];
      this.inflight = 0;
      this.phase = 'eval';
      if (this.pool) { this.pool.cancelPending(); this.pool.setConfig(this.cfg); }
      this.population.forEach((ind, i) => {
        ind.runs = new Array(this.trials.length).fill(null);
        ind.stats = null;
        ind.fitness = null;
        this.trials.forEach((variant, k) => this.queue.push({ kind: 'eval', i, k, genome: ind.genome, variant }));
      });
      // proef-varianten voor de gradiënt-stap (lopen op dezelfde starts → eerlijk vergelijken)
      (this.probes || []).forEach((pr, p) => {
        pr.runs = new Array(this.trials.length).fill(null);
        pr.fitness = null;
        this.trials.forEach((variant, k) => this.queue.push({ kind: 'probe', p, k, genome: pr.genome, variant }));
      });
      this.jobsTotal = this.queue.length;
      this.jobsDone = 0;
    }

    // Werk de wachtrij af. Zonder pool: tot het tijdsbudget (ms) op is.
    // Geeft true terug als er net een generatie is afgerond.
    pump(budgetMs) {
      const t0 = now();
      for (;;) {
        if (this.pool) {
          // alles in één keer aan de pool geven; die verdeelt over de workers
          while (this.queue.length) this._dispatch(this.queue.shift());
        } else if (this.queue.length) {
          if (now() - t0 >= budgetMs) return false;
          const job = this.queue.shift();
          this._finish(job, this._runLocal(job));
          continue;
        }
        if (this.queue.length || this.inflight) return false;
        if (this.phase === 'eval') this._startRace();
        else if (this.phase === 'race') this._startValidation();
        else { this._finalize(); return true; }
      }
    }

    // Oude naam (gebruikt door oudere scripts)
    evaluateSome(budgetMs) { return this.pump(budgetMs); }

    runGeneration() {
      if (this.pool) throw new Error('Met een pool: gebruik runGenerationAsync()');
      while (!this.pump(1e9));
    }

    async runGenerationAsync() {
      while (!this.pump(50)) await new Promise(r => setTimeout(r, 1));
    }

    get progress() { return this.jobsTotal ? this.jobsDone / this.jobsTotal : 0; }

    _runLocal(job) {
      const ep = new G.Episode(job.genome, this.track, this.cfg, job.variant);
      while (!ep.run(100000));
      return ep.summary();
    }

    _dispatch(job) {
      const epoch = this.epoch;
      this.inflight++;
      this.pool.run({ genome: job.genome, variant: job.variant, level: this.level }, summary => {
        if (epoch !== this.epoch) return; // verouderd (nieuw level, reset…)
        this.inflight--;
        this._finish(job, summary);
      });
    }

    _finish(job, summary) {
      if (job.kind === 'race') {
        const ind = this.population[job.i];
        ind.runs[job.k] = summary;
        if (ind.runs.every(r => r)) {
          ind.stats = G.mergeSummaries(ind.runs);
          ind.fitness = G.computeFitness(ind.stats, this.cfg);
        }
      } else if (job.kind === 'eval') {
        const ind = this.population[job.i];
        ind.runs[job.k] = summary;
        this.jobsDone++;
        if (ind.runs.every(r => r)) {
          ind.stats = G.mergeSummaries(ind.runs);
          ind.fitness = G.computeFitness(ind.stats, this.cfg);
          this.evaluations++;
        }
      } else if (job.kind === 'probe') {
        const pr = this.probes[job.p];
        pr.runs[job.k] = summary;
        this.jobsDone++;
        if (pr.runs.every(r => r)) pr.fitness = G.computeFitness(G.mergeSummaries(pr.runs), this.cfg);
      } else {
        this.valRuns[job.c][job.k] = summary;
      }
    }

    // Nieuwe proef-varianten rond het brein van de kampioen
    _newProbes() {
      const E = this.cfg.evo;
      this.probes = [];
      if (!E.esTune || !this.champion) return;
      const base = G.Genome.normalize(G.Genome.clone(this.champion.genome));
      const theta = G.Genome.getBrain(base);
      if (!theta.length) return;
      this.probeBase = { genome: base, theta, eps: [] };
      for (let k = 0; k < E.esPairs; k++) {
        const eps = theta.map(() => this.rng.gauss());
        this.probeBase.eps.push(eps);
        for (const sign of [1, -1]) {
          const g = G.Genome.setBrain(G.Genome.clone(base), theta.map((v, i) => v + sign * E.esSigma * eps[i]));
          this.probes.push({ genome: g, fitness: null, runs: [] });
        }
      }
    }

    // RECOMBINATIE (ADVANCED): de beste DNA's met precies hetzelfde lichaam
    // als de kampioen → hun breinen gewogen middelen (de beste telt het zwaarst).
    // Middelen dempt de ruis van toevallige uitschieters (zoals bij CMA-ES).
    _recombine(sorted) {
      const E = this.cfg.evo;
      if (!E.recombine || !this.champion) return [];
      const sig = g => g.sticks.map(s => `${s.uid}:${s.m ? 1 : 0}:${(s.h || []).length}`).join(',') + '|' + g.nodes.length;
      const target = sig(this.champion.genome);
      const same = sorted.filter(p => sig(p.genome) === target);
      if (same.length < 4) return [];
      const mu = Math.min(8, Math.floor(same.length / 2));
      const wts = []; // log-gewichten zoals in CMA-ES
      for (let i = 0; i < mu; i++) wts.push(Math.log(mu + 0.5) - Math.log(i + 1));
      const tot = wts.reduce((a, b) => a + b, 0);
      const vecs = same.slice(0, mu).map(p => G.Genome.getBrain(p.genome));
      const mean = vecs[0].map((_, i) => vecs.reduce((acc, v, k) => acc + v[i] * wts[k], 0) / tot);
      const child = G.Genome.setBrain(G.Genome.clone(same[0].genome), mean);
      child.tuned = this.generation;
      this.tuneStats.made++;
      return [child];
    }

    // Uit de proef-scores de verbeter-richting schatten en 2 getunede kinderen maken
    _gradientStep() {
      const pb = this.probeBase, P = this.probes || [];
      if (!pb || !P.length || P.some(p => p.fitness === null)) return [];
      // rang-gebaseerd (robuust tegen uitschieters): slechtste −0.5 … beste +0.5
      const order = P.map((p, i) => i).sort((a, b) => P[a].fitness - P[b].fitness);
      const rank = new Array(P.length);
      order.forEach((i, r) => { rank[i] = r / (P.length - 1) - 0.5; });
      const dim = pb.theta.length, grad = new Array(dim).fill(0);
      pb.eps.forEach((eps, k) => {
        const d = rank[2 * k] - rank[2 * k + 1];
        for (let i = 0; i < dim; i++) grad[i] += d * eps[i];
      });
      const norm = Math.sqrt(grad.reduce((s, v) => s + v * v, 0));
      if (norm < 1e-12) return [];
      const E = this.cfg.evo, size = E.esSigma * Math.sqrt(dim);
      return [0.5, 1.0].map(f => {
        const g = G.Genome.setBrain(G.Genome.clone(pb.genome),
          pb.theta.map((v, i) => v + f * size * grad[i] / norm));
        g.tuned = this.generation;          // merkje: gemaakt door de gradiënt-stap
        this.tuneStats.made++;
        return g;
      });
    }

    // De beste kandidaten nog eens testen op 8 vaste starts
    _startValidation() {
      this.phase = 'validate';
      this.population.sort((a, b) => b.fitness - a.fitness);
      this.valCands = this.population.slice(0, Math.max(1, this.cfg.evo.validateTop | 0));
      this.valRuns = this.valCands.map(() => new Array(this.validation.length).fill(null));
      this.valCands.forEach((cand, c) => this.validation.forEach((variant, k) =>
        this.queue.push({ kind: 'val', c, k, genome: cand.genome, variant })));
    }

    // Volledige test van één genoom op vaste starts (standaard: VALIDATION)
    evaluate(genome, variants = this.validation) {
      const runs = variants.map(variant => this._runLocal({ genome, variant }));
      const stats = G.mergeSummaries(runs);
      return { stats, fitness: G.computeFitness(stats, this.cfg) };
    }

    // Na het wijzigen van de fitness-instellingen: scores opnieuw berekenen
    rescore() {
      for (const ind of this.population) if (ind.stats) ind.fitness = G.computeFitness(ind.stats, this.cfg);
      if (this.champion) this.champion.fitness = G.computeFitness(this.champion.stats, this.cfg);
    }

    _speciesKey(g) { return g.nodes.length; }

    _finalize() {
      const pop = this.population; // al gesorteerd in _startValidation
      const best = pop[0];
      const avg = pop.reduce((s, p) => s + p.fitness, 0) / pop.length;
      const species = new Set(pop.map(p => this._speciesKey(p.genome))).size;

      this.valCands.forEach((cand, c) => {
        const stats = G.mergeSummaries(this.valRuns[c]);
        const fitness = G.computeFitness(stats, this.cfg);
        this.evaluations++;
        if (!this.champion || fitness > this.champion.fitness) {
          this.champion = {
            genome: G.Genome.clone(cand.genome), fitness, stats,
            generation: this.generation, level: this.level, track: this.cfg.track || null
          };
          this.championVersion++;
          this.lastImprove = this.generation;
          if (cand.genome.tuned !== undefined) this.tuneStats.wins++; // de gradiënt-stap won!
        }
      });

      this.history.push({
        gen: this.generation, best: best.fitness, avg, champ: this.champion.fitness,
        dist: best.stats.maxX, finishRate: best.stats.finishRate,
        nodes: best.genome.nodes.length, sticks: best.genome.sticks.length, species,
        level: this.level, explore: this.explore, tuneWins: this.tuneStats.wins
      });

      this._novelty(pop);
      // de beste van deze generatie: voor de "ghost race" in de app
      this.ghosts = pop.slice(0, 16).map(p => ({ genome: p.genome, fitness: p.fitness, nodes: p.genome.nodes.length }));
      const tuned = this._gradientStep().concat(this._recombine(pop));
      this.population = this._breed(pop, tuned);
      this.generation++;
      this._newTrials();
      this._newProbes();

      // Wisselende test: nieuwe starts, de kampioen moet zich opnieuw bewijzen
      const E0 = this.cfg.evo;
      if (E0.validationRefresh > 0 && this.generation % E0.validationRefresh === 0) {
        this.validation = [G.NOMINAL];
        while (this.validation.length < E0.validationSize) this.validation.push(G.randomVariant(this.rng));
        const v = this.evaluate(this.champion.genome);
        this.champion.fitness = v.fitness;
        this.champion.stats = v.stats;
      }

      // Curriculum: beheerst de kampioen dit level? Dan wordt het moeilijker.
      const E = this.cfg.evo;
      if (E.curriculum && this.level < 1 && this.champion.stats.gapRate >= E.levelPass) {
        this.setLevel(Math.min(1, Math.round((this.level + E.levelStep) * 100) / 100));
      } else {
        this._startGeneration();
      }
    }

    // Gedrag samengevat in een paar getallen (waar eindigde hij, hoe hoog kwam hij…)
    _behavior(st) { return [st.maxX / 10, st.endX / 10, st.finalZ / 2, (st.maxY || 0) / 1.5]; }

    // Novelty: hoe anders is elk DNA dan de rest + het archief?
    _novelty(pop) {
      const E = this.cfg.evo;
      const stuck = this.generation - this.lastImprove;
      this.explore = E.novelty > 0 ? E.novelty * Math.min(1, Math.max(0, (stuck - 10) / 20)) : 0;
      const descs = pop.map(p => this._behavior(p.stats));
      const all = descs.concat(this.archive);
      const K = Math.min(10, all.length - 1);
      pop.forEach((p, i) => {
        const d = all.map(o => Math.hypot(...o.map((v, k) => v - descs[i][k]))).sort((a, b) => a - b);
        let sum = 0;
        for (let k = 1; k <= K; k++) sum += d[k]; // d[0] = hijzelf (afstand 0)
        p.novelty = K > 0 ? sum / K : 0;
      });
      // de 2 meest nieuwe gedragingen bewaren in het archief
      [...pop].sort((a, b) => b.novelty - a.novelty).slice(0, 2)
        .forEach(p => this.archive.push(this._behavior(p.stats)));
      if (this.archive.length > 400) this.archive.splice(0, this.archive.length - 400);
    }

    _breed(sorted, extra = []) {
      const E = this.cfg.evo, rng = this.rng;
      const next = [];
      // Elites gaan ongewijzigd door, maar worden opnieuw getest
      // (met nieuwe starts) — geen eeuwige roem voor één geluksrun.
      const keep = ind => next.push({ genome: ind.genome, fitness: null, stats: null });

      // 1. Elite: de allerbesten
      for (let i = 0; i < Math.min(E.elite, sorted.length); i++) keep(sorted[i]);
      // De kampioen doet ook altijd mee
      if (this.champion && !next.some(n => n.genome === this.champion.genome)) {
        next.push({ genome: G.Genome.clone(this.champion.genome), fitness: null, stats: null });
      }

      // 2. Soorten indelen + beste van elke soort beschermen
      const bySpecies = new Map();
      for (const ind of sorted) {
        const key = this._speciesKey(ind.genome);
        if (!bySpecies.has(key)) bySpecies.set(key, []);
        bySpecies.get(key).push(ind);
      }
      let protectedCount = 0;
      for (const members of bySpecies.values()) { // Map houdt volgorde: beste soort eerst
        if (protectedCount >= E.speciesElite) break;
        if (!next.some(n => n.genome === members[0].genome)) { keep(members[0]); protectedCount++; }
      }

      // getunede kinderen van de gradiënt-stap doen ook mee
      for (const g of extra) if (next.length < E.popSize) next.push({ genome: g, fitness: null, stats: null });

      // 3. Fitness delen binnen een soort → één soort domineert niet alles
      const minF = sorted[sorted.length - 1].fitness;
      for (const members of bySpecies.values()) {
        const share = Math.sqrt(members.length);
        for (const m of members) m.adj = (m.fitness - minF + 0.01) / share;
      }
      // + bonus voor nieuw gedrag als de evolutie vastzit (novelty search)
      if (this.explore > 0) {
        const maxAdj = Math.max(...sorted.map(m => m.adj));
        const maxNov = Math.max(1e-9, ...sorted.map(m => m.novelty || 0));
        for (const m of sorted) m.adj += this.explore * maxAdj * ((m.novelty || 0) / maxNov);
      }

      // 4. Rest vullen met gemuteerde kinderen (toernooiselectie)
      while (next.length < E.popSize) {
        let parent = null;
        for (let k = 0; k < E.tournament; k++) {
          const c = rng.pick(sorted);
          if (!parent || c.adj > parent.adj) parent = c;
        }
        next.push({ genome: G.Genome.mutate(parent.genome, rng, this.cfg), fitness: null, stats: null });
      }
      return next.slice(0, Math.max(E.popSize, 1));
    }

    // Nieuw level → nieuwe baan; de kampioen moet zich opnieuw bewijzen
    setLevel(level) {
      if (level !== this.level) {
        this.level = level;
        this.track = G.buildParkour(this.cfg, level);
        if (this.champion) {
          const v = this.evaluate(this.champion.genome);
          this.champion.fitness = v.fitness;
          this.champion.stats = v.stats;
          this.champion.level = level;
          this.champion.track = this.cfg.track || null;
          this.championVersion++;
        }
      }
      this._startGeneration();
    }

    // Ander parcours (def = { name, segments } of null = Classic)
    setTrack(def, level = this.level) {
      this.cfg.track = def || null;
      this.level = -1; // forceer opnieuw bouwen + kampioen opnieuw meten
      this.setLevel(level);
    }

    // Zet een geladen genoom in de populatie (vervangt de laatste)
    inject(genome) {
      G.Genome.registerLoaded(genome);
      const pop = this.population;
      pop[pop.length - 1] = { genome: G.Genome.clone(genome), fitness: null, stats: null };
      this._startGeneration();
    }
  }

  G.Evolution = Evolution;
});
