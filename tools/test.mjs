#!/usr/bin/env node
// Run: node tools/test.mjs
//
// Crypto: the browser decryptor in tools/gate.html must agree with the Node
// encryptor in tools/lib.mjs. These are two independent implementations of the
// same format, so a change to one that is not mirrored in the other would ship
// an undecryptable page.
// Data: the plate and wall converters, on small synthetic inputs.
// Engine and page: the real src/, when it is present (it is gitignored; get
// it with tools/decrypt.mjs). Those tests are reported as skipped otherwise.
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { webcrypto } from "node:crypto";
import assert from "node:assert/strict";
import { encrypt, decrypt } from "./lib.mjs";
import { inline, extract } from "./bundle.mjs";
import { parsePathData, plateFromSvg, simplifyRing, plateIdFromFilename, insideRings } from "./plates.mjs";
import { parseWall } from "./wall.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const gate = await readFile(join(root, "tools", "gate.html"), "utf8");

// Lift the shipped functions out of gate.html so the browser code itself is
// under test, not a re-typed copy of it.
function lift(name) {
  const re = new RegExp(`\\n  (?:async )?function ${name}\\([\\s\\S]*?\\n  \\}`);
  const found = gate.match(re);
  assert.ok(found, `could not extract ${name}() from tools/gate.html`);
  return found[0];
}

function browserDecryptorFor(payload) {
  const body = `
    const crypto = arguments[0], atob = arguments[1], PAYLOAD = arguments[2];
    ${lift("b64")}
    ${lift("decrypt")}
    return decrypt;
  `;
  return new Function(body)(
    webcrypto,
    (s) => Buffer.from(s, "base64").toString("binary"),
    payload
  );
}

const PASSWORD = "correct horse battery staple";
// Multi-byte and HTML-significant characters, to catch encoding mistakes.
const FIXTURE = '<!doctype html><p>Ouijatari — plate #184, 90° · "overlap" & <b>grow</b> ☉</p>';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const skipped = [];

test("gate.html still has its payload placeholder", () => {
  assert.ok(gate.includes("__PAYLOAD__"), "tools/gate.html lost __PAYLOAD__");
});

test("browser decrypts what Node encrypts", async () => {
  const payload = await encrypt(FIXTURE, PASSWORD);
  assert.equal(await browserDecryptorFor(payload)(PASSWORD), FIXTURE);
});

test("browser rejects a wrong passphrase", async () => {
  const payload = await encrypt(FIXTURE, PASSWORD);
  await assert.rejects(() => browserDecryptorFor(payload)("nope"));
});

test("Node round-trips its own output", async () => {
  const payload = await encrypt(FIXTURE, PASSWORD);
  assert.equal(await decrypt(payload, PASSWORD), FIXTURE);
});

test("each encryption uses a fresh salt and IV", async () => {
  const [a, b] = await Promise.all([
    encrypt(FIXTURE, PASSWORD),
    encrypt(FIXTURE, PASSWORD),
  ]);
  assert.notEqual(a.kdf.salt, b.kdf.salt, "salt must not repeat");
  assert.notEqual(a.iv, b.iv, "IV must not repeat");
  assert.notEqual(a.ct, b.ct, "ciphertext must not repeat");
});

test("tampered ciphertext is rejected", async () => {
  const payload = await encrypt(FIXTURE, PASSWORD);
  const raw = Buffer.from(payload.ct, "base64");
  raw[0] ^= 0xff;
  payload.ct = raw.toString("base64");
  await assert.rejects(() => decrypt(payload, PASSWORD), "GCM must reject a forged payload");
});

test("payload is safe to inline in a <script> tag", async () => {
  const payload = await encrypt(FIXTURE, PASSWORD);
  const json = JSON.stringify(payload);
  assert.ok(!json.includes("</"), "payload must not contain a tag terminator");
});

/* ---------- bundling ---------- */

const PAGE = '<!doctype html><script src="data.js"></script>\n<script src="engine.js"></script>\n<script>go()</script>';
const SCRIPTS = { "data.js": "window.D = {a:1};\n", "engine.js": "// engine\nconst x = '<b>';" };

