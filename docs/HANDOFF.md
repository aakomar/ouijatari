# Handoff: start here

This guide is for the person taking over the Ouijatari software.
You do not need to be a programmer.
You will work through an AI assistant (Claude or ChatGPT), and this repository is set up so that the assistant can pick up where the last developer left off.

## What the software does

Every open day of the exhibition, the software reads that day's environmental data and decides which metal plate the museum technician hangs on the wall next, where it attaches, and at what angle.
Over 157 open days the plates grow into one composition across three gallery walls.

It does this in steps:

1. **Read** the day's data and turn it into a handful of numbers.
2. **Choose a family** (A, T, C or G) from those numbers.
3. **Choose a plate** in that family whose shape best matches the day's numbers, never reusing one.
4. **Place it**: find where it can join the plates already on the wall, following the rules of the current phase of the exhibition.
5. **Tell the technician**, and keep a record of the decision.

## Where things stand

**Done and tested:**

- The catalog of all 300 plates, measured from the artist's vector files: size, area, branches, elongation, density, and the points where each plate can meet another.
- The model of the gallery walls and the nail grid, from the SketchUp model.
- Every growth rule: families, plate matching, the four phases, joining plates at their branch ends, spreading across all three walls, crossing corners, and what to do when the rules leave nowhere to go.
- A web page (the "bench") that runs the whole exhibition, lets you scrub through all 157 days, draws the wall, and shows the technician's message and the archive record for any day.
- 26 automated tests, all passing.

**Stand-ins, waiting for the next phases:**

- **The data is a colour.**
  In the page, a colour picker stands in for each day's sensor data.
  Hue picks the family, saturation stands for signal strength, brightness for visitor numbers, and so on.
  This is the part the next phases replace.
- **The message only appears on screen.**
  Nothing is sent, nothing is saved, and the technician cannot yet confirm an installation.

**Open questions for the artist** (the software works either way, but these assumptions should be confirmed):

- Where can plates really connect? The software guesses: at the tips of their branches.
- Which way is up on each plate? The software assumes the top of each artwork file.
- What are the permanent plate IDs? Today they are the file names, which are irregular (`A_`, `A_01` and `A_8_12` sit side by side).
- Oxidation, colour and brightness of each plate are not in the catalog yet; they need photographs of the finished plates.

## What you will receive separately

These are private and are never put in this repository, because the repository is public.

| Item | What it is | Needed for |
|---|---|---|
| The passphrase | Unlocks the code and the published page. Keep it in a password manager; if it is lost, the code cannot be recovered. | Everything. |
| `spec.md` | The artist's full brief: the whole system, the timeline, the people involved. | Understanding what to build. Give it to your assistant. |
| `space_and_plates/` | The artist's original vector files and the gallery model (several hundred megabytes). | Only for rebuilding the plate catalog if the artwork changes. |
| Access to the GitHub repository | Permission to push changes. | Publishing. |

## One-time setup

Ask your assistant to walk you through these steps if any of them are unfamiliar.

1. Install **Node.js** (version 18 or later) from nodejs.org, and **git**.
2. Install an assistant that can work directly in a folder on your computer.
   Claude Code (in the Claude desktop app) or OpenAI's Codex both read the instructions in this repository automatically.
   A plain chat window works too, but you will have to upload files by hand and copy its changes back.
3. Download the repository:
   ```sh
   git clone https://github.com/grandballoon/ouijatari.git
   cd ouijatari
   ```
4. Unlock the code (it asks for the passphrase and shows nothing as you type):
   ```sh
   node tools/decrypt.mjs
   ```
5. Put `spec.md` in the `ouijatari` folder.
6. Open the page: double-click `src/index.html`, or run `open src/index.html` on a Mac.
7. Check everything works:
   ```sh
   node tools/test.mjs
   ```
   It should end with `26/26 passed` (or more, as tests are added).

## Working with your assistant

Start every session the same way:

> Read AGENTS.md, docs/HANDOFF.md and docs/ARCHITECTURE.md. Then tell me in plain language where the project stands and what you suggest we do next.

Then:

- **Ask it to explain before it changes anything.** It is instructed to, but ask anyway if it does not.
- **Take one step at a time.** Each step should end in something you can check: the page opens, the tests pass, a sample message looks right.
- **Look at the result yourself.** Open the page and check it makes sense to you. You know what the exhibition should look like; the assistant does not.
- **Let it run the tests.** If any test fails, the step is not finished.
- **Save often.** Ask it to commit when a step works. A commit is a saved checkpoint you can return to.
- **Publishing is a separate, deliberate step.** Pushing to GitHub updates the public page. The assistant will ask before it pushes.
- **After changing the page,** you run `node tools/encrypt.mjs` yourself before committing, because it needs the passphrase.

If you use a plain chat window instead, upload `AGENTS.md`, this file, `docs/ARCHITECTURE.md`, the guide for your current phase, `spec.md`, and whichever of `src/engine.js` or `src/index.html` you are changing.

### Three things never to do

1. Never paste the passphrase, an API key or a password into a file in this folder, or into a public place.
2. Never commit `src/`, `spec.md` or `space_and_plates/`. The repository is set up to prevent this; do not override it.
3. Never edit `src/data.js` or the top-level `index.html` by hand. They are generated.

## The road ahead

Three phases, each with its own guide for you and your assistant:

1. **[Choose the inputs](next/1-choose-inputs.md).**
   Pick which public data sources (space weather, geomagnetic, lightning, and so on) and which on-site sensor (a visitor counter, possibly more) will feed the system.
   This is mostly research and decision-making, with small test scripts to see real data.
2. **[Build the reading](next/2-build-the-reading.md).**
   Replace the colour picker with that data: collect each day's measurements, turn them into the numbers the rules use, and decide with the artist what each measurement should mean for the growth.
3. **[Deliver and archive](next/3-deliver-and-archive.md).**
   Turn each decision into the technician's daily message (email, WhatsApp, text, a web page, or several), log every decision, receive installation confirmations, and back everything up.

Each guide starts with a suggested opening prompt for your assistant and ends with a checklist of what "done" means.

### Decisions that are yours, not the assistant's

The assistant should ask you rather than decide these:

- Which data sources and sensors to use, once it has laid out the options.
- What each measurement should mean for the growth: which data picks the family, what makes a day "high energy", what sets the direction.
- How the message to the technician should read, and how it reaches them.
- Anything that changes how the composition looks on the wall.
- Anything that costs money or creates an account with an outside service.

Technical choices with a sensible default (file formats, code structure, test design) the assistant should make, explain, and move on.

## Words you will meet

| Word | Meaning |
|---|---|
| **Reading** | One day's data, turned into the numbers the rules use. Today it comes from a colour. |
| **Decision** | The software's answer for one day: plate, position, angle, relationship, and the reasons. |
| **Engine** | `src/engine.js`, the file that holds every growth rule. |
| **Catalog** | The measured list of all 300 plates, in `src/data.js`. |
| **Growth Field** | The composition on the wall. |
| **Connection point** | A place on a plate where it can meet another plate: the tip of a branch. |
| **Phase** | One of the four stretches of the exhibition; each unlocks new kinds of relationship between plates. |
| **Deterministic** | The same data always produces the same decisions. Essential, so every decision can be replayed and explained. |
| **Test** | A small automatic check that the software still does what it should. `node tools/test.mjs` runs them all. |
| **Commit** | A saved checkpoint of the files. |
| **Push** | Sending your commits to GitHub, which publishes them. |
| **API** | A way for one program to ask another for data over the internet, such as a space-weather service. |
| **API key** | A password-like code some APIs require. Treat it like a password. |
