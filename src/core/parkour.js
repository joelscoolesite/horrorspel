// =============================================================
//  parkour.js — het obstakelparcours
// =============================================================
//
//  Zijaanzicht (x = vooruit, y = omhoog):
//
//                                              hoge trede        FINISH
//                                 horde   ┌──────────────────────┃──
//                    helling   ┌─┐ ┌──────┘                      ┃
//                         ___/ └─┘ │  plateau (0.8 m)
//   START    spleet    __/        │
//  ●━━━━━━━━┓      ┏━━━━━━━━━━━━━┛
//  0        8     9.0    13      17  19 19.4    22                28
//              (gat!)
//
(function (G) {
  'use strict';

  function buildParkour() {
    const W = 3.0; // halve breedte van de baan (z van -3 tot 3)
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
      const a = Math.atan2(y1 - y0, x1 - x0);
      const L = Math.hypot(x1 - x0, y1 - y0);
      colliders.push(new G.Collider({
        cx: (x0 + x1) / 2 + Math.sin(a) * t / 2,
        cy: (y0 + y1) / 2 - Math.cos(a) * t / 2,
        cz: (z0 + z1) / 2, hx: L / 2, hy: t / 2, hz: (z1 - z0) / 2, angle: a, kind,
        friction: kind === 'rail' ? 0.3 : undefined
      }));
    };

    // 0. Achtermuur
    box(-4.5, -4, -1, 1.5, 'wall', 0.3, -W - RT, W + RT);
    // 1. Startvlak
    box(-4, 8, -1, 0, 'ground');
    rails(-4, 8, 0);
    // 2. Spleet van 8.0 tot 9.0 (geen collider = gat). Diepe bodem als vangnet:
    box(7.5, 9.5, -4, -3, 'pit');
    // 3. Vlak na de spleet
    box(9.0, 17, -1, 0, 'ground');
    rails(9.0, 13, 0);
    // 4. Helling van (13, 0) naar (17, 0.8) — een gedraaide doos
    ramp(13, 0, 17, 0.8, 0.3, 'ramp', -W, W);
    ramp(13, RH, 17, 0.8 + RH, RH + 0.2, 'rail', -W - RT, -W);
    ramp(13, RH, 17, 0.8 + RH, RH + 0.2, 'rail', W, W + RT);
    // 5. Plateau op 0.8 m met een horde
    box(17, 22, -1, 0.8, 'ground');
    rails(17, 22, 0.8);
    box(19, 19.4, 0.8, 1.1, 'block');
    // 6. Hoge trede (+0.5 m) tot de finish
    box(22, 32, -1, 1.3, 'ground');
    rails(22, 32, 1.3);
    box(32, 32.5, 1.3, 2.6, 'wall', 0.3, -W - RT, W + RT);

    const checkpoints = [
      { x: 9.1,  label: 'Spleet' },
      { x: 17.0, label: 'Helling' },
      { x: 19.5, label: 'Horde' },
      { x: 22.3, label: 'Trede' }
    ];

    return {
      colliders,
      checkpoints,
      finishX: 28,
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
})((globalThis.GROW = globalThis.GROW || {}));
