# 🟠 GrowBot Parkour Lab

Een 3D-simulatie waarin **één bol** zelf botten, spieren en extra bollen
laat groeien en met **evolutie (AI)** leert een parkour te overwinnen:
vlak → spleet → helling → horde → hoge trede → finish.

```
     ●            ●─●            ●─●─●           ╱●╲
   (start)   →   groeit    →    leert     →    ●─●─●  → 🏁
   1 bol        stokjes         bewegen        over de spleet
```

## ▶ Starten (Windows)

**Optie 1: dubbelklikken (makkelijkst)**
1. Download de repo: op GitHub **Code → Download ZIP**, en pak hem uit.
2. Dubbelklik op **`index.html`**. Hij opent in Chrome/Edge/Firefox.
3. Klik **▶ Start training** en zet **Turbo** aan.
4. Of klik **★ Example champion** om meteen een getraind organisme te zien.

Alles staat in de map, ook Three.js. Er is dus geen internet of installatie nodig.

**Optie 2: supersnel trainen in de terminal (zonder graphics)**

Installeer [Node.js](https://nodejs.org) (LTS). Open dan in de map
**Command Prompt** of **PowerShell** (in File Explorer: typ `cmd` in de
adresbalk en druk op Enter):

```bat
node tools/train.js --gens 300
```

Het beste organisme komt in `champions\champion.json`. Laad het in de
browser met **⬆ Load JSON**.

Meer opties:

```bat
node tools/train.js --gens 500 --pop 100 --seed 7
node tools/train.js --from champions\champion.json          (verder trainen)
node tools/train.js --set fitness.nodeCost=0 --set body.maxNodes=20
node tools/make-example.js champions\champion.json          (wordt de "Example champion")
```

## 🎮 Bediening

| | |
|---|---|
| **▶ Start training** | Evolutie draait op de achtergrond; de kampioen wordt live getoond |
| **Turbo** | Meer rekentijd voor training (beeld wordt wat schokkeriger) |
| **Muis** | Slepen = draaien · scroll = zoomen · rechts slepen = verschuiven |
| **Sliders** | Groeikosten, energiekosten, mutatiekans… direct effect |
| **Download / Load JSON** | Organisme opslaan of delen |
| **Restore last session** | De browser onthoudt je laatste kampioen |

Kleuren: 🟠 hoofdbol · 🔵 knooppunt · ⚪ bot · spier **blauw = samengetrokken**, **rood = uitgerekt**.

## 🧠 Hoe werkt het?

Het volledige ontwerp staat in **[docs/ONTWERP.md](docs/ONTWERP.md)**: de AI-keuze
(evolutie vs. RL), de tech stack, de beloningsfunctie, en hoe we voorkomen dat hij "explodeert".

In het kort:

- **DNA = groeiprogramma**: "laat uit bol 2 een nieuwe bol groeien, 0,6 m schuin omhoog".
- **Elk stokje heeft een eigen mini-brein** (1 neuron) met als ingangen een
  klok, aanraking met de grond, en "ogen" die zien of er een gat of trede aankomt.
- **Evolutie**: 60 organismen, de beste krijgen gemuteerde kinderen.
  Mutaties kunnen **groeien** (bol/stokje erbij), **snoeien** of het **brein bijsturen**.
- **Eigen physics-engine** (Verlet + Position Based Dynamics): zwaartekracht,
  Coulomb-wrijving, botsingen, spierlimieten.

## 📁 Bestanden

```
index.html            ← open dit
src/core/             simulatie + AI (werkt in browser én Node.js)
  config.js           ★ alle instellingen: begin hier met experimenteren
  physics.js          zwaartekracht, stokjes, botsingen, wrijving
  parkour.js          de baan: pas obstakels hier aan
  genome.js           DNA + mutaties (groeien/snoeien)
  episode.js          één leven + de fitness-formule
  evolution.js        populatie, soorten, selectie
src/ui/               3D-weergave (Three.js) + knoppen
tools/train.js        headless training
docs/ONTWERP.md       volledig ontwerp + uitleg
```
