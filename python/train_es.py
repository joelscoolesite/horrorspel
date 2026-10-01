"""Train een brein voor een GrowBot-wezen in MuJoCo met Evolution Strategies (ES).

ES in het kort (OpenAI-ES):
    1. neem het huidige brein θ (een lineaire laag: observatie → spieren)
    2. maak N varianten θ ± σ·ε  (ε = willekeurige ruis)
    3. laat ze allemaal lopen, kijk welke ruis-richting beter werkte
    4. schuif θ een stukje in die richting (met de Adam-optimizer), herhaal

Gebruik (Windows: in de map python/):
    py -m pip install -r requirements.txt
    py train_es.py --genome ../champions/example.js --index 1 --gens 50
    py train_es.py --genome ../champions/champion.json --gens 100 --workers 8
"""
import argparse
import multiprocessing as mp
import time

import numpy as np

from growbot import GrowBotEnv, load_genome

_ENV = None


def _init(genome):
    global _ENV
    _ENV = GrowBotEnv(genome, randomize=True)


def rollout(args):
    """Eén episode met een lineair brein. Geeft (totale beloning, verste x) terug."""
    theta, seed = args
    env = _ENV
    n_act, n_obs = env.action_space.shape[0], env.observation_space.shape[0]
    W = theta[: n_act * n_obs].reshape(n_act, n_obs)
    b = theta[n_act * n_obs:]
    obs, _ = env.reset(seed=int(seed))
    total, info = 0.0, {"best_x": 0.0}
    while True:
        a = np.tanh(W @ obs + b)
        obs, r, term, trunc, info = env.step(a)
        total += r
        if term or trunc:
            return total, info["best_x"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--genome", default="../champions/example.js")
    ap.add_argument("--index", type=int, default=0, help="welk voorbeeld uit example.js")
    ap.add_argument("--gens", type=int, default=50)
    ap.add_argument("--pop", type=int, default=24, help="aantal varianten per generatie (even)")
    ap.add_argument("--sigma", type=float, default=0.05)
    ap.add_argument("--lr", type=float, default=0.01)
    ap.add_argument("--workers", type=int, default=mp.cpu_count())
    ap.add_argument("--out", default="es_brain.npz")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    genome = load_genome(args.genome, args.index)
    probe = GrowBotEnv(genome)
    n_act, n_obs = probe.action_space.shape[0], probe.observation_space.shape[0]
    dim = n_act * n_obs + n_act
    rng = np.random.default_rng(args.seed)
    theta = np.zeros(dim)
    # klok-ingangen (obs 0 en 1) een duwtje geven, anders beweegt er in het begin niets
    W0 = theta[: n_act * n_obs].reshape(n_act, n_obs)
    W0[:, 0] = rng.normal(0, 1.0, n_act)
    W0[:, 1] = rng.normal(0, 1.0, n_act)
    theta[: n_act * n_obs] = W0.ravel()

    print(f"ES: {n_act} spieren, {n_obs} observaties → {dim} parameters, {args.workers} kernen")
    best = (-np.inf, None, 0.0)
    m, v = np.zeros(dim), np.zeros(dim)
    with mp.Pool(args.workers, initializer=_init, initargs=(genome,)) as pool:
        for gen in range(args.gens):
            t0 = time.time()
            half = args.pop // 2
            eps = rng.normal(size=(half, dim))
            seeds = rng.integers(0, 2**31, size=2)            # zelfde starts voor iedereen (eerlijk)
            cands = [theta + args.sigma * e for e in eps] + [theta - args.sigma * e for e in eps]
            jobs = [(c, s) for c in cands for s in seeds]
            res = pool.map(rollout, jobs)
            scores = np.array([np.mean([res[i * 2 + j][0] for j in range(2)]) for i in range(len(cands))])
            dists = np.array([np.mean([res[i * 2 + j][1] for j in range(2)]) for i in range(len(cands))])
            # rang-gebaseerd (robuust tegen uitschieters)
            ranks = scores.argsort().argsort() / (len(scores) - 1) - 0.5
            grad = (ranks[:half] - ranks[half:]) @ eps / (half * args.sigma)
            # Adam: stapgrootte past zich aan per parameter (stabieler dan gewoon optellen)
            m = 0.9 * m + 0.1 * grad
            v = 0.999 * v + 0.001 * grad * grad
            mh, vh = m / (1 - 0.9 ** (gen + 1)), v / (1 - 0.999 ** (gen + 1))
            theta += args.lr * mh / (np.sqrt(vh) + 1e-8) - 0.001 * args.lr * theta  # + klein beetje "weight decay"
            i = int(scores.argmax())
            if scores[i] > best[0]:
                best = (scores[i], cands[i].copy(), dists[i])
            print(f"gen {gen:3d} | gem. beloning {scores.mean():7.2f} | beste {scores.max():7.2f} | "
                  f"verste {dists.max():5.2f} m | {time.time() - t0:4.1f}s")

        # Opslaan: het GEMIDDELDE brein θ (wat ES echt geleerd heeft), niet de
        # beste variant — die had vaak gewoon geluk met zijn 2 starts.
        final = pool.map(rollout, [(theta, 10_000 + i) for i in range(8)])
    dist = float(np.mean([d for _, d in final]))
    np.savez(args.out, theta=theta, n_act=n_act, n_obs=n_obs)
    print(f"\nGeleerd brein: gem. {dist:.2f} m over 8 nieuwe starts → opgeslagen in {args.out}")
    print(f"(beste losse variant tijdens training: {best[2]:.2f} m — vaak geluk)")
    print(f"Kijken: py play.py --genome {args.genome} --index {args.index} --brain {args.out}")


if __name__ == "__main__":
    main()
