"""Laat een GrowBot-wezen lopen in MuJoCo (en kijk mee in een 3D-venster).

    py play.py --genome ../champions/example.js --index 1 --js            browser-brein
    py play.py --genome ../champions/example.js --index 1 --brain es_brain.npz
    py play.py --genome ../champions/example.js --index 1 --ppo ppo_brain.zip
    py play.py ... --view                                                   3D-venster
    py play.py ... --export growbot.xml                                     MJCF opslaan

--js gebruikt het brein uit de browser (zelfde 11 ingangen per spier, zelfde
gewichten). Omdat MuJoCo andere physics heeft dan de browser, loopt het wezen
hier anders: een mooie demonstratie van het "sim-to-sim"-probleem uit de robotica.
"""
import argparse
import math
import time

import numpy as np

from growbot import GrowBotEnv, load_genome
from growbot.model import HALF_WIDTH, height_at


class JsBrain:
    """Het spier-brein uit de browser (src/core/episode.js), nagebouwd op MuJoCo-data."""

    def __init__(self, env):
        self.env, g = env, env.genome
        self.sticks = g["sticks"]
        self.f = g.get("f", 1.2)
        self.muscles = [k for k, _ in env.info.muscles]
        self.act = np.zeros(len(self.sticks))
        self.msg = np.zeros(len(self.sticks))
        # buren (spieren die een bol delen) voor de berichten
        self.nbrs = []
        for k, s in enumerate(self.sticks):
            self.nbrs.append([j for j, o in enumerate(self.sticks)
                              if j != k and o.get("m") and {o["a"], o["b"]} & {s["a"], s["b"]}])
        # traag bijsturen zoals in de browser (0.08 per 1/120 s), omgerekend naar onze stap
        self.speed = 1 - (1 - 0.08) ** (env.dt * 120)

    def __call__(self, _obs):
        env = self.env
        pos = env._node_pos()          # MuJoCo: (x, y, z) met z omhoog
        t = env.data.time
        ph = 2 * math.pi * self.f * t
        s0, c0 = math.sin(ph), math.cos(ph)
        root = pos[0]
        boxes = env.info.boxes
        here = height_at(boxes, root[0])
        base = here if math.isfinite(here) else root[2] - 0.3
        hole = step = 0.0
        for i in (1, 2, 3):
            h = height_at(boxes, root[0] + 0.5 * i)
            if not math.isfinite(h):
                hole += 1 / 3
                continue
            hole += min(1, max(0, (base - h) / 0.5)) / 3
            step += min(1, max(-1, (h - base) * 2)) / 3
        side = min(1, max(-1, -root[1] / HALF_WIDTH))   # JS-z = −MuJoCo-y
        radii = [n["r"] for n in env.genome["nodes"]]

        def prox(i):
            h = height_at(boxes, pos[i][0])
            if not math.isfinite(h):
                return 0.0
            return min(1, max(0, 1 - (pos[i][2] - radii[i] - h) / 0.15))

        new_msg = self.msg.copy()
        out = []
        for k in self.muscles:
            s = self.sticks[k]
            w, u = s["w"] + [0] * (11 - len(s["w"])), (s.get("u") or [0] * 11)
            a, b = pos[s["a"]], pos[s["b"]]
            rest = env.info.rest[k]
            tilt = min(1, max(-1, (b[2] - a[2]) / rest))
            fwd = min(1, max(-1, (b[0] - a[0]) / rest))
            ss, cc = (-s0, -c0) if s.get("anti") else (s0, c0)
            sd = -side if "mirOf" in s else side
            m_in = np.mean([self.msg[j] for j in self.nbrs[k]]) if self.nbrs[k] else 0.0
            x = [ss, cc, prox(s["a"]), prox(s["b"]), step, hole, tilt, fwd, sd, 1.0, m_in]
            new_msg[k] = math.tanh(sum(ui * xi for ui, xi in zip(u, x)))
            target = math.tanh(sum(wi * xi for wi, xi in zip(w, x)))
            self.act[k] += (target - self.act[k]) * self.speed
            out.append(self.act[k])
        self.msg = new_msg
        return np.array(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--genome", default="../champions/example.js")
    ap.add_argument("--index", type=int, default=0)
    ap.add_argument("--brain", help="ES-brein (.npz uit train_es.py)")
    ap.add_argument("--ppo", help="PPO-brein (.zip uit train_ppo.py)")
    ap.add_argument("--js", action="store_true", help="gebruik het brein uit de browser")
    ap.add_argument("--view", action="store_true", help="3D-venster openen")
    ap.add_argument("--export", help="sla het MuJoCo-model (MJCF) op als dit bestand")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--runs", type=int, default=1, help="aantal runs met willekeurige starts (eerlijk meten)")
    args = ap.parse_args()

    genome = load_genome(args.genome, args.index)
    env = GrowBotEnv(genome, randomize=args.seed != 0)
    if args.export:
        with open(args.export, "w", encoding="utf-8") as f:
            f.write(env.xml)
        print(f"MJCF opgeslagen: {args.export}  (bekijk met: py -m mujoco.viewer --mjcf={args.export})")

    if args.brain:
        d = np.load(args.brain)
        n_act, n_obs = int(d["n_act"]), int(d["n_obs"])
        W, b = d["theta"][: n_act * n_obs].reshape(n_act, n_obs), d["theta"][n_act * n_obs:]
        policy, name = (lambda o: np.tanh(W @ o + b)), "ES-brein"
    elif args.ppo:
        from stable_baselines3 import PPO
        import pickle
        model = PPO.load(args.ppo)
        norm_path = args.ppo.replace(".zip", "") + "_norm.pkl"
        with open(norm_path, "rb") as f:
            norm = pickle.load(f)
        policy = lambda o: model.predict(norm.normalize_obs(o), deterministic=True)[0]
        name = "PPO-brein"
    elif args.js:
        policy, name = JsBrain(env), "browser-brein"
    else:
        policy, name = (lambda o: np.zeros(env.action_space.shape)), "geen brein (stilstaan)"

    if args.runs > 1:  # eerlijk meten: gemiddelde over meerdere willekeurige starts
        env.randomize = True
        dists, fins = [], 0
        for r in range(args.runs):
            if isinstance(policy, JsBrain):
                policy = JsBrain(env)
            obs, _ = env.reset(seed=args.seed + 1 + r)
            while True:
                obs, _, term, trunc, info = env.step(policy(obs))
                if term or trunc:
                    break
            dists.append(info["best_x"]); fins += bool(info["finished"])
        print(f"{name}: gem. {np.mean(dists):.2f} m over {args.runs} starts (min {min(dists):.2f}, max {max(dists):.2f}), finish {fins}×")
        return

    obs, _ = env.reset(seed=args.seed)
    viewer = None
    if args.view:
        import mujoco.viewer
        viewer = mujoco.viewer.launch_passive(env.model, env.data)
    info = {}
    while True:
        t0 = time.time()
        obs, _, term, trunc, info = env.step(policy(obs))
        if viewer is not None:
            if not viewer.is_running():
                break
            viewer.sync()
            time.sleep(max(0, env.dt - (time.time() - t0)))  # real-time
        if term or trunc:
            break
    if viewer is not None:
        viewer.close()
    result = "🏁 FINISH" if info.get("finished") else ("in een gat gevallen" if info.get("fell") else "tijd op")
    print(f"{name}: {info['best_x']:.2f} m, {info['checkpoints']} checkpoints, {result} (t = {info['time']:.1f} s)")


if __name__ == "__main__":
    main()