test("inline folds local scripts in and extract restores them exactly", async () => {
  const bundled = await inline(PAGE, async (name) => SCRIPTS[name]);
  assert.ok(!/<script src=/.test(bundled), "no external script may survive bundling");
  const { html, files } = extract(bundled);
  assert.equal(html, PAGE);
  assert.deepEqual(Object.fromEntries(files), SCRIPTS);
});

test("inline refuses a script that would close its own tag", async () => {
  await assert.rejects(() => inline(PAGE, async () => 'x = "</script>"'));
});

test("a page with no local scripts passes through both ways", async () => {
  assert.equal(await inline(FIXTURE, async () => ""), FIXTURE);
  assert.equal(extract(FIXTURE).html, FIXTURE);
});

/* ---------- plate conversion ---------- */

// A 2 × 1 inch rectangle centred on a 4 × 4 inch artboard, drawn the way
// mutool does: y flipped by the path transform, plus a stroke-only duplicate.
const RECT_SVG = `<svg viewBox="0 0 288 288"><defs><clipPath><path d="M0 0H288V288H0Z"/></clipPath></defs>
<path transform="matrix(1,0,0,-1,72,180)" d="M0 0H144V72H0Z" fill="#231f20"/>
<path transform="matrix(1,0,0,-1,72,180)" d="M0 0H144V72H0Z" fill="none" stroke="#030405"/></svg>`;

test("path data parses moveto runs, H/V and curves", () => {
  assert.deepEqual(parsePathData("M0 0 10 0V5H0Z"), [[[0, 0], [10, 0], [10, 5], [0, 5]]]);
  const [curve] = parsePathData("M0 0C0 10 10 10 10 0");
  assert.deepEqual(curve.at(-1), [10, 0]);
  assert.ok(Math.abs(curve[4][1] - 7.5) < 1e-9, "curve midpoint");
  assert.throws(() => parsePathData("M0 0A5 5 0 0 1 10 0"), /Unsupported path command/);
});

test("a plate is measured in inches about the artboard centre", () => {
  const p = plateFromSvg(RECT_SVG, { id: "X_1", family: "X", source: "X_1.ai" });
  assert.equal(p.d, "M-1 0.5L1 0.5L1 -0.5L-1 -0.5Z");
  assert.equal(p.width, 2);
  assert.equal(p.height, 1);
  assert.ok(Math.abs(p.area - 2) < 0.01, `area ${p.area}`);
  assert.equal(p.perimeter, 6);
  assert.equal(p.density, 1);
  assert.equal(p.branches, 1);
  assert.ok(Math.abs(p.elongation - 2) < 0.01, `elongation ${p.elongation}`);
  // A bar's two ends are its connection points, each pointing outward.
  assert.deepEqual(p.points, [[1, 0, 90], [-1, 0, 270]]);
  assert.ok(insideRings(parsePathData(p.d), p.rule, ...p.hang), "the hang point is on the metal");
});

test("simplifying drops collinear points and keeps corners", () => {
  const square = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]];
  assert.deepEqual(simplifyRing(square), [[0, 0], [2, 0], [2, 2], [0, 2]]);
});

test("plate IDs lose the stray spaces in the source file names", () => {
  assert.equal(plateIdFromFilename("T_1_23 .ai"), "T_1_23");
  assert.equal(plateIdFromFilename("G_7_ 2.ai"), "G_7_2");
});

/* ---------- wall conversion ---------- */

