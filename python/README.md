# 🐍 GrowBot in Python (MuJoCo + reinforcement learning)

Dit is **optie B** uit [docs/ONTWERP.md](../docs/ONTWERP.md). Dezelfde wezens
uit de browser, nu in **MuJoCo**: de robotica-simulator die ook onderzoekers
gebruiken. Je kunt hier een brein trainen met **Evolution Strategies** of met
**reinforcement learning (PPO)**.

```
 browser (JS)                       Python
 ─────────────                      ──────────────────────────────
 ⬇ Download JSON / galerij   ──▶   growbot.load_genome()
                                    growbot.build_mjcf()  → MuJoCo-model
                                    growbot.GrowBotEnv    → Gymnasium-omgeving
                                    train_es.py / train_ppo.py → brein trainen
                                    play.py               → kijken in 3D
```

## Installeren (Windows)

1. Installeer [Python 3.10+](https://www.python.org/downloads/). Vink bij de
   installer **"Add python.exe to PATH"** aan.
2. Open **Command Prompt** in de map `python` (in File Explorer: typ `cmd` in de
   adresbalk en druk op Enter).
3. Installeer de pakketten:

```bat
py -m pip install -r requirements.txt
py -m pip install stable-baselines3          (alleen nodig voor PPO)
py test_growbot.py                           (controle: moet "3 geslaagd" zeggen)
```

## Gebruiken

```bat
:: kijken hoe het browser-brein het doet in MuJoCo (met 3D-venster)
py play.py --genome ../champions/example.js --index 1 --js --view

:: een brein trainen met Evolution Strategies (gebruikt alle kernen)
py train_es.py --genome ../champions/example.js --index 1 --gens 100
py play.py --genome ../champions/example.js --index 1 --brain es_brain.npz --view

:: een brein trainen met reinforcement learning (PPO)
py train_ppo.py --genome ../champions/example.js --index 1 --steps 1000000
py play.py --genome ../champions/example.js --index 1 --ppo ppo_brain.zip --view

:: eerlijk meten: gemiddelde over 10 willekeurige starts
py play.py --genome ../champions/example.js --index 1 --brain es_brain.npz --runs 10

:: je eigen wezen (in de browser: Download JSON of galerij → ⬇)
py train_ppo.py --genome C:\Users\jij\Downloads\Speedy.json --steps 1000000
```

`--index` kiest het voorbeeld uit `champions/example.js`: 0 = de 3-bollen-tuimelaar,
1 = het 8-bollen-wezen.

## Wat we gemeten hebben

Hetzelfde wezen (voorbeeld 1, 9 spieren), Classic-parcours, gemiddeld over 10
willekeurige starts:

| Brein | Training | Afstand |
|---|---|---|
| Geen (spieren in rust, valt alleen om) | – | 3.7 m |
| Browser-brein, rechtstreeks overgezet | – | 1.2 m |
| Evolution Strategies (`train_es.py`) | 50 generaties, ~4 min | **10.0 m** |
| PPO (`train_ppo.py`) | 200.000 stappen, ~3 min | 7.0 m |

Wat valt op:

- **Het browser-brein werkt hier slecht.** De physics is anders: echte stijve
  lichamen en contacten i.p.v. Verlet. Een brein dat perfect is afgestemd op de
  ene simulator werkt niet automatisch in de andere. In de robotica heet dat de
  **sim-to-real gap** (hier sim-to-sim). Daarom train je opnieuw.
- **Beide leren** in een paar minuten tot de spleet (~8–10 m). Over de spleet
  heen kost meer training. Probeer `--gens 300` of `--steps 2000000`.
- **ES tegen PPO**: met zo weinig training scoort ES hier iets beter. PPO wordt
  met meer stappen meestal sterker, maar dat hebben we niet gemeten.

## Verschillen met de browser

| | Browser (JS) | Python (MuJoCo) |
|---|---|---|
| Physics | eigen Verlet/PBD | MuJoCo (rigid bodies, tendons) |
| Groeifase | ja, begint als 1 bol | nee, meteen volgroeid |
| Brein | 1 neuron per spier (evolutie) | lineair (ES) of neuraal netwerk (PPO) |
| Lichaam evolueren | ja | nee, alleen het brein |
| Parcours | alle parcoursen | alleen Classic |

## Bestanden

```
growbot/genome.py   genoom inlezen (.json of example.js) + bouwtekening
growbot/model.py    genoom → MJCF (MuJoCo-XML) + het Classic-parcours
growbot/env.py      Gymnasium-omgeving (observaties, acties, beloning)
train_es.py         Evolution Strategies (OpenAI-ES met Adam)
train_ppo.py        PPO via Stable-Baselines3
play.py             kijken, eerlijk meten, MJCF exporteren
test_growbot.py     snelle tests
```
