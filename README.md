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
| **🔊 + schuif** | Geluidseffecten aan/uit en volume (de browser onthoudt je keuze) |
| **🎵 + schuif** | Achtergrondmuziek aan/uit en volume |
| **Min spheres** | Minimaal aantal bollen per wezen (standaard 4) → geen saaie 2-stokjes-wezens |
| **Curriculum** | Begint met een vlakke baan zonder gat; wordt steeds 10% moeilijker zodra de kampioen het beheerst |
| **Muis** | Slepen = draaien · scroll = zoomen · rechts slepen = verschuiven |
| **Sliders** | Groeikosten, energiekosten, mutatiekans… direct effect |
| **👻 Ghost race** | De 12 beste van de vorige generatie lopen doorzichtig mee (HUD: "race: 3rd of 13") |
| **🏁 Courses** | Parcoursen kiezen, zelf bouwen, en je kampioen testen voor de ranglijst |
| **🖼 Gallery** | Je wezens bewaren met naam en plaatje; terugkijken, verder trainen, bewerken |
| **Where does the champion fail?** | Grafiek die laat zien waar de kampioen in zijn testruns strandt, plus een zin als "Most common problem: fell at the Gap (5 of 10 runs)" |
| **Download / Load JSON** | Organisme opslaan of delen (ook met Python, zie onder) |
| **Restore last session** | De browser onthoudt je laatste kampioen |

Geluid: tik/bonk als een bol de grond raakt (grote bol = lage toon), plopje
als er een bol groeit, belletje per checkpoint, fanfare bij de finish, "woesj"
als hij in het gat valt. Alles wordt live gemaakt met de Web Audio API
(`src/ui/sound.js`), dus er zijn geen geluidsbestanden nodig.

Muziek: een rustige loop in A-mineur die live gecomponeerd wordt
(`src/ui/music.js`). Hij leeft mee: alleen pads en bas in de bouw-modus,
arpeggio erbij als je kijkt, en drums erbij tijdens het trainen.

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
| **Ctrl+Z / Ctrl+Y** | Ongedaan maken / opnieuw (ook knoppen ↶ ↷) |
| **🪞 Mirror** | Wat je aan de ene kant bouwt, verschijnt ook aan de andere kant. Spiegel-spieren delen hun brein: half zoveel te leren |
| Mirrored muscles | *alternate* = om en om (lopen), *together* = tegelijk (springen) |
| Start from… | Spin, tweebenige walker, springer, slang, wiel, of het wezen dat nu in beeld is |

Daarna **▶ Train this body**: de AI leert een brein voor jouw lichaam.
Vink *Let evolution change my body too* aan als evolutie jouw ontwerp ook
mag aanpassen (bollen erbij, stokjes weg…).

Tip: driehoeken maken een lichaam stevig. Een lichaam met alleen botten
kan niet bewegen; je hebt minstens één spier nodig.

## 🏁 Parcoursen, uitdagingen en ranglijst

Klik **🏁 Courses**:

- **6 uitdagingen**: Classic, Gap Jumper, Staircase, Hurdle Run, Sweeper Alley
  (bewegende blokken!) en Bumpy Hills.
- **▶ Train here**: de evolutie traint voortaan op dat parcours.
- **⏱ Test champion**: je kampioen loopt één keer vanaf de standaardstart. Het
  resultaat komt in de **ranglijst** van dat parcours (in deze browser). Met ▶
  in de ranglijst kijk je een run terug.
- **Course editor**: bouw je eigen parcours uit onderdelen (vlak, gat, helling,
  trap, horde, trede, sweeper, hobbels), met schuifjes per onderdeel en een live
  voorbeeld. Daarna **💾 Save course**.

## 🐍 Python-versie (MuJoCo + reinforcement learning)

In de map [`python/`](python/README.md) zit dezelfde wereld in **MuJoCo**, de
simulator van robotica-onderzoekers. Daar train je een brein met **Evolution
Strategies** of **PPO** (reinforcement learning). Je wezens uit de browser kun je
daar inladen (Download JSON).

## ✅ Testen

```bat
npm test                         (12 tests van de simulatie, ~30 s)
cd python && py test_growbot.py  (3 tests van de Python-versie)
```

De belangrijkste test bewaakt dat de voorbeeld-kampioenen **bit-voor-bit**
hetzelfde blijven lopen, zodat een verbetering nooit stilletjes oude wezens
kapotmaakt.

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
  Met het **spiegel-gen** groeit er tegelijk een bol aan de andere kant.
- **Elk stokje heeft een eigen mini-brein** (1 neuron) met als ingangen een
  klok, aanraking met de grond, "ogen" die zien of er een gat of trede aankomt,
  en **berichten van de buur-spieren** (een mini Graph Neural Network).
- **Novelty search**: zit de evolutie lang vast, dan telt ook *nieuw gedrag* mee.
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
  parkour.js          het Classic-parcours
  tracks.js           parcoursen uit onderdelen + de uitdagingen
  genome.js           DNA + mutaties (groeien/snoeien)
  episode.js          één leven + de fitness-formule
  evolution.js        populatie, soorten, selectie
src/ui/               3D-weergave (Three.js) + knoppen
  editor.js           bouw-modus (spiegel, ongedaan maken)
  courses.js          parcours-editor, uitdagingen, ranglijst
  gallery.js          galerij
  failchart.js        "waarom faalt hij?"-grafiek
  workers.js          training op alle CPU-kernen (Web Workers)
  sound.js            geluidseffecten (Web Audio, zelf gesynthetiseerd)
  music.js            achtergrondmuziek (sequencer, live gecomponeerd)
tools/train.js        headless training (ook op alle kernen)
tests/                npm test (determinisme, golden traces, parallel = serieel)
python/               MuJoCo + Gymnasium + ES/PPO (zie python/README.md)
docs/ONTWERP.md       volledig ontwerp + uitleg
```
