# GrowBot — Ontwerpdocument

> Een centrale bol die zelf botten, spieren en extra bollen laat groeien
> en met AI leert een parkour te overwinnen.

Inhoud:

1. [AI-architectuur: evolutie of reinforcement learning?](#1-ai-architectuur)
2. [Tech stack: browser of Python?](#2-tech-stack)
3. [Beloningsfunctie & groeikosten](#3-beloningsfunctie--groeikosten)
4. [Hoe het prototype in elkaar zit](#4-architectuur-van-het-prototype)
5. [Wat de evolutie (tot nu toe) uitvindt](#5-wat-de-evolutie-uitvindt)
6. [Volgende stappen](#6-volgende-stappen)

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
          + 20  × finish             (× deel van de trials dat finisht)
          + 1   × seconden over      (sneller = beter)
          − 0.15 × extra bollen      ┐
          − 0.05 × stokjes           ├ groeikosten
          − 0.004 × spier-energie    ┘ (∑ |activatie| · dt)
```

Elk organisme wordt **2× getest** met een iets andere startpositie en
startritme. De score is het gemiddelde (*domain randomization*).

### Hoe voorkomen we dat hij "explodeert" (oneindig groeit)?

Er zijn **vijf lagen** verdediging:

```
 1. HARDE LIMIETEN     max 14 bollen, 34 stokjes, stokje 0.25–1.5 m
        │              → kan simpelweg niet verder groeien
 2. GROEIKOSTEN        elke bol/stokje kost punten
        │              → groeien moet zichzelf terugverdienen
 3. ENERGIEKOSTEN      meer spieren = meer energie = minder punten
        │
 4. SNOEI-MUTATIES     naast "groei" bestaan ook "verwijder bol/stokje"
        │              → evolutie kan ook kleiner worden
 5. STABIELE PHYSICS   snelheidslimiet, zachte spieren, groei-animatie
                       (nieuwe bol start op 30% en groeit uit)
                       → geen numerieke explosies
```

*Parsimony pressure* (laag 2) is het belangrijkst. Stel de kosten zo
af dat één checkpoint (3 punten) meer waard is dan ~10 extra bollen. Dan
groeit hij alleen als het helpt.

### Hoe belonen we vooruitgang over het parkour?

- **Dichte beloning**: elke meter telt. Zonder dit is er geen richting.
- **Mijlpalen (checkpoints)**: extra bonus na elk obstakel. Zo is
  "over de spleet komen" meer waard dan 1 meter verder schuifelen.
- **Tijdbonus**: pas belangrijk als hij al finisht.

### Valkuilen (die we zelf tegenkwamen!)

| Valkuil | Wat er gebeurt | Oplossing |
|---|---|---|
| **Straf voor vallen** | Hij durft de spleet niet meer te proberen en blijft ervoor staan | Géén valstraf: vallen beëindigt de run al |
| **Physics-exploit** | Eerste versie: 2 bollen + 1 spier "skaten" naar de finish, want wrijving greep ook zonder druk | Echte **Coulomb-wrijving** (grip ∝ normaalkracht) + tragere spieren |
| **Fragiele kampioenen** | Werkt alleen vanaf exact één startpositie; alle kinderen falen | Meerdere trials met kleine variaties |
| **Van de baan rollen** | Valt zijwaarts eraf | Lage randen langs de baan |
| **Groeien is eerst slecht** | Nieuwe bol = brein moet opnieuw leren → wordt meteen weggeselecteerd | **Soorten** (op aantal bollen) beschermen nieuwe vormen |

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
   │     config.js        alle instellingen
   │     rng.js           random met seed (reproduceerbaar)
   │     physics.js       Verlet + PBD: bollen, stokjes, botsing, wrijving
   │     parkour.js       de baan (dozen + gedraaide doos voor de helling)
   │     genome.js        DNA: groeiprogramma + spier-breinen + mutaties
   │     episode.js       één leven: groeien → bewegen → fitness
   │     evolution.js     populatie, soorten, selectie, elitisme
   │
   ├── src/ui/            ← WEERGAVE
   │     render.js        Three.js-scène
   │     chart.js         fitnessgrafiek
   │     main.js          knoppen, lus: trainen + replay
   │
   └── tools/
         train.js         headless trainen in de terminal (veel sneller)
         make-example.js  kampioen → champions/example.js
```

### Het genoom (DNA)

```js
{
  f: 1.4,                                   // ritme (Hz) van de interne klok
  nodes: [
    { p: -1, d: [0,0,0],     l: 0,   r: 0.30 },  // 0: hoofdbol
    { p:  0, d: [0.7,-0.7,0], l: 0.6, r: 0.12 },  // 1: groeit uit bol 0
    { p:  1, d: [1,0,0],      l: 0.5, r: 0.15 }   // 2: groeit uit bol 1
  ],
  sticks: [
    { a: 0, b: 1, m: true,  w: [8 gewichten] },  // spier met eigen brein
    { a: 1, b: 2, m: false, w: [...] },          // bot
    { a: 0, b: 2, m: true,  w: [...] }           // spier (maakt een driehoek)
  ]
}
```

### Groeien tijdens het leven

Elk leven begint als **één bol**. Elke 0,12 s "ontkiemt" de volgende bol
uit zijn ouder (op 30% afstand) en groeien de stokjes in 0,3 s naar hun
volle lengte. Daarna gaan de spieren aan.

### Het spier-brein (per stokje)

```
  sin(klok) ─┐
  cos(klok) ─┤
  contact A ─┤
  contact B ─┼──▶ Σ wᵢ·xᵢ ──▶ tanh ──▶ traag volgen ──▶ lengte = rust × (1 ± 35%)
  trede?    ─┤                                          (= gewrichtslimiet)
  gat?      ─┤        "ogen": kijkt 1 m vooruit naar de grond
  kanteling ─┤
  bias (1)  ─┘
```

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

- **Generatie 0–5**: meeste organismen trillen op hun plek of rollen achteruit.
- **"Rupsen"**: 2–4 bollen die trekken en strekken, met de grote hoofdbol
  als anker.
- **Sprongen bij de spleet**: de *gat vooruit*-sensor krijgt een groot
  gewicht. Vlak voor het gat strekt de spier zich ineens volledig uit.
- **Klein wint vaak**: met de standaard-groeikosten blijven lichamen klein
  (3–6 bollen). Zet *Growth cost per sphere* op 0 en kijk hoe grotere
  lichamen ontstaan. Ze zijn wel moeilijker aan te sturen.

---

## 6. Volgende stappen

Gerangschikt van makkelijk naar moeilijk:

1. **Experimenteer met `config.js`**: spleet breder, trede hoger, meer
   bollen toestaan. Wat verandert er aan de lichamen?
2. **Curriculum learning**: begin met alleen het vlakke stuk en voeg
   obstakels pas toe als 50% van de populatie het vorige haalt.
3. **Symmetrie-mutatie**: "groei een bol + zijn spiegelbeeld". Dit levert
   veel sneller stabiele lopers op (Karl Sims deed dit).
4. **Berichten tussen buren** in het spier-brein. Dan wordt het een echte
   GNN die coördinatie kan leren.
5. **Web Workers** voor parallelle evaluatie. Let op: dan heb je een
   lokale webserver nodig (`npx serve`), want `file://` blokkeert workers.
6. **Python-versie**: genoom → MJCF → MuJoCo, met PPO + GNN als binnenste lus.
