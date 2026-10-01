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
(function (G) {
  'use strict';
  const now = () => (globalThis.performance ? performance.now() : Date.now());

  class Evolution {
    constructor(cfg, seed = 1) {
      this.cfg = cfg;
      this.seed = seed;
      this.rng = new G.RNG(seed);
      this.track = G.buildParkour();
      this.generation = 0;
      this.population = [];
      for (let i = 0; i < cfg.evo.popSize; i++) {
        this.population.push({ genome: G.Genome.initial(this.rng, cfg), fitness: null, stats: null });
      }
      this.idx = 0;
      this.cur = null;
      this.trialRuns = [];
      this._newTrials();
      this.history = [];
      this.champion = null;
      this.championVersion = 0;
      this.evaluations = 0;
    }

    // Starts voor deze generatie: altijd de standaard-start + willekeurige
    _newTrials() {
      const n = Math.max(1, this.cfg.evo.trials | 0);
      this.trials = [G.NOMINAL];
      for (let i = 1; i < n; i++) this.trials.push(G.randomVariant(this.rng));
    }

    // Evalueer individuen tot het tijdsbudget (ms) op is.
    // Geeft true terug als er net een generatie is afgerond.
    evaluateSome(budgetMs) {
      const t0 = now();
      while (now() - t0 < budgetMs) {
        if (this.idx >= this.population.length) { this._endGeneration(); return true; }
        const ind = this.population[this.idx];
        if (!this.cur) {
          this.cur = new G.Episode(ind.genome, this.track, this.cfg, this.trials[this.trialRuns.length]);
        }
        if (this.cur.run(240)) {
          this.trialRuns.push(this.cur.summary());
          this.cur = null;
          if (this.trialRuns.length >= this.trials.length) {
            ind.stats = G.mergeSummaries(this.trialRuns);
            ind.fitness = G.computeFitness(ind.stats, this.cfg);
            this.trialRuns = [];
            this.idx++;
            this.evaluations++;
          }
        }
      }
      return false;
    }

    runGeneration() { while (!this.evaluateSome(1e9)); }

    get progress() { return this.idx / this.population.length; }

    // Volledige test van één genoom op vaste starts (standaard: VALIDATION)
    evaluate(genome, variants = G.VALIDATION) {
      const runs = variants.map(v => {
        const ep = new G.Episode(genome, this.track, this.cfg, v);
        while (!ep.run(10000));
        return ep.summary();
      });
      const stats = G.mergeSummaries(runs);
      return { stats, fitness: G.computeFitness(stats, this.cfg) };
    }

    // Na het wijzigen van de fitness-instellingen: scores opnieuw berekenen
    rescore() {
      for (const ind of this.population) if (ind.stats) ind.fitness = G.computeFitness(ind.stats, this.cfg);
      if (this.champion) this.champion.fitness = G.computeFitness(this.champion.stats, this.cfg);
    }

    _speciesKey(g) { return g.nodes.length; }

    _endGeneration() {
      const pop = this.population;
      pop.sort((a, b) => b.fitness - a.fitness);
      const best = pop[0];
      const avg = pop.reduce((s, p) => s + p.fitness, 0) / pop.length;
      const species = new Set(pop.map(p => this._speciesKey(p.genome))).size;

      // Kandidaat-kampioenen eerlijk valideren
      for (const cand of pop.slice(0, Math.max(1, this.cfg.evo.validateTop | 0))) {
        const v = this.evaluate(cand.genome);
        this.evaluations++;
        if (!this.champion || v.fitness > this.champion.fitness) {
          this.champion = {
            genome: G.Genome.clone(cand.genome), fitness: v.fitness,
            stats: v.stats, generation: this.generation
          };
          this.championVersion++;
        }
      }

      this.history.push({
        gen: this.generation, best: best.fitness, avg, champ: this.champion.fitness,
        dist: best.stats.maxX, finishRate: best.stats.finishRate,
        nodes: best.genome.nodes.length, sticks: best.genome.sticks.length, species
      });

      this.population = this._breed(pop);
      this.generation++;
      this.idx = 0;
      this._newTrials();
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

    // Zet een geladen genoom in de populatie (vervangt de laatste)
    inject(genome) {
      G.Genome.registerLoaded(genome);
      const pop = this.population;
      const slot = pop.length - 1;
      if (slot === this.idx) { this.cur = null; this.trialRuns = []; }
      pop[slot] = { genome: G.Genome.clone(genome), fitness: null, stats: null };
    }
  }

  G.Evolution = Evolution;
})((globalThis.GROW = globalThis.GROW || {}));
