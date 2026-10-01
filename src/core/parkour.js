// =============================================================
//  parkour.js — het obstakelparcours
// =============================================================
//
//  Zijaanzicht (x = vooruit, y = omhoog):
//
//                                              hoge trede        FINISH
//                                 horde   ┌──────────────────────┃──
//                    helling   ┌─┐ ┌──────┘                      ┃
//                         ___/ └─┘ │  plateau
//   START    spleet    __/        │
//  ●━━━━━━━━┓      ┏━━━━━━━━━━━━━┛
//  0        8    8+gap    13      17  19 19.4    22                28
//              (gat!)
//
//  De maten (breedte spleet, hoogtes) staan in config.js → parkour.
//
GROW_MODULE(function (G) {
  'use strict';

  // level = moeilijkheid 0..1 (curriculum). Bij 0 is alles vlak en is er
  // geen spleet; bij 1 heeft alles de maten uit config.js.
  function buildParkour(cfg = G.CONFIG, level = 1) {
    // zelfgebouwd parcours? → tracks.js
    if (cfg.track && cfg.track.segments) return G.buildCustomTrack(cfg.track, cfg, level);
    const PK = cfg.parkour;
    const W = PK.halfWidth;                  // halve breedte van de baan
    const GAP = PK.gapWidth * level;
    const GAP_END = 8 + GAP;                 // spleet loopt van x=8 tot GAP_END
    const RAMP_H = PK.rampHeight * level;    // hoogte plateau na de helling
    const HURDLE_H = PK.hurdleHeight * level;
    const STEP_H = RAMP_H + PK.stepHeight * level;
    const colliders = [];
    const box = (x0, x1, y0, y1, kind, friction, z0 = -W, z1 = W) => {
      colliders.push(new G.Collider({
        cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, cz: (z0 + z1) / 2,
        hx: (x1 - x0) / 2, hy: (y1 - y0) / 2, hz: (z1 - z0) / 2, kind, friction
      }));
    };
    // Lage randen links en rechts (zodat hij niet zijwaarts van de baan rolt)
    const RH = 0.5, RT = 0.15;
    const rails = (x0, x1, top) => {
      box(x0, x1, top - 0.2, top + RH, 'rail', 0.3, -W - RT, -W);
      box(x0, x1, top - 0.2, top + RH, 'rail', 0.3, W, W + RT);
    };
    const ramp = (x0, y0, x1, y1, t, kind, z0, z1) => {
      const L = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
      const c = (x1 - x0) / L, s = (y1 - y0) / L; // cos en sin van de hellingshoek
      colliders.push(new G.Collider({
        cx: (x0 + x1) / 2 + s * t / 2,
        cy: (y0 + y1) / 2 - c * t / 2,
        cz: (z0 + z1) / 2, hx: L / 2, hy: t / 2, hz: (z1 - z0) / 2, c, s, kind,
        friction: kind === 'rail' ? 0.3 : undefined
      }));
    };

    // 0. Achtermuur
    box(-4.5, -4, -1, 1.5, 'wall', 0.3, -W - RT, W + RT);
    // 1. Startvlak
    box(-4, 8, -1, 0, 'ground');
    rails(-4, 8, 0);
    // 2. Spleet (geen collider = gat). Diepe bodem als vangnet:
    if (GAP > 0) box(7.5, GAP_END + 0.5, -4, -3, 'pit');
    // 3. Vlak na de spleet
    box(GAP_END, 17, -1, 0, 'ground');
    rails(GAP_END, 13, 0);
    // 4. Helling van (13, 0) naar (17, RAMP_H) — een gedraaide doos
    ramp(13, 0, 17, RAMP_H, 0.3, 'ramp', -W, W);
    ramp(13, RH, 17, RAMP_H + RH, RH + 0.2, 'rail', -W - RT, -W);
    ramp(13, RH, 17, RAMP_H + RH, RH + 0.2, 'rail', W, W + RT);
    // 5. Plateau met een horde
    box(17, 22, -1, RAMP_H, 'ground');
    rails(17, 22, RAMP_H);
    if (HURDLE_H > 0.01) box(19, 19.4, RAMP_H, RAMP_H + HURDLE_H, 'block');
    // 6. Hoge trede tot de finish
    box(22, 32, -1, STEP_H, 'ground');
    rails(22, 32, STEP_H);
    box(32, 32.5, STEP_H, STEP_H + 1.3, 'wall', 0.3, -W - RT, W + RT);

    const checkpoints = [
      { x: GAP_END + 0.1, label: 'Spleet' },
      { x: 17.0, label: 'Helling' },
      { x: 19.5, label: 'Horde' },
      { x: 22.3, label: 'Trede' }
    ];

    return {
      level,
      colliders,
      checkpoints,
      finishX: 28,
      length: 32.5,
      start: [0, 0, 0],
      halfWidth: W,
      // Hoogste grond op (x, z); -Infinity boven een gat
      heightAt(x, z) {
        let h = -Infinity;
        for (const c of colliders) {
          if (c.kind !== 'ground' && c.kind !== 'ramp' && c.kind !== 'block') continue;
          const t = c.topAt(x, z);
          if (t > h) h = t;
        }
        return h;
      }
    };
  }

  G.buildParkour = buildParkour;
});
