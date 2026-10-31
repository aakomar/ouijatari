# ouijatari

The Ouijatari interface bench, published openly on GitHub Pages at <https://aakomar.github.io/ouijatari/>.

**New to the project? Start with [docs/HANDOFF.md](docs/HANDOFF.md).**
AI coding agents should read [AGENTS.md](AGENTS.md) first.

The page has no password.
Anyone with the link can open it, and this repository, including the plate outlines in `data.js`, is public.
The artist's brief and the source artwork are kept out of it (see `.gitignore`).

## Layout

| Path | |
|---|---|
| `index.html` | The page: markup, styles, rendering and interaction. Holds no rules. |
| `engine.js` | The pipeline: reading → plate → nail → Growth Field. Pure, no DOM. |
| `data.js` | Generated. The plate catalog and the wall model. |
| `space_and_plates/` | Source artwork and gallery model. **Gitignored.** |
| `tools/build-data.mjs` | `space_and_plates/` → `data.js`. |
| `tools/plates.mjs` | Plate vector → outline, silhouette metrics and connection points. |
| `tools/wall.mjs` | Gallery model → unfolded walls and nail lattice. |
| `tools/test.mjs` | Tests for all of the above. |
| `AGENTS.md`, `CLAUDE.md` | Instructions for AI coding agents. |
| `docs/HANDOFF.md` | Where the project stands, and how to continue it. |
| `docs/ARCHITECTURE.md` | The boundaries between the parts, and the data that crosses them. |
| `docs/next/` | A guide for each of the next phases. |

Requires Node 18+. There are no dependencies and no build step.
Rebuilding `data.js` additionally needs `mutool` (`brew install mupdf`).

## Editing the page

```sh
open index.html             # the page runs straight from disk
node tools/test.mjs
git commit -am "Update page" && git push
```

Pushing to `main` publishes: GitHub Pages serves the repository root as it is.

## Plate and wall data

`node tools/build-data.mjs` regenerates `data.js` from `space_and_plates/`.
It reads the four `*_vectors/` folders of Illustrator files (75 plates each) and the SketchUp `.obj` export of the gallery.
The output is deterministic: the same sources give a byte-identical file.
Run it only when the artwork or the model changes.

Plates.
Each plate's ID is its file name without the extension (`A_8_12`).
Its outline is simplified to 0.02 in and stored in inches about the centre of its artboard.
The catalog records what a silhouette can supply: width, height, area, perimeter, compactness, elongation, silhouette density (area over convex-hull area) and a branch count.
Oxidation coverage, colour and brightness need photographs of the finished plates and are not in the catalog yet.

It also records each plate's **connection points**, the places where it can meet another plate.
The artwork does not mark them, so they are read off the outline as the ends of the plate's branches: the places where the outline folds back on itself.
Each point carries the direction its branch points, and points are numbered from 1, clockwise from the designated top.
Every plate has at least two.
The **hang point** is the spot on the metal farthest from any edge, where the first plate hangs on its nail.

Wall.
The model's three nailed walls are unfolded into one elevation strip, left to right as seen from inside the room.
Nails are named row-column: `E-34` is the fifth row down in the 34th nailed column across the strip.
The corners fall on lattice columns that carry no nail, so nails either side of a corner are two steps apart.

Three readings of the source files are assumptions, each made in one place:

- **Connection points.** The ends of the branches, found in `tools/plates.mjs`. When the artist marks real connection points, they replace these there.
- **Mounting.** A plate hangs on one nail that lies under its metal, or that its edge rests against no more than an inch away (`engine.js`).
- **Designated top.** The upward direction of the artboard.

## Growth rules

The rules live in `engine.js` and nowhere else.
The exhibition is a fold over 157 daily readings; a decision depends only on the readings up to its day.

1. **Family** — the hue sector of the reading. If that family is used up, the next sector round the wheel stands in.
2. **Plate** — the unused plate in that family whose area, branch count, elongation and density, as ranks within the archive, lie closest to the reading's target profile.
3. **Position** — day 1 hangs the plate by its hang point on the nail at the centre of the longest wall. Every later plate attaches to the composition by putting one of its connection points on an open connection point of a plate already installed, or two of its points on two at once. That join decides where the plate goes and, for a two-point join, how it turns. The phase decides which relationships are permitted. Among the permitted joins, growth energy sets how far from the composition's centre to reach and how dense a relationship to make, and magnetic bias sets the direction. Two more pulls spread the composition along all three walls instead of letting it mass on the centre one: toward stretches of wall with less metal nearby, and toward the side of the strip that has had less than its share of the exhibition so far.
4. **Orientation** — the reading's position inside its hue sector, in 15° steps. A two-point join turns the plate however the join requires, and if no join fits at the reading's orientation, every 15° step is tried.

A join is physical.
The branches meeting at a point must come in at least 90° apart, and at most four plates meet at one point.
The new plate may not lie on metal already on the wall, except where branch ends meet at its joints.
It must stay on one wall, since a plate cannot fold round a corner, and hang on a nail of its own.

A corner is crossed in two steps.
First a plate pinned to a joint near the corner turns until its metal just touches the corner line; that touch becomes a joint on the line.
Then a plate on the next wall meets that joint with a branch end pointing straight into the corner.
The lattice has no nail at a corner, and the nearest ones are 17.5 in out, so the touching plate may be carried by its joints when no nail is in reach.
A touch only counts as opening the next wall when no other crossing is under way within 24 in of it up or down the corner, which keeps plates from stacking along a corner.

A relationship is a statement about those joints, not a label:

- **Simple attachment.** The new plate meets one plate at one point.
- **Three-way and four-way junction.** It meets a point where two or three plates already meet.
- **Two-way attachment.** It meets two plates that already touch, or one plate at two points.
- **Loop closure.** It joins two plates that are a few contacts apart.
- **Long-range bridge.** It joins two plates six or more contacts apart.
- **Cluster infill.** It meets three or more plates at once.

Phase 1 allows simple and two-way attachments within four nail spacings of the initial node, phase 2 adds junctions, phase 3 adds loop closures and cluster infill, and phase 4 adds bridges.
The joins that close loops and bridges are geometrically rare, so most days make simple attachments even late in the exhibition.

Every open day must install its plate.
When the rules leave nowhere to go, they give way in turn, and the day is marked as blocked.
First any relationship is taken; then the plate may be carried by its joints with no nail of its own; and finally one of its points may rest on the side of an installed plate rather than on a branch end.
With varied readings this does not happen.
Long runs of a single family whose plates have only two connection points can need it.

Not modelled yet: plates overlapping or crossing one another on purpose.
