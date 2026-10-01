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
        if (this.phase === 'eval') this._startValidation();
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
      if (job.kind === 'eval') {
        const ind = this.population[job.i];
        ind.runs[job.k] = summary;
        this.jobsDone++;
        if (ind.runs.every(r => r)) {
          ind.stats = G.mergeSummaries(ind.runs);
          ind.fitness = G.computeFitness(ind.stats, this.cfg);
          this.evaluations++;
        }
      } else {
        this.valRuns[job.c][job.k] = summary;
      }
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
        }
      });

      this.history.push({
        gen: this.generation, best: best.fitness, avg, champ: this.champion.fitness,
        dist: best.stats.maxX, finishRate: best.stats.finishRate,
        nodes: best.genome.nodes.length, sticks: best.genome.sticks.length, species,
        level: this.level, explore: this.explore
      });

      this._novelty(pop);
      // de beste van deze generatie: voor de "ghost race" in de app
      this.ghosts = pop.slice(0, 16).map(p => ({ genome: p.genome, fitness: p.fitness, nodes: p.genome.nodes.length }));
      this.population = this._breed(pop);
      this.generation++;
      this._newTrials();

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

    _breed(sorted) {
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
