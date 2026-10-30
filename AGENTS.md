# Instructions for AI coding agents

This file is for any AI agent working in this repository: Claude Code, ChatGPT/Codex, or another.
Read it in full before doing anything, then read `docs/HANDOFF.md` and `docs/ARCHITECTURE.md`.

## Who you are working with

The person directing you is not a programmer.
They took this project over from its original developer and continue it through you.
They know the artwork and the exhibition far better than the code.

- Explain what you are about to do in plain language before you do it, and what you did afterwards.
- Avoid jargon; when a technical word is unavoidable, define it in one sentence.
- Work in small steps that each end in something they can see or check: a page that opens, a test that passes, a sample message.
- Never leave the repository broken between steps.
- When a choice is artistic (how the data should shape the growth) rather than technical, stop and ask them; do not invent it.
  `docs/HANDOFF.md` lists which decisions are theirs.
- When a choice is technical and has a sensible default, make it, say what you chose and why, and move on.
- If something they ask for would break one of the rules below, say so and offer a safe alternative.

## Hard rules

1. **This repository is public.**
   Anything committed and pushed is visible to the world.
   Never commit `src/`, `spec.md`, `tech_spec.md`, `space_and_plates/`, the passphrase, API keys, tokens, phone numbers, email passwords or any other secret.
   `.gitignore` already excludes the first four; keep it that way.
   Before every commit, run `git status` and check that nothing private is staged.
2. **Pushing publishes.**
   `git push` updates the live page on GitHub Pages.
   Commit as often as you like, but ask the person before every push.
3. **The real code is encrypted.**
   The editable page lives in `src/`, which is gitignored.
   The committed `index.html` is that page encrypted with a shared passphrase.
   After any change to `src/`, the person must run `node tools/encrypt.mjs` themselves (it asks for the passphrase) before committing, or the change is lost.
   You cannot type the passphrase for them; ask them to run the command in their own terminal.
4. **Never edit generated files.**
   `src/data.js` and the root `index.html` are generated.
   Change their sources or the tools that build them instead.
5. **Run the tests before and after every change.**
   `node tools/test.mjs` takes about 20 seconds and must end with every test passing.
   If a test fails, including one unrelated to your change, fix it rather than ignoring it.
   Add a test for every new rule or behaviour.
6. **Keep the engine pure and deterministic.**
   `src/engine.js` has no DOM, no clock, no network and no randomness except seeded randomness.
   The same daily readings must always grow the same wall.
   Do not break this; the exhibition's archive depends on being able to replay every decision.

## How the code is organised

The design is a functional core with an imperative shell.

- **Core:** pure functions over plain values.
  State and input go in; new state and effects-as-data come out.
  The growth rules live in `src/engine.js` and nowhere else.
- **Shell:** a thin edge that holds state and does input/output: fetching data, reading sensors, sending messages, writing files.
  It makes no decisions of its own.

When you add something, put the decisions in pure functions that tests can check by plain equality, and keep the part that talks to the outside world as small as possible.
When you touch code that mixes the two, move it toward this split.
`docs/ARCHITECTURE.md` describes the boundaries and the contracts between the parts.

Other conventions:

- No dependencies. Node 18 or later, plain JavaScript, no build step, no npm packages unless there is a strong reason and the person agrees.
- Match the surrounding code: its naming, its comment density, its terse style.
- Prefer simple, robust, maintainable designs over quick ones.
- When fixing a bug, first reproduce it the way a user would see it, so the fix addresses the real problem.
- In Markdown files, put each sentence on its own line.

## Everyday commands

```sh
node tools/decrypt.mjs      # once per machine: recover src/ from index.html (asks for the passphrase)
open src/index.html         # open the working page from disk (macOS; on Windows: start src/index.html)
node tools/test.mjs         # run every test
node tools/encrypt.mjs      # after changing src/: re-encrypt into index.html (asks for the passphrase)
```

`README.md` explains the encryption, the plate and wall data, and every growth rule in detail.
`spec.md` is the artist's brief; it is private and arrives separately.

## Where the next work goes

The project is between phases.
The engine works end to end on stand-in data: a colour picked in the page stands in for each day's sensor telemetry.
The next phases replace that stand-in with real data and turn the decision into a delivered, archived daily instruction.
Each has its own guide in `docs/next/`:

1. `docs/next/1-choose-inputs.md` — choose the public data sources and the on-site sensor.
2. `docs/next/2-build-the-reading.md` — turn that data into the daily reading the engine consumes, in place of the colour.
3. `docs/next/3-deliver-and-archive.md` — send the daily instruction, log every decision, and back it all up.

Follow the guide for the phase the person is in.
Each guide ends with a definition of done; check it before calling a phase finished.
