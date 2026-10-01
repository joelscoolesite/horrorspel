// =============================================================
//  config.js — alle instelbare getallen op één plek
// =============================================================
// Tip: begin met experimenteren HIER. Kleine wijzigingen hebben
// vaak grote gevolgen voor wat de evolutie "uitvindt".
(function (G) {
  'use strict';

  G.CONFIG = {
    physics: {
      dt: 1 / 120,          // tijdstap (s). 120 Hz = stabiel genoeg voor veren
      iterations: 8,        // constraint-iteraties per stap (meer = stijver/stabieler)
      gravity: -9.81,
      damping: 0.997,       // luchtweerstand (1 = geen)
      maxSpeed: 15,         // m/s — veiligheidsklep tegen "exploderen"
      boneStiffness: 0.6,   // stijfheid van een bot  (per iteratie, 0..1)
      muscleStiffness: 0.25 // stijfheid van een spier (zachter = minder kracht)
    },

    body: {
      rootRadius: 0.3,      // de centrale bol (hoofdorganisme)
      nodeRadiusMin: 0.09,
      nodeRadiusMax: 0.18,
      minStick: 0.25,       // kortste stokje (m)
      maxStick: 1.5,        // langste stokje (m)
      maxNodes: 14,         // HARDE limiet (incl. hoofdbol) → geen explosie
      maxSticks: 34,        // HARDE limiet
      muscleAmp: 0.35,      // spier kan ±35% korter/langer worden (= gewrichtslimiet)
      muscleSpeed: 0.08     // hoe snel een spier reageert (0..1 per stap; lager = trager)
    },

    growth: {
      interval: 0.12,       // elke 0.12 s groeit er een nieuwe bol
      ramp: 0.3,            // zo lang duurt het uitgroeien van een stokje
      spawnFraction: 0.3    // nieuwe bol start op 30% van zijn eindafstand
    },

    episode: {
      maxTime: 30,          // seconden na de groeifase
      stagnationTime: 5,    // stop als hij 5 s geen vooruitgang boekt
      stagnationDist: 0.3,
      deathY: -1.0          // onder deze hoogte = in een gat gevallen
    },

    fitness: {
      progress: 1.0,        // punten per meter (maximale x van de hoofdbol)
      checkpointBonus: 3,   // per gehaald obstakel
      finishBonus: 20,
      timeBonus: 1.0,       // per seconde over bij de finish
      nodeCost: 0.15,       // groeikosten per extra bol
      stickCost: 0.05,      // groeikosten per stokje
      energyCost: 0.004     // per spier-seconde activatie
    },

    evo: {
      popSize: 60,
      elite: 3,             // beste N gaan ongewijzigd door
      speciesElite: 6,      // beste van max N soorten ook beschermen
      tournament: 4,
      trials: 3,            // elk organisme 3× testen met (elke generatie) andere starts
      validateTop: 2,       // beste 2 van elke generatie extra testen op 8 vaste starts
      mut: {
        weightRate: 0.15, weightSigma: 0.3, weightReset: 0.01,
        freqRate: 0.15, freqSigma: 0.05,
        morphRate: 0.08,    // vorm (richting/lengte) van een bol bijsturen
        radiusRate: 0.05,
        toggleMuscle: 0.03, // bot <-> spier
        addNode: 0.10,      // GROEI: nieuwe bol + stokje(s)
        addStick: 0.08,     // GROEI: nieuw stokje tussen bestaande bollen
        removeStick: 0.05,  // SNOEI
        removeNode: 0.04    // SNOEI
      }
    }
  };

  G.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
})((globalThis.GROW = globalThis.GROW || {}));