// A room corner: a 60 in wall along x (at z = 0, facing -z) meeting a 40 in
// wall along z (at x = 0, facing +x), 30 in high, with nails on a 10 in pitch.
function roomObj() {
  const v = [], lines = [];
  const quad = (pts) => {
    for (const p of pts) v.push(p), lines.push(`v ${p.join(" ")}`);
    lines.push(`f ${pts.map((_, i) => v.length - pts.length + i + 1).join(" ")}`);
  };
  const face = (name, pts) => { lines.push(`g ${name}`); quad(pts); };
  const box = (name, [x0, x1], [y0, y1], [z0, z1]) => {
    lines.push(`g ${name}`);
    quad([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]]);
    quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
  };
  face("back", [[0, 0, 0], [60, 0, 0], [60, 30, 0], [0, 30, 0]]);
  face("side", [[0, 0, 0], [0, 0, -40], [0, 30, -40], [0, 30, 0]]);
  let n = 0;
  for (const y of [10, 20]) {
    for (const x of [10, 20, 30, 40, 50]) box(`nail${++n}`, [x - 0.4, x + 0.4], [y - 0.4, y + 0.4], [-3, 0]);
    for (const z of [-10, -20, -30]) box(`nail${++n}`, [0, 3], [y - 0.4, y + 0.4], [z - 0.4, z + 0.4]);
  }
  box("nail-duplicate", [9.6, 10.4], [9.6, 10.4], [-3, 0]);
  return lines.join("\n");
}

test("walls unfold left to right as seen from inside the room", () => {
  const w = parseWall(roomObj());
  // Facing the back wall from inside (looking +z), x = 60 is on the left and
  // the corner at x = 0 on the right, where the side wall continues.
  assert.deepEqual(w.walls, [{ name: "Wall 1", u: 0, length: 60 }, { name: "Wall 2", u: 60, length: 40 }]);
  assert.equal(w.width, 100);
  assert.equal(w.height, 30);
  assert.deepEqual(w.pitch, [10, 10]);
  assert.equal(w.nails.length, 16, "stacked duplicate nails count once");
  assert.deepEqual(w.nails[0], { id: "A-01", wall: 0, col: 0, row: 0, u: 10, y: 10 });
  // The corner takes lattice column 5 and carries no nail, so the side wall
  // starts at column 6 but its nails are numbered on from 06.
  assert.deepEqual(w.nails.at(-1), { id: "B-08", wall: 1, col: 8, row: 1, u: 90, y: 20 });
  assert.ok(!w.nails.some((n) => n.col === 5));
});

/* ---------- engine and page (need src/) ---------- */

const SRC = join(root, "src");
const srcReady = ["index.html", "engine.js", "data.js"].every((f) => existsSync(join(SRC, f)));
const srcTest = (name, fn) => (srcReady ? test(name, fn) : skipped.push(name));

// The page's scripts run as functions of the globals they use, so that their
// global lookups stay as fast as in a browser (a vm context slows them badly).
const run = (code, globals) => new Function(...Object.keys(globals), code)(...Object.values(globals));

async function loadEngine() {
  const window = {};
  for (const f of ["data.js", "engine.js"]) run(await readFile(join(SRC, f), "utf8"), { window });
  const O = window.Ouijatari;
  return { O, E: O.createEngine(window.OUIJATARI_DATA), data: window.OUIJATARI_DATA };
}

// Exhibitions are costly to grow, so each seed is grown once and shared.
const grown = new Map();
async function exhibition(seed) {
  const { O, E } = await loadEngine();
  if (!grown.has(seed)) grown.set(seed, E.grow(Array.isArray(seed) ? seed : O.seedReadings(seed, O.DAYS)));
  return { O, E, run: grown.get(seed) };
}

