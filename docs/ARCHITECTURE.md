# Architecture

How the software is put together, where its boundaries are, and the exact shape of the data that crosses each boundary.
`README.md` explains the growth rules themselves; this file explains how the pieces connect and where new work plugs in.

## The pipeline

The brief describes the whole system as four stages:

```
Satellite (remote site)  →  Interface (code)  →  Receiver (museum)  →  Network (Growth Field)
   sensors, public data      this repository      the daily message      the plates on the wall
```

Inside the Interface, one open day flows through these steps:

```
 daily data          reading            decision              instruction, record, diagram
 ───────────►  read  ────────►  decide  ────────►  compose  ──────────────────────────────►  send, store, back up
 (INPUT SEAM)        (engine.js, pure)            (OUTPUT SEAM)                          (shell, not built yet)
```

- **Daily data** is everything measured for one open day.
  Today it is a single hex colour chosen in the page.
- **Reading** is that data normalised into the numbers the rules use.
- **Decision** is the engine's answer: which plate, where, at what angle, making what relationship, and why.
- **Instruction, record, diagram** are the decision rendered for people: the technician's message, the archive entry, the picture.
- **Send, store, back up** deliver and keep them.

Everything from reading to decision is finished and tested.
The input seam currently runs on a stand-in, and the output seam stops at the screen.
The next phases (in `docs/next/`) fill in both ends.

## Files

| File | Role | Core or shell |
|---|---|---|
| `src/engine.js` | Every growth rule: reading → family → plate → position → orientation → relationship. | Core. Pure. |
| `src/data.js` | Generated plate catalog (300 plates) and wall model (3 walls, nail lattice). | Data. |
| `src/index.html` | The bench page: colour picker, day slider, wall drawing, message, archive record. | Shell, but it also composes the message and record (see "Known debts"). |
| `tools/plates.mjs`, `tools/wall.mjs` | Turn the artist's vector files and the gallery model into catalog entries and the wall. | Core. Pure. |
| `tools/build-data.mjs` | Runs those over `space_and_plates/` and writes `src/data.js`. | Shell. |
| `tools/encrypt.mjs`, `tools/decrypt.mjs`, `tools/lib.mjs`, `tools/bundle.mjs`, `tools/gate.html` | Encrypt `src/` into the published `index.html`, and back. | Shell around a small pure crypto core. |
| `tools/test.mjs` | Every test. Engine tests run only when `src/` is present. | Tests. |

`src/` is private and gitignored; see `AGENTS.md`, rule 3.

## The engine's public interface

`src/engine.js` puts one object on the page (`window.Ouijatari`), or on `globalThis` under Node:

```js
const O = Ouijatari;
const E = O.createEngine(OUIJATARI_DATA);   // plates + wall, from data.js
const decisions = E.grow(readings, kept);   // the whole exhibition up to readings.length
```

- `readings` is a list with one entry per open day, in order.
  Today each entry is a hex colour string such as `"#B4642A"`.
- `kept` (optional) is a list of decisions already made for the first days.
  They are reinstalled exactly rather than decided again.
  This is how confirmed installations stay fixed while later days are recomputed.
- The result is a list of decisions, one per reading.
  Decision *n* depends only on readings 1 to *n*.

Other exports: `DAYS` (157), `SECTORS`, `PHASES`, `DIMS`, `read`, `seedReadings`, `phaseOf`, `permittedKinds`, `openDayDate`, and colour helpers.

## Input seam: the reading

This is the place the colour picker occupies today, and the place real data will plug in.

`read(hex)` in `src/engine.js` turns one day's input into a reading.
The engine depends on only these fields of it:

| Field | Range | What the rules do with it |
|---|---|---|
| `sector.fam` | `A`, `C`, `T` or `G` | Chooses the plate family. If that family is used up, the next sector round the wheel stands in. |
| `target.area` | 0 to 1 | Desired plate size, as a rank within the archive (0 smallest, 1 largest). |
| `target.branches` | 0 to 1 | Desired branch count, as a rank. |
| `target.elongation` | 0 to 1 | Desired elongation, as a rank. |
| `target.density` | 0 to 1 | Desired silhouette density, as a rank. |
| `energy` | 0 to 1 | Growth energy: how far from the centre to reach and how dense a relationship to make. Low energy is a day of "almost no growth". |
| `params.bias` | 0 to 360 | Direction growth leans toward, in degrees clockwise from up. Meant to be the directional magnetic bias. |
| `rotation` | 0 to 345, a multiple of 15 | Preferred orientation of the plate, degrees clockwise. |

