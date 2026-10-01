# GrowBot — Ontwerpdocument

> Een centrale bol die zelf botten, spieren en extra bollen laat groeien
> en met AI leert een parkour te overwinnen.

Inhoud:

1. [AI-architectuur: evolutie of reinforcement learning?](#1-ai-architectuur)
2. [Tech stack: browser of Python?](#2-tech-stack)
3. [Beloningsfunctie & groeikosten](#3-beloningsfunctie--groeikosten)
4. [Hoe het prototype in elkaar zit](#4-architectuur-van-het-prototype)
5. [Wat de evolutie (tot nu toe) uitvindt](#5-wat-de-evolutie-uitvindt)
6. [Versie 3: wat erbij kwam, en wat het opleverde](#6-versie-3-wat-erbij-kwam-en-wat-het-opleverde)
7. [Volgende stappen](#7-volgende-stappen)

---

## 1. AI-architectuur

Het lastige aan dit idee: **de AI moet twee dingen tegelijk leren.**

| Vraag | Soort probleem |
|---|---|
| *Welk lichaam bouw ik?* (hoeveel bollen, waar, welke stokjes) | Discreet, structuur verandert. Er is geen "gradiënt" voor het toevoegen van een bot |
| *Hoe beweeg ik dat lichaam?* | Continu, aansturing van spieren |

Bij een **nieuw lichaam hoort een ander brein**. Een controller die goed
werkt voor 3 bollen is onbruikbaar voor 7 bollen. Dat is de kern van de keuze.

### Optie A: Evolutie (Genetische Algoritmen / NEAT / HyperNEAT)

```
  populatie ──▶ simuleer ──▶ fitness ──▶ selectie ──▶ mutatie ──┐
      ▲                                                         │
      └─────────────────────────────────────────────────────────┘
```

| ✅ Voordelen | ❌ Nadelen |
|---|---|
| Lichaam + brein in **één genoom**, samen geëvolueerd | Weinig "sample-efficiënt": duizenden simulaties nodig |
| Groeiende topologie is **natuurlijk** (mutatie "voeg bol toe") | Ruig fitnesslandschap: vooruitgang in sprongen |
| Geen gradiënten nodig → werkt met elke physics | Leert niet tijdens één leven |
| Makkelijk te parallelliseren, simpele code | |
| Bewezen: Karl Sims (1994), Sodarace, Evolution Gym | |

**NEAT** laat neurale netwerken "groeien" (begint klein, voegt neuronen toe)
en beschermt nieuwe structuren met *soorten* (speciation).
**HyperNEAT** evolueert een patroon-generator (CPPN) die het netwerk
"tekent". Dat is handig voor symmetrische lichamen met veel poten.

### Optie B: Reinforcement Learning (PPO + Graph Neural Network)

```
   ┌──────────── omgeving (physics) ────────────┐
   │  toestand s  ──▶  GNN-policy  ──▶ actie a  │
   │     ▲                                │     │
   │     └──── beloning r, nieuwe s ◀─────┘     │
   └────────────────────────────────────────────┘
   PPO past de gewichten aan met gradiënten
```

Het lichaam is een **graaf** (bollen = knopen, stokjes = randen). Een
**GNN** gebruikt dezelfde gewichten voor elke knoop. Daardoor werkt het
voor elk lichaam, hoe groot ook (zie *NerveNet*, *Modular RL*, *SMP*,
*Transform2Act*).

| ✅ Voordelen | ❌ Nadelen |
|---|---|
| Veel beter in **fijne motoriek** en reageren op sensoren | Groei-acties zijn discreet + veranderen de graaf → zware RL-engineering |
| Leert binnen één leven (closed-loop) | Elke nieuwe vorm = verschuivende verdeling → instabiel |
| GNN generaliseert over lichamen | Veel hyperparameters, debuggen is lastig |
| | Python + GPU vrijwel verplicht |

### Vergelijking

| | Evolutie (GA/NEAT) | RL (PPO + GNN) |
|---|---|---|
| Morfologie (groei) | ⭐⭐⭐⭐⭐ natuurlijk | ⭐⭐ moeilijk (Transform2Act doet het) |
| Beweging (controller) | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Moeilijkheid bouwen | ⭐ makkelijk | ⭐⭐⭐⭐ moeilijk |
| Draait in de browser | ✅ | ❌ (realistisch niet) |
| Simulaties nodig | 10⁴–10⁶ | 10⁶–10⁸ stappen |

### 👉 Advies: hybride, in twee fases

1. **Nu (dit prototype): evolutie van lichaam + brein samen.** Het genoom
   is een groeiprogramma. Mutaties laten bollen/stokjes groeien of
   snoeien. Soorten beschermen nieuwe lichaamsvormen.
2. **Later (Python): "outer loop / inner loop".** Evolutie kiest het
   lichaam (buitenste lus). Per lichaam leert een **gedeelde GNN-policy
   met PPO** de beweging (binnenste lus). Lichaam en brein hebben dan
   elk de techniek die het best bij ze past.

Het prototype is daar al op voorbereid. Elk stokje heeft een eigen klein
brein met dezelfde soort ingangen (een **modulaire controller**). Dat is
een GNN zonder berichten tussen buren. Stap 2 = berichten toevoegen + PPO.

---

## 2. Tech stack

### Optie A: Browser (HTML5 + JavaScript + Three.js) ← **gekozen voor het prototype**

| Onderdeel | Keuze | Waarom |
|---|---|---|
| Graphics | **Three.js** | Grootste community, simpele API, schaduwen en camera's |
| Physics | **Eigen Verlet/PBD-engine** (~200 regels) | Deterministisch, supersnel voor bollen+stokjes, volledig te begrijpen |
| Alternatief physics | Rapier.js (WASM) | Echte rigid bodies + joints met limieten. Kies dit als je echte servo-gewrichten wilt |
| AI | Eigen evolutie in JS | Geen dependencies |

**Waarom geen Rapier/Cannon voor deze versie?** Bij evolutie draai je
duizenden simulaties. Een eigen massa-veer-engine:
- is **deterministisch**: hetzelfde genoom geeft altijd dezelfde score, zodat replays kloppen,
- is **10–50× sneller** dan een algemene rigid-body engine,
- is **leesbaar**: je ziet precies wat zwaartekracht en wrijving doen.

Cannon.js wordt niet meer onderhouden (gebruik dan `cannon-es`).
Rapier.js is de moderne keuze als je naar rigid bodies wilt.

### Optie B: Python (onderzoek / RL)

| Onderdeel | Keuze | Waarom |
|---|---|---|
| Physics | **MuJoCo** (gratis, `pip install mujoco`) | Snelste en meest nauwkeurige robotica-sim, joint limits, actuators, contacten |
| Alternatief | PyBullet | Makkelijker, maar trager en minder onderhouden |
| GPU-versnelling | MuJoCo **MJX** (JAX) / Brax | Duizenden robots tegelijk op de GPU |
| RL-framework | **Gymnasium** + Stable-Baselines3 (PPO) of CleanRL | Standaard API, veel voorbeelden |
| GNN | PyTorch Geometric | Graaf-netwerken voor variabele lichamen |
| Evolutie | `evotorch`, `neat-python` | Klaar voor gebruik |

Een MuJoCo-lichaam is een **MJCF (XML)-bestand**. Ons genoom is daar makkelijk naar om te zetten:

```
bol      → <body> met <geom type="sphere">
stokje   → <tendon> (spier) of <joint>+<geom type="capsule"> (bot)
spier    → <actuator><position tendon="..."/></actuator>
limieten → range="..." op de joint of tendon
```

### 👉 Advies

| Doel | Kies |
|---|---|
| Snel resultaat zien, delen, experimenteren | **Optie A**, dit prototype (dubbelklik `index.html`) |
| Serieuze RL, GNN's, paper-niveau | **Optie B**, MuJoCo + Gymnasium + SB3/CleanRL |

Begin met A om te begrijpen *wat* werkt. Stap over naar B als je wilt
dat het organisme *slimmer* beweegt (closed-loop RL).

---


## 3. Beloningsfunctie & groeikosten

### De fitness-formule (zie `src/core/episode.js`)

```
fitness =   1.0 × afstand            (verste x van de hoofdbol, in meter)
          + 3   × checkpoints        (spleet, helling, horde, trede)
          + 20  × finish             (× deel van de testruns dat finisht)
          + 1   × seconden over      (sneller = beter)
          − 0.15 × extra bollen      ┐
          − 0.05 × stokjes           ├ groeikosten
          − 0.004 × spier-energie    ┘ (∑ |activatie| · dt)
```

Elk organisme wordt **3× getest** vanaf willekeurige starts (positie,
draaiing ±20°, ritme). Die worden **elke generatie opnieuw** geloot. De score is het gemiddelde (*domain randomization*).
De beste 2 van elke generatie worden daarna nog eens getest op **8 vaste
starts**. Alleen die score telt voor de kampioen.

### Hoe voorkomen we dat hij "explodeert" (oneindig groeit)?

Er zijn **zes lagen** verdediging:

```
 1. HARDE LIMIETEN     max 14 bollen, 34 stokjes, stokje 0.25–1.5 m
        │              → kan simpelweg niet verder groeien
 2. GROEIKOSTEN        elke bol/stokje kost punten
        │              → groeien moet zichzelf terugverdienen
 3. ENERGIEKOSTEN      meer spieren = meer energie = minder punten
        │
 4. SNOEI-MUTATIES     naast "groei" bestaan ook "verwijder bol/stokje"
        │              → evolutie kan ook kleiner worden
 5. NEUTRALE GROEI     een nieuw stokje start met sterkte ≈ 0
        │              → groeien maakt niets kapot, wordt geleidelijk sterker
 6. STABIELE PHYSICS   snelheidslimiet, zachte spieren, groei-animatie
                       (nieuwe bol start op 30% en groeit uit)
                       → geen numerieke explosies
```

*Parsimony pressure* (laag 2) is het belangrijkst. Stel de kosten zo
af dat één checkpoint (3 punten) meer waard is dan ~10 extra bollen. Dan
groeit hij alleen als het helpt. Zet in de app *Growth cost per sphere*
op 0 en kijk wat er gebeurt.

### Hoe belonen we vooruitgang over het parkour?

- **Dichte beloning**: elke meter telt. Zonder dit is er geen richting.
- **Mijlpalen (checkpoints)**: extra bonus na elk obstakel. Zo is
  "over de spleet komen" meer waard dan 1 meter verder schuifelen.
- **Tijdbonus**: pas belangrijk als hij al finisht.
- **Curriculum**: het parcours begint vlak zonder spleet (level 0%). Zodra
  de kampioen in ≥50% van zijn testruns over de spleet komt, wordt alles
  10% zwaarder (bredere spleet, hogere helling/horde/trede), tot 100%.

### Valkuilen (die we zelf tegenkwamen!)

Deze tabel is het eerlijke logboek van het bouwen. Elke regel was een
echt probleem, gemeten met `tools/train.js`.

| Valkuil | Wat er gebeurde | Oplossing |
|---|---|---|
| **Straf voor vallen** | Hij durft de spleet niet meer te proberen en blijft ervoor staan | Géén valstraf: vallen beëindigt de run al |
| **Physics-exploit** | Eerste versie: 2 bollen + 1 spier "skaten" in 11 s naar de finish, want wrijving greep ook zonder druk | Echte **Coulomb-wrijving** (grip ∝ normaalkracht) + tragere spieren |
| **Van de baan rollen** | Valt zijwaarts of achterwaarts van de baan | Lage randen + achtermuur |
| **Geluksvogels** | Kampioen met ±5 cm andere start: afstand tussen 2 en 16 m | Meerdere testruns, elke generatie nieuwe starts |
| **Groeien is eerst slecht** | Gemeten: nieuwe bol met willekeurige spier verlaagt fitness in 40/40 gevallen | **Neutrale groei** (sterkte-gen start op ≈ 0) + **soorten** die nieuwe vormen beschermen |
| **Chaos** | Een gewichtsmutatie van σ = 0.02 halveerde al de score | **Vloeiende sensoren** (afstand tot de grond i.p.v. contact aan/uit; deel van 3 kijkpunten boven een gat) → populatiegemiddelde ±2× hoger |
| **Browser ≠ Node** | `Math.sin`/`tanh` verschillen per JS-engine in de laatste bit → na 2 s een andere run | Eigen `sin`/`cos`/`tanh` met alleen + − × ÷ √ (`dmath.js`) → overal bit-identiek |
| **Spleet = muur** | 2 van de 3 seeds kwamen nooit over de spleet: iedereen loopt tot de rand en stopt | Langere groeistapjes (`growLenMax` 1.0 → 1.4 m), zodat lange "brug-lichamen" kunnen ontstaan, + curriculum |
| **Standaardstart uit het hoofd leren** | Zat de standaardstart in élke generatie in de test, dan scoorde "de beste" 25–34 maar haalde hij op de validatie maar 8–15 | Alleen willekeurige starts (`nominalTrial: 0`) → robuuste score op 30 nieuwe starts gemiddeld 14.5 i.p.v. 9.5 (2 testruns) |
| **Saaie wezens** | Met lage groeikosten wonnen vaak 2–3 bollen met 1–2 stokjes | `minNodes: 4` (schuifregelaar *Min spheres*). Grotere lichamen leren iets trager, maar wel |
| **Workers wachtten** | Browser-workers kregen maar 1 taak per beeldframe → 70% stilstand | De pool geeft meteen de volgende taak door zodra een worker klaar is |
| **Overfitting op de test** | Kampioen scoort 45 op zijn 8 vaste starts, maar ~25 op 30 nieuwe | Bekend effect (*winner's curse*). De getoonde score is optimistisch. Beter: grotere/wisselende validatieset |

> **Regel**: evolutie is een expert in het vinden van bugs. Gebeurt er
> iets raars? Kijk eerst naar de physics, niet naar de AI.

---

## 4. Architectuur van het prototype

```
 index.html
   │
   ├── lib/three.min.js, OrbitControls.js    (meegeleverd → werkt offline)
   │
   ├── src/core/          ← SIMULATIE (geen graphics, draait ook in Node.js)
   │     config.js        alle instellingen (ook de maten van het parcours)
   │     dmath.js         deterministische sin/cos/tanh (overal bit-gelijk)
   │     rng.js           random met seed (reproduceerbaar)
   │     physics.js       Verlet + PBD: bollen, stokjes, botsing, wrijving
   │     parkour.js       het Classic-parcours (dozen + gedraaide doos)
   │     tracks.js        parcoursen uit onderdelen, uitdagingen, sweepers
   │     genome.js        DNA: groeiprogramma + spier-breinen + mutaties
   │     episode.js       één leven: groeien → bewegen → fitness
   │     evolution.js     populatie, soorten, selectie, curriculum
   │
   ├── src/ui/            ← WEERGAVE
   │     render.js        Three.js-scène
   │     chart.js         fitnessgrafiek
   │     editor.js        bouw-modus (spiegel-modus, ongedaan maken)
   │     courses.js       parcours-editor, uitdagingen, ranglijst
   │     gallery.js       galerij · failchart.js: "waarom faalt hij?"
   │     sound.js, music.js  geluid en muziek (Web Audio)
   │     workers.js       training op alle CPU-kernen (Web Workers)
   │     main.js          knoppen, lus: trainen + replay
   │
   └── tools/
         train.js         headless trainen in de terminal (alle kernen)
         pool-node.js     worker_threads-versie van workers.js
         make-example.js  kampioen → champions/example.js
```

### Het genoom (DNA)

```js
{
  f: 1.4,                                    // ritme (Hz) van de interne klok
  nodes: [
    { p: -1, d: [0,0,0],      l: 0,   r: 0.30 },  // 0: hoofdbol
    { p:  0, d: [0.7,-0.7,0], l: 0.6, r: 0.12 },  // 1: groeit uit bol 0
    { p:  1, d: [1,0,0],      l: 0.5, r: 0.15 }   // 2: groeit uit bol 1
  ],
  sticks: [
    { a: 0, b: 1, m: true,  k: 1.0, w: [11 gewichten], u: [11] },  // spier: brein + zender
    { a: 1, b: 2, m: false, k: 1.0, w: [...] },           // bot
    { a: 0, b: 2, m: true,  k: 0.1, w: [...] }            // nieuwe, nog zwakke spier
  ]
}
```

### Groeien tijdens het leven

Elk leven begint als **één bol**. Elke 0,12 s "ontkiemt" de volgende bol
uit zijn ouder (op 30% afstand) en groeien de stokjes in 0,3 s naar hun
volle lengte. Daarna gaan de spieren aan.

### Het spier-brein (per stokje)

```
  sin(klok)   ─┐
  cos(klok)   ─┤
  grond bij A ─┤  "voelen": 1 = raakt de grond, 0 = ≥15 cm erboven
  grond bij B ─┤
  trede?      ─┼──▶ Σ wᵢ·xᵢ ──▶ tanh ──▶ traag volgen ──▶ lengte = rust × (1 ± 35%)
  gat?        ─┤                                          (= gewrichtslimiet)
  kanteling   ─┤  "ogen": kijkt 0.5, 1.0 en 1.5 m vooruit
  richting    ─┤  wijst het stokje vooruit?
  zijwaarts   ─┤  waar op de baan (links/rechts)? (gespiegeld stokje: omgekeerd)
  bias (1)    ─┤
  bericht     ─┘  gemiddelde van wat de buur-spieren vorige stap "zeiden"
            × sterkte-gen (0..1) bepaalt hoe hard het stokje trekt
            en de spier stuurt zelf ook een bericht: tanh(u · ingangen)
```

### Parallel rekenen (alle CPU-kernen)

```
 hoofd-thread: wachtrij met taken (DNA × start)    workers
 ┌───────────────────────────────┐   taak   ┌──────────┐
 │ eval: 60 DNA's × 3 starts     │ ───────▶ │ worker 1 │ ─┐
 │ validatie: 2 beste × 8 starts │ ───────▶ │ worker 2 │  │ samenvatting
 │ resultaat → vaste plek        │ ◀─────── │ worker … │ ◀┘
 └───────────────────────────────┘          └──────────┘
```

Elke core-file bewaart zijn eigen broncode (`GROW_MODULE` in `config.js`).
Daarvan wordt een *blob*-script gemaakt, zodat workers ook werken als je
`index.html` gewoon dubbelklikt. Omdat elk resultaat op een vaste plek
komt (DNA *i*, start *k*), is de uitkomst bit-voor-bit hetzelfde als op
één kern. Dat is getest.

### Bouw-modus

Je ontwerp (bollen met posities + stokjes) wordt met `Genome.fromDesign`
omgezet naar een groeiprogramma. Elke bol krijgt als "ouder" de bol die
via stokjes het dichtst bij de hoofdbol zit (breadth-first search). Dus
ook jouw wezen begint zijn leven als één bol en groeit uit. Met *lock
body* (standaard) evolueert alleen het brein: 60 kopieën van jouw lichaam
met elk een willekeurig brein.

### Physics in het kort (Position Based Dynamics)

```
elke stap (1/120 s):
  1. x_nieuw = x + (x − x_oud)·demping + g·dt²      (Verlet)
  2. 8×: stokjes naar hun lengte duwen               (constraints)
         bollen uit muren/grond duwen                (botsing)
  3. wrijving: zijwaartse beweging ≤ µ × normaal-correctie (Coulomb)
```

---

## 5. Wat de evolutie uitvindt

Wat we zagen tijdens het testen:

- **Generatie 0–5**: de meeste organismen trillen op hun plek of rollen achteruit.
- **"Tuimelaars"**: 3–6 bollen die over zichzelf heen klappen, met de
  zware hoofdbol als zwaaigewicht. Dit is verreweg de vaakst gevonden strategie.
- **Sprongen bij de spleet**: de *gat vooruit*-sensor krijgt een groot
  gewicht. Vlak voor het gat strekt een spier zich ineens volledig uit.
- **Lange lichamen** met `growLenMax` 1.4 m: ze leggen zich deels over de
  spleet heen als een brug.
- **Klein wint vaak**: met de standaard-groeikosten blijven lichamen klein
  (3–7 bollen). Zet *Growth cost per sphere* op 0 en kijk hoe grotere
  lichamen ontstaan. Ze zijn wel moeilijker aan te sturen.

### Verwachtingen (eerlijk)

Gemeten met de instellingen van versie 2 (`node tools/train.js`, populatie 60,
nog met `minNodes: 1` en de standaardstart in elke test).
*Robuust* = gemiddelde over 30 starts die de evolutie nooit gezien heeft:

| Run | Generaties | Kampioen (8 vaste starts) | Robuust (30 nieuwe starts) | Finish (robuust) | Lichaam |
|---|---|---|---|---|---|
| seed 4 | 400 | 58.8 | 38.6 | 37% | 3 bollen, 3 stokjes |
| seed 1 | 400 | 53.5 | 30.5 | 17% | 8 bollen, 20 stokjes |
| seed 3 | 250 | 20.4 | 19.1 | 0% (tot de horde) | 6 bollen, 6 stokjes |
| seed 5 | 400 | 20.3 | 10.5 | 0% (tot de spleet) | 3 bollen, 3 stokjes |
| seed 2 | 250 | 15.1 | 12.5 | 0% (tot de helling) | 7 bollen, 7 stokjes |

De eerste twee zitten als **★ Example champion** in de app (klik nog eens
voor het volgende voorbeeld). In de terminal kost één generatie ongeveer
1 seconde (gemeten op een cloud-server); in de browser is het iets trager
omdat hij ook tekent.

Evolutie is een **zoekproces met toeval**. Sommige runs (seeds) vinden
snel een goede strategie, andere blijven lang hangen. Blijft hij na ~150
generaties steken? Druk op **Reset** voor een nieuwe willekeurige
populatie, of train langer in de terminal.

---

## 6. Versie 3: wat erbij kwam, en wat het opleverde

Alle "volgende stappen" uit versie 2 zijn gebouwd. Hieronder per onderdeel
wat het doet en, waar we het gemeten hebben, wat het opleverde. Eerlijk: niet
alles is even hard bewezen.

| Onderdeel | Hoe het werkt | Gemeten effect |
|---|---|---|
| **Spiegel-gen** | Een groei-stap maakt (70% kans) ook het spiegelbeeld. Spiegel-stokjes **delen hun brein** (`mirOf`), eventueel in tegenfase (`anti`). Koppelingen via vaste `uid`'s, zodat snoeien niets breekt | 2 seeds × 200 generaties, robuuste score op 30 nieuwe starts: **12.2 / 18.4 met** tegen **9.5 / 13.3 zonder**. Maar de winnende wezens waren zelf níet gespiegeld, dus dit verschil is **waarschijnlijk toeval** (te weinig runs). In de bouw-modus helpt spiegelen wél zeker: half zoveel gewichten om te leren |
| **Berichten tussen spieren** | Elke spier stuurt een getal (`tanh(u·ingangen)`) naar de spieren die een bol met hem delen; het gemiddelde komt binnen als 11e ingang. Een mini *Graph Neural Network* | Niet apart gemeten. Wel getest dat het gedrag verandert als de zendergewichten ≠ 0, en dat oude wezens (zender = 0) bit-identiek blijven |
| **Wisselende validatie** | Elke 10 generaties 10 nieuwe test-starts; de kampioen wordt opnieuw gemeten | Tegen de *winner's curse* (zie hoofdstuk 3). De getoonde score kan nu ook dálen: dat is eerlijk |
| **Novelty search** | Na 10 generaties zonder betere kampioen telt ook "nieuw gedrag" mee (verste punt, eindpunt, links/rechts, hoogte), tot 60% | Niet apart gemeten |
| **Parcoursen uit onderdelen** | 8 soorten onderdelen, waaronder bewegende **sweepers** (positie = functie van de wereld-tijd, dus deterministisch). 6 uitdagingen + eigen banen + lokale ranglijst | Getest: alle uitdagingen bouwen en zijn speelbaar op level 0 / 0.5 / 1; parallel = serieel, ook mét sweepers |
| **Ghost race** | De 12 beste van de vorige generatie lopen doorzichtig mee, elk in een eigen baan | – |
| **Galerij, ongedaan maken, faal-grafiek** | localStorage, snapshots van het ontwerp, testruns per kampioen (`stats.runs`) | – |
| **Python / MuJoCo** | genoom → MJCF, Gymnasium-omgeving, ES (OpenAI-ES + Adam) en PPO (Stable-Baselines3) | Zie hieronder |

### De Python-versie in cijfers

Voorbeeld-wezen 1 (8 bollen, 9 spieren) op het Classic-parcours in MuJoCo,
gemiddeld over 10 willekeurige starts:

| Brein | Training | Afstand |
|---|---|---|
| Geen (spieren in rust) | – | 3.7 m (valt alleen om) |
| Browser-brein, overgezet | – | **1.2 m** |
| Evolution Strategies | 50 generaties (~4 min, 4 kernen) | **10.0 m** |
| PPO | 200.000 stappen (~3 min) | 7.0 m |

Het belangrijkste inzicht: **een brein dat in de ene simulator perfect werkt,
faalt in een andere.** In de robotica heet dit de *sim-to-real gap*. Robots die
in simulatie leren, worden daarom getraind met veel variatie (domain
randomization, zoals wij doen) en daarna bijgetraind op de echte robot.

Twee lessen uit het bouwen van de Python-versie:
- De eerste ES-versie leerde vooral **stilstaan**: de energiekost (≈ 27) was
  groter dan de beloning voor afstand (≈ 8). Na het 10× verlagen ervan leerde hij wel.
- Het opgeslagen "beste" ES-brein haalde eerst maar 2.5 m: hij had geluk gehad
  op zijn 2 test-starts. Nu slaan we het **gemiddelde** brein op (dat is wat ES
  echt leert). Dat is dezelfde les als in de browser: wantrouw geluksvogels.

### Automatische tests

`npm test` (12 tests) en `python/test_growbot.py` (3 tests). De belangrijkste:
- **golden traces**: van elke stap van de voorbeeld-kampioenen wordt een
  vingerafdruk (hash) vergeleken met een opgeslagen versie. Zo weten we dat
  symmetrie, berichten en bewegende obstakels oude wezens niet veranderd hebben;
- **parallel = serieel**: 14 generaties op 1 kern en op 3 workers geven exact
  dezelfde geschiedenis en kampioen;
- **fuzz**: 3000 willekeurige mutaties, en elk genoom moet geldig blijven (de
  spiegel-test vond zo een echte fout: spiegelen rond de verkeerde as).

---

## 7. Volgende stappen

1. **Meer runs per experiment.** De symmetrie-meting gebruikte 2 seeds, en dat
   is te weinig. Met 10+ seeds per instelling weet je pas echt wat helpt.
2. **Lichaam én brein in Python**: evolutie kiest het lichaam, PPO leert per
   lichaam het brein (de "hybride" uit hoofdstuk 1).
3. **Alle parcoursen in Python** (nu alleen Classic).
4. **Online ranglijst** om wezens te delen met vrienden (heeft een server nodig).
5. **Groeifase in MuJoCo** (nu start het wezen daar volgroeid).