// A decided plate's outline and connection points in wall coordinates.
function placed(d) {
  const a = (d.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const at = ([x, y]) => [c * x - s * y + d.x, s * x + c * y + d.y];
  return { rings: parsePathData(d.plate.d).map((r) => r.map(at)), points: d.plate.points.map(at) };
}
const segmentDistance = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const edgeDistance = (rings, p) =>
  Math.min(...rings.flatMap((r) => r.map((q, i) => segmentDistance(p, r[(i || r.length) - 1], q))));

srcTest("the catalog holds 75 plates in each of four families", async () => {
  const { data } = await loadEngine();
  const count = {};
  for (const p of data.plates) count[p.family] = (count[p.family] || 0) + 1;
  assert.deepEqual(count, { A: 75, T: 75, C: 75, G: 75 });
  assert.equal(new Set(data.plates.map((p) => p.id)).size, 300);
});

srcTest("every plate has connection points on its edge and a hang point on its metal", async () => {
  const { data } = await loadEngine();
  for (const p of data.plates) {
    const rings = parsePathData(p.d);
    assert.ok(p.points.length >= 2, `${p.id} has fewer than two connection points`);
    for (const [x, y, dir] of p.points) {
      assert.ok(edgeDistance(rings, [x, y]) < 0.05, `${p.id}: point ${x},${y} is off the outline`);
      assert.ok(Number.isInteger(dir) && dir >= 0 && dir < 360, `${p.id}: bad direction ${dir}`);
    }
    assert.ok(insideRings(rings, p.rule, ...p.hang), `${p.id}: hang point is off the metal`);
  }
});

const SEEDS = ["#B4642A", "#000000", "#FFFFFF", "#3366CC", "#12CC88"];

srcTest("a full exhibition installs 157 distinct plates, each on its own nail", async () => {
  for (const seed of SEEDS) {
    const { E, run } = await exhibition(seed);
    assert.equal(run.length, 157);
    assert.equal(new Set(run.map((d) => d.plate.id)).size, 157, "a plate repeated");
    const nails = run.filter((d) => d.nail !== null).map((d) => d.nail);
    assert.equal(new Set(nails).size, nails.length, "a nail was used twice");
    // The lattice has no nail at a corner, so a plate touching one to open the
    // next wall may be carried by its joints.
    assert.ok(run.every((d) => d.nail !== null || d.blocked || d.touch), "a plate went unnailed on an unblocked day");
    assert.ok(run.every((d) => d.rotation >= 0 && d.rotation < 360));
    for (const d of run) {
      if (d.nail === null) continue;
      const { rings } = placed(d), n = E.nails[d.nail];
      const onMetal = insideRings(rings, d.plate.rule, n.u, n.y);
      assert.ok(onMetal || edgeDistance(rings, [n.u, n.y]) <= 1 + 1e-9, `day ${d.day}: nail ${n.id} is not under the plate`);
    }
  }
});

srcTest("every plate after the first meets the mass at its connection points", async () => {
  const { E, run } = await exhibition("#B4642A");
  assert.equal(run[0].nail, E.origin);
  assert.equal(run[0].parent, null);
  for (const d of run.slice(1)) {
    assert.ok(d.joins.length >= 1, `day ${d.day} touches nothing`);
    assert.ok(d.parent && d.parent.day < d.day, `day ${d.day} has no earlier parent`);
    const mine = placed(d);
    for (const j of d.joins) {
      assert.ok(Math.hypot(mine.points[j.point][0] - j.x, mine.points[j.point][1] - j.y) <= 0.15,
        `day ${d.day}: its point ${j.point + 1} is not at the joint`);
      for (const w of j.with) {
        const theirs = placed(w.decision);
        const gap = w.point === null ? edgeDistance(theirs.rings, [j.x, j.y])
          : Math.hypot(theirs.points[w.point][0] - j.x, theirs.points[w.point][1] - j.y);
        assert.ok(gap <= 0.15, `day ${d.day}: ${w.decision.plate.id} is ${gap.toFixed(2)} in from the joint`);
      }
    }
  }
});

// Rasterises every plate on a quarter-inch grid and counts, for each pair,
// the cells both cover away from the joints, where branch ends may meet.
srcTest("plates touch but never lie on one another", async () => {
  const STEP = 0.25, CONTACT = 0.75;
  for (const seed of ["#B4642A", "#3366CC"]) {
    const { E, run } = await exhibition(seed);
    const W = Math.ceil(E.wall.width / STEP), owner = new Int16Array(W * Math.ceil(E.wall.height / STEP)).fill(-1);
    const joints = run.flatMap((d) => d.joins.map((j) => [j.x, j.y]));
    const overlaps = new Map();
    run.forEach((d, k) => {
      const { rings } = placed(d), ys = rings.flat().map((p) => p[1]);
      for (let r = Math.floor(Math.min(...ys) / STEP); r * STEP < Math.max(...ys); r++) {
        const y = (r + 0.5) * STEP, xs = [];
        const xsAll = rings.flat().map((p) => p[0]);
        for (let c = Math.floor(Math.min(...xsAll) / STEP); c * STEP < Math.max(...xsAll); c++) xs.push(c);
        for (const c of xs) {
          const x = (c + 0.5) * STEP;
          if (!insideRings(rings, d.plate.rule, x, y)) continue;
          const other = owner[r * W + c];
          if (other >= 0 && !joints.some(([jx, jy]) => Math.hypot(jx - x, jy - y) <= CONTACT)) {
            const key = other + ":" + k;
            overlaps.set(key, (overlaps.get(key) || 0) + 1);
          }
          owner[r * W + c] = k;
        }
      }
    });
    for (const [key, cells] of overlaps) {
      const [a, b] = key.split(":").map(Number);
      assert.ok(cells <= 4, `${seed}: days ${run[a].day} and ${run[b].day} overlap by ${cells} cells`);
    }
  }
});

srcTest("the composition spreads onto all three walls, each plate flat on one", async () => {
  for (const seed of SEEDS) {
    const { E, run } = await exhibition(seed);
    const counts = E.wall.walls.map((w) => run.filter((d) => {
      const xs = placed(d).rings.flat().map((p) => p[0]);
      return Math.min(...xs) >= w.u - 0.15 && Math.max(...xs) <= w.u + w.length + 0.15;
    }).length);
    assert.equal(counts.reduce((a, b) => a + b), 157, `${seed}: a plate folds round a corner`);
    assert.ok(counts.filter((n) => n > 0).length >= 2, `${seed}: the composition never left the centre wall (${counts.join("/")})`);
  }
  const reached = await Promise.all(SEEDS.map(async (seed) => {
    const { E, run } = await exhibition(seed);
    return E.wall.walls.every((w) => run.some((d) => d.x >= w.u && d.x < w.u + w.length));
  }));
  assert.ok(reached.filter(Boolean).length >= SEEDS.length - 1, "most exhibitions should reach every wall");
});

srcTest("a plate opening a corner touches the corner line with its metal", async () => {
  const { E, run } = await exhibition("#B4642A");
  const corners = E.wall.walls.slice(1).map((w) => w.u);
  const touches = run.filter((d) => d.touch);
  assert.ok(touches.length >= 1, "no plate touched a corner");
  for (const d of touches) {
    assert.ok(corners.includes(d.touch.x), `day ${d.day}: touch off the corner line`);
    const { rings } = placed(d);
    assert.ok(edgeDistance(rings, [d.touch.x, d.touch.y]) <= 0.15, `day ${d.day}: the metal does not reach the corner`);
  }
});

srcTest("each phase only creates the relationships it has unlocked", async () => {
  const { O, run } = await exhibition("#12CC88");
  for (const d of run.slice(1)) {
    assert.equal(d.blocked, false, `day ${d.day} was blocked`);
    assert.ok(O.permittedKinds(d.phase).includes(d.kind), `day ${d.day}: ${d.kind} in phase ${d.phase.n}`);
  }
});

srcTest("the same readings grow the same wall", async () => {
  const { O, E, run } = await exhibition("#B4642A");
  const readings = O.seedReadings("#B4642A", O.DAYS);
  const key = (r) => r.map((d) => [d.plate.id, d.nail, d.x.toFixed(6), d.y.toFixed(6), d.rotation.toFixed(6), d.relation].join("|")).join("\n");
  assert.equal(key(E.grow([...readings])), key(run));
  // Days kept from an earlier run are reinstalled exactly as they were decided.
  assert.equal(key(E.grow(readings, run.slice(0, 80))), key(run));
  // A decision depends only on the readings up to its day.
  const changed = [...readings];
  changed[100] = "#00FF00";
  assert.equal(key(E.grow(changed, run.slice(0, 100)).slice(0, 100)), key(run.slice(0, 100)));
  assert.notEqual(key(E.grow(changed, run.slice(0, 100)).slice(100)), key(run.slice(100)));
});

srcTest("an exhausted family hands over to the next one instead of repeating", async () => {
  const { run } = await exhibition(Array(157).fill("#B4642A"));
  assert.equal(new Set(run.map((d) => d.plate.id)).size, 157);
  assert.equal(run.filter((d) => d.family === "A").length, 75);
  assert.ok(run.every((d) => d.familyRequested === "A"));
  // Hue 25° asks for A; C is the next sector round the wheel, then T.
  assert.ok(run.slice(75, 150).every((d) => d.family === "C"));
  assert.ok(run.slice(150).every((d) => d.family === "T"));
});

// Runs the page's own script against a stand-in DOM that accepts anything and
// remembers what was written to it, with every optional panel present.
srcTest("the page script renders day 157 without error", async () => {
  const html = await readFile(join(SRC, "index.html"), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, "src/index.html has no inline script");
  const element = () => {
    const store = {};
    return new Proxy(function () {}, {
      get(_, k) {
        if (k in store) return store[k];
        if (k === Symbol.iterator) return function* () {};
        if (k === Symbol.toPrimitive) return () => 0;
        if (k === "then") return undefined;
        return (store[k] = element());
      },
      set(_, k, v) { store[k] = v; return true; },
      apply() { return element(); },
    });
  };
  const nodes = new Map();
  const document = element();
  document.querySelector = (sel) => nodes.get(sel) || nodes.set(sel, element()).get(sel);
  const window = { addEventListener() {} };
  for (const f of ["data.js", "engine.js"]) run(await readFile(join(SRC, f), "utf8"), { window });
  run(script[1], { window, document, navigator: {}, setTimeout, setInterval, clearInterval });

  const written = (sel, prop = "innerHTML") => String(nodes.get(sel)[prop]);
  assert.ok(!/NaN|undefined/.test(written("#fieldPlates")), "the field marks have no size");
  assert.equal((written("#plateDefsList").match(/<path /g) || []).length, 300);
  assert.equal((written("#fieldStatic").match(/class="nail"/g) || []).length, 594);
  assert.equal((written("#fieldPlates").match(/<use /g) || []).length, 157);
  assert.ok((written("#fieldPlates").match(/class="joint"/g) || []).length >= 1, "today's joints are marked");
  assert.equal((written("#archiveGrid").match(/class="thumb"/g) || []).length, 300);
  assert.match(written("#msg"), /Day 157[\s\S]*Mounting point:<\/span> Nail [A-I]-\d\d, /);
  assert.match(written("#msg"), /Attachment point:<\/span> point \d+ to [ACGT]_[\w]+ point \d+, [\d.]+ in (left|right) and [\d.]+ in (above|below) Nail [A-I]-\d\d/);
  assert.equal(written("#cands").match(/<tr/g).length, 6);
  const O = window.Ouijatari;
  assert.equal((written("#permitted").match(/<li>/g) || []).length, O.permittedKinds(O.PHASES.at(-1)).length);
  assert.equal(nodes.get("#dayThumb").style.left, "100%");
  assert.equal(nodes.has("#params"), false, "the satellite parameters panel is gone");
  const record = JSON.parse(written("#archive", "textContent"));
  assert.equal(record.growth_field_state.length, 156);
  assert.ok(record.connection_points.length >= 1);
  assert.ok(!/undefined|NaN|null/.test(written("#msg") + written("#fcap", "textContent") + written("#trace") + written("#platefig")));
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${process.env.TRACE ? err.stack : err.message}`);
  }
}
for (const name of skipped) console.log(`  skip ${name}`);
console.log(`\n${tests.length - failed}/${tests.length} passed` +
  (skipped.length ? `, ${skipped.length} skipped (no src/ — run tools/decrypt.mjs or tools/build-data.mjs)` : ""));
process.exit(failed ? 1 : 0);
