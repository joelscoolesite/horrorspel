"""Train een brein met reinforcement learning (PPO, uit Stable-Baselines3).

PPO leert ANDERS dan evolutie: één brein (een neuraal netwerk) probeert
dingen, krijgt beloning, en past zijn gewichten aan met gradiënten. Dit is
"Optie B" uit docs/ONTWERP.md.

Installeren (Windows, in de map python/):
    py -m pip install -r requirements.txt
    py -m pip install stable-baselines3

Gebruik:
    py train_ppo.py --genome ../champions/example.js --index 1 --steps 1000000
    py play.py --genome ../champions/example.js --index 1 --ppo ppo_brain.zip
"""
import argparse

import numpy as np

from growbot import GrowBotEnv, load_genome


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--genome", default="../champions/example.js")
    ap.add_argument("--index", type=int, default=0)
    ap.add_argument("--steps", type=int, default=500_000, help="totaal aantal stappen om te leren")
    ap.add_argument("--envs", type=int, default=4, help="aantal wezens tegelijk")
    ap.add_argument("--out", default="ppo_brain")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    try:
        from stable_baselines3 import PPO
        from stable_baselines3.common.env_util import make_vec_env
        from stable_baselines3.common.vec_env import VecNormalize
    except ImportError:
        raise SystemExit("Installeer eerst: py -m pip install stable-baselines3")

    genome = load_genome(args.genome, args.index)
    venv = make_vec_env(lambda: GrowBotEnv(genome, randomize=True), n_envs=args.envs, seed=args.seed)
    # observaties en beloningen normaliseren: helpt PPO enorm
    venv = VecNormalize(venv, norm_obs=True, norm_reward=True, clip_obs=10.0)

    model = PPO("MlpPolicy", venv, n_steps=1024, batch_size=256, gae_lambda=0.95, gamma=0.99,
                learning_rate=3e-4, ent_coef=0.0, clip_range=0.2, n_epochs=10,
                policy_kwargs=dict(net_arch=[64, 64]), verbose=0, seed=args.seed)

    chunk = max(args.envs * 1024, args.steps // 10)
    done = 0
    while done < args.steps:
        model.learn(total_timesteps=chunk, reset_num_timesteps=False)
        done += chunk
        dist = evaluate(model, venv, genome)
        print(f"{done:>9,} stappen | gem. afstand (5 testruns): {dist:5.2f} m")

    model.save(args.out)
    venv.save(args.out + "_norm.pkl")
    print(f"\nOpgeslagen: {args.out}.zip (+ {args.out}_norm.pkl)")


def evaluate(model, venv, genome, runs=5):
    """Laat het brein 5× lopen (willekeurige starts) en geef de gemiddelde afstand."""
    env = GrowBotEnv(genome, randomize=True)
    dists = []
    for r in range(runs):
        obs, _ = env.reset(seed=1000 + r)
        while True:
            a, _ = model.predict(venv.normalize_obs(obs), deterministic=True)
            obs, _, term, trunc, info = env.step(a)
            if term or trunc:
                dists.append(info["best_x"])
                break
    return float(np.mean(dists))


if __name__ == "__main__":
    main()
