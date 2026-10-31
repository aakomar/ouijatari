# Phase 2: build the reading

**Goal:** replace the colour picker with real data.
Each open day's measurements become a reading, the engine decides from it exactly as it decides from a colour today, and the page shows the result.
**You end with:** the whole exhibition grown from real (historical) data, reproducibly, with the colour picker kept as a manual override.

This phase needs the choices from [phase 1](1-choose-inputs.md) and its saved samples in `fixtures/`.

## Opening prompt for your assistant

> Read AGENTS.md, docs/HANDOFF.md, docs/ARCHITECTURE.md (especially "Input seam: the reading"), docs/inputs.md, docs/next/2-build-the-reading.md, spec.md, and engine.js.
> We are in phase 2: building the reading from real data.
> Start by showing me, in plain language, how today's colour becomes a reading and which parts of the reading the growth rules actually use.
> Then propose a plan for the first step only, and wait for my go-ahead.

## Where the colour picker sits today

In the page (`index.html`) the "Source reading" panel holds a colour field, a hue slider and a hex box.
Whatever colour it holds becomes the reading for the day in view.
In the engine (`engine.js`), `read(hex)` turns that colour into a reading, and `decide` calls `read` for each day.

The engine only uses eight fields of the reading: the family (`sector.fam`), four targets for the plate's shape, the growth `energy`, the direction (`params.bias`) and the preferred `rotation`.
`docs/ARCHITECTURE.md` lists them with their ranges.
Everything in this phase is about producing those eight numbers, honestly and reproducibly, from real measurements.

## The steps

Do them in order.
Each one ends with the tests passing and something you can look at.

### 1. Define the daily package

A **daily package** is everything measured for one decision, gathered into one JSON file.
It is the raw input, kept exactly as collected, so every decision can be traced back to it.

It should hold:

- the open-day number, and the time window it covers;
- for each source, the measurements in that window, with units, and where and when they were fetched;
- any gaps: a source that was down, a sensor that stopped.

**The window is the time since the previous instruction.**
When the museum has been closed for several days, one package covers all of them.
The brief requires that this longer window not automatically produce a more extreme action, so the next step works with rates and averages, never totals.

Ask your assistant to write the format down in `docs/inputs.md`, and to build a few example packages in `fixtures/` from the phase 1 samples: an ordinary day, a stormy day, a quiet day, a closed-weekend window, and a day with a missing source.

### 2. Summarise each package into measurements

A pure function turns a package into a small set of numbers, such as mean geomagnetic activity, its variability, the average magnetic direction, visitors per open hour, lightning strikes per hour.
Pure means: package in, numbers out, nothing fetched, nothing stored, no clock.

Tests check it on the fixture packages by plain equality.

### 3. Calibrate

Each measurement must become a number from 0 to 1, the scale the rules use.
That needs to know what "low" and "high" mean for that measurement.

Do it from history, fixed in advance:

- Collect a few months of past data for each source (phase 1 asked for this to be possible).
- From it, compute a fixed calibration: for example, the value at each percentile.
- Store the calibration in a file beside `engine.js` and **never change it once the exhibition opens.**
  If it changed, replaying the archive would grow a different wall.

A value is then placed on 0 to 1 by where it falls in that history.
Values beyond the historical range are clamped to 0 or 1.

The visitor counter has no history before it is installed; use the artist's and the site's best estimate of a busy and a quiet day, and record that it is an estimate.

### 4. Map measurements to the reading: the artist's decision

This is the heart of the phase, and it is artistic, not technical.
Your assistant should present the choices clearly and let the artist decide.

| Reading field | The question for the artist | Today's stand-in |
|---|---|---|
| Family (A, T, C, G) | Which measurement, or combination, chooses the family? It needs four roughly equally likely outcomes, or one family runs out early. | The colour's hue, in four quarters. |
| `energy` | What makes a day high-energy (reach further, denser relationships) or a day of "almost no growth"? The brief suggests electromagnetic activity combined with occupancy. | Saturation times brightness. |
| Target area | What asks for a large plate rather than a small one? | Same as energy. |
| Target branches | What asks for a many-branched plate? | Position within the hue quarter. |
| Target elongation | What asks for a long, thin plate? | Red minus blue. |
| Target density | What asks for a solid plate rather than an open one? | Green. |
| `params.bias` (direction) | Which way does growth lean? The brief calls this the directional magnetic bias. | The hue angle. |
| `rotation` | What sets the plate's angle? It must be able to take every 15° step. | Position within the hue quarter. |

Two practical constraints, which the assistant should check by running whole exhibitions:

- **Families must stay balanced.** Each family has 75 plates and the exhibition uses 157, so if one family is chosen far more often than the others it runs out and the next family stands in.
  That is allowed, but the artist should know how often it happens.
- **Readings must vary.** The engine is tested on varied readings.
  Long runs of near-identical days can force the rules to give way (the decision is marked as blocked).
  `README.md` explains when that happens.

Put the mapping in one small pure function in its own file (for example `reading.js`, loaded by `index.html` with `<script src="reading.js"></script>` and by the tests the way they load `engine.js`).
Keep its weights in a table at the top, the way `DIMS` and the `W_` constants sit at the top of `engine.js`, so the artist can ask for adjustments without anyone hunting through the code.

The reading must also carry a display colour (`hex`), since the page draws each day's plate in its reading's colour.
Ask the artist what that colour should express.

### 5. Teach the engine to take a reading

Today `decide` in `engine.js` takes a colour and calls `read` itself.
Change it so it accepts either a colour, as now, or a ready-made reading.
The colour path must keep working: the page's picker becomes the manual override the brief asks for, and every existing test must still pass.

This is the only change to the growth rules in this phase, and it should not change a single decision made from a colour.
Add a test that proves it: the same colours give exactly the same wall before and after.

### 6. Show real data in the page

Let the page grow the exhibition from a list of real readings (built from the packages) instead of random colours, while still letting someone override any day with the picker.
Update the decision trace and the archive record so they describe the real measurements, in honest words, instead of "hex decodes to".

### 7. Run whole exhibitions

Using the historical data, build 157-day sequences from several different stretches of the past (a stormy season, a quiet one) and grow each.
For each, your assistant should report in plain language:

- how often each family was chosen, and whether any ran out;
- how often a day was blocked;
- whether the composition reached all three walls;
- how the phases' relationships showed up.

Show the artist the walls these grow, in the page, and adjust the mapping until the growth feels right.
Add the best of these sequences to the tests, so future changes cannot silently alter them.

## Done means

- [ ] The daily package format is written down, with example packages in `fixtures/`.
- [ ] Summarising, calibrating and mapping are pure functions with tests.
- [ ] The calibration is fixed in a file and documented as frozen for the exhibition.
- [ ] The artist has chosen what every reading field means, and `docs/inputs.md` records it.
- [ ] The engine accepts a reading object, and colours still grow exactly the same wall.
- [ ] The page grows from real readings, and the picker still overrides a day.
- [ ] Several historical 157-day runs grow without errors, and the artist has seen them.
- [ ] `node tools/test.mjs` passes, and nothing private is committed.
