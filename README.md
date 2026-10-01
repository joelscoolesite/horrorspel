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
3. Klik **▶ Start training**. Hij rekent op al je CPU-kernen tegelijk.
4. Of klik **★ Example champion** om meteen een getraind organisme te zien
   (klik nog eens voor het tweede voorbeeld: een groot lichaam van 8 bollen).
5. Of klik **✏ Build your own creature** en ontwerp je eigen wezen (zie hieronder).

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
| **Turbo** | Alleen zichtbaar als je browser geen Web Workers kan gebruiken |
| **Replay-snelheid** | 0.25× tot **20×** |
| **Min spheres** | Minimaal aantal bollen per wezen (standaard 4) → geen saaie 2-stokjes-wezens |
| **Curriculum** | Begint met een vlakke baan zonder gat; wordt steeds 10% moeilijker zodra de kampioen het beheerst |
| **Muis** | Slepen = draaien · scroll = zoomen · rechts slepen = verschuiven |
| **Sliders** | Groeikosten, energiekosten, mutatiekans… direct effect |
| **Download / Load JSON** | Organisme opslaan of delen |
| **Restore last session** | De browser onthoudt je laatste kampioen |

Kleuren: 🟠 hoofdbol · 🔵 knooppunt · ⚪ bot · spier **blauw = samengetrokken**, **rood = uitgerekt**.

## ✏ Zelf bouwen

Klik **✏ Build your own creature**:

| Actie | Wat het doet |
|---|---|
| Klik in lege ruimte | Nieuwe bol, met een spier vast aan de geselecteerde bol |
| Klik op een bol | Selecteren · **slepen** = verplaatsen |
| **Shift** + klik op een bol | Stokje toevoegen/weghalen tussen die bol en de geselecteerde |
| Klik op een stokje | Wisselen tussen **spier** (rood, kan bewegen) en **bot** (wit, stijf) |
| **Delete** | Geselecteerde bol weg |
| Start from… | Begin met een spin, springer, slang, wiel, of het wezen dat nu in beeld is |

Daarna **▶ Train this body**: de AI leert een brein voor jouw lichaam.
Vink *Let evolution change my body too* aan als evolutie jouw ontwerp ook
mag aanpassen (bollen erbij, stokjes weg…).

Tip: driehoeken maken een lichaam stevig. Een lichaam met alleen botten
kan niet bewegen; je hebt minstens één spier nodig.

## ⏱ Wat kun je verwachten?

- Na ~10–30 generaties: hij beweegt vooruit en het curriculum-level stijgt.
- Na ~50–300 generaties: over de spleet, de helling op, soms de finish.
- Evolutie heeft **toeval**: niet elke run lukt. Blijft hij lang steken?
  Druk op **Reset** voor een nieuwe populatie. In onze tests haalden
  2 van de 5 runs geregeld de finish (zie [docs/ONTWERP.md](docs/ONTWERP.md#verwachtingen-eerlijk)).

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
                        (o.a. breedte spleet, hoogte trede, max bollen)
  dmath.js            eigen sin/cos/tanh → overal exact dezelfde simulatie
  physics.js          zwaartekracht, stokjes, botsingen, wrijving
  parkour.js          de baan: pas obstakels hier aan
  genome.js           DNA + mutaties (groeien/snoeien)
  episode.js          één leven + de fitness-formule
  evolution.js        populatie, soorten, selectie
src/ui/               3D-weergave (Three.js) + knoppen
  editor.js           bouw-modus
  workers.js          training op alle CPU-kernen (Web Workers)
tools/train.js        headless training (ook op alle kernen)
docs/ONTWERP.md       volledig ontwerp + uitleg
```