The page also shows these fields, so a reading built from real data should keep them:

| Field | Shown as |
|---|---|
| `hex` | The colour the day's plate is drawn in. A real-data reading still needs a display colour; derive one from the measurements. |
| `params.amplitude`, `params.variability`, `params.frequency`, `params.occupancy`, `params.vibration` | The processed parameters in the decision trace and the archive record. |
| `h`, `s`, `v`, `r`, `g`, `b`, `sector.name` | Picker and trace details. These belong to the colour stand-in and can be dropped or replaced once the page shows real data. |

Today these all come from the colour: hue picks the family, saturation is amplitude, brightness is occupancy, and so on (see `read` in `src/engine.js`).
That mapping is a stand-in with no artistic meaning.
Phase 2 replaces it with a mapping from real measurements, and the artist decides what that mapping should mean.

The planned change to the engine is small: let `grow` and `decide` accept a ready-made reading object as well as a hex string.
Keep the picker working as a manual override and a test tool; the brief asks for a manual override, and it is the easiest way to explore the rules.

## Output seam: the decision

Each decision returned by `grow` has these fields:

| Field | Meaning |
|---|---|
| `day` | Open-day number, 1 to 157. |
| `date` | Calendar date of that open day (a `Date`). |
| `reading` | The reading it was decided from. |
| `phase` | The developmental phase, with its number, day range and label. |
| `family`, `familyRequested` | Family used, and the one the reading asked for (they differ when a family is used up). |
| `plate` | The chosen catalog entry. |
| `score`, `scored` | Its matching score out of 100, and every candidate in the family with its score, best first. |
| `x`, `y` | Where the plate's own origin goes on the unfolded wall, in inches. |
| `rotation` | Orientation in degrees clockwise from the plate's designated top. |
| `nail` | Index into `E.nails` of the nail it hangs on, or `null` if its joints carry it. |
| `joins` | Each connection point that meets the composition, with the plates and points it meets. |
| `touching`, `parent` | Installed decisions it touches, earliest first; the first is the parent. |
| `kind`, `relation` | The relationship kind (for example `three-way junction`) and a sentence describing it. |
| `touch` | Set when the plate touches a corner line and opens the next wall. |
| `options` | How many permitted joins were considered. |
| `blocked` | True if the rules had to give way to place the plate. |

The page turns a decision into three things a person reads:

- **The technician's message**: `messageLines` and `plainMessage` in `src/index.html`.
  It matches the sample in the brief: day, plate, mounting point, parent, attachment point, relationship, orientation, diagram reference.
- **The archive record**: `renderRecord` in `src/index.html`.
  A JSON object with the raw data, processed parameters, candidates and scores, selection reason, the state of the wall before the day, position, joins, orientation and an `installation_confirmed` flag.
  Its fields follow the brief's list of what the daily archive must record.
- **The diagram**: the Growth Field drawing and the plate figure, drawn as SVG in the page.

## Known debts

These are places where the code does not yet follow its own design.
Each is called out in the phase guide that should fix it.

- **The message and the record are composed in the page.**
  They are pure functions of a decision, but they live in `src/index.html` beside the rendering code, so nothing outside a browser can produce them.
  Phase 3 moves them, and the diagram drawing, into a pure module that both the page and a daily job can use.
- **The reading is welded to a colour.**
  `decide` calls `read(hex)` itself.
  Phase 2 lets it take a reading built from real data.
- **There is no persistent state.**
  The page recomputes everything from its readings each time it loads and stores nothing.
  Phase 3 adds the daily log, installation confirmations and backups.
- **The plaintext code cannot live in this repository.**
  A daily job that runs the engine needs `src/engine.js` and `src/data.js` unencrypted.
  Phase 3 discusses where that job and its data should live.

## Assumptions baked into the data

Listed in full in `README.md`; repeated here because each is a question for the artist.

- **Connection points** are guessed from the outlines as the ends of each plate's branches (`tools/plates.mjs`).
- **Mounting**: a plate hangs on one nail under its metal, or one its edge rests against within an inch (`src/engine.js`).
- **Designated top** is the upward direction of each artboard.
- **Plate IDs** are the source file names, which are irregular (`A_`, `A_01`, `C_0` sit beside `A_8_12`).
- **Oxidation, colour and brightness** are missing from the catalog; they need photographs of the finished plates.
