/* ============================================================
   Ouijatari engine — reading → decision → Growth Field.

   Pure and deterministic: no DOM, no clock, no persisted state. The whole
   exhibition is a fold over the list of daily readings, so the same readings
   always grow the same wall. The page (index.html) only renders what this
   returns; tools/test.mjs runs it under Node.

   A "reading" is one six-digit hex colour standing in for a day's Satellite
   telemetry. Plates and the wall come from data.js, built from the artist's
   vectors and the SketchUp model by tools/build-data.mjs.
   ============================================================ */
(function (root) {
"use strict";

/* ---------- colour ---------- */
function hexToRgb(h){
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim());
  if(!m) return null;
  const n = parseInt(m[1],16);
  return {r:(n>>16)&255, g:(n>>8)&255, b:n&255};
}
const hx = (n) => n.toString(16).padStart(2,'0').toUpperCase();
const rgbToHex = (r,g,b) => '#'+hx(r)+hx(g)+hx(b);

function rgbToHsv(r,g,b){
  r/=255; g/=255; b/=255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn;
  let h=0;
  if(d){
    if(mx===r) h=60*(((g-b)/d)%6);
    else if(mx===g) h=60*(((b-r)/d)+2);
    else h=60*(((r-g)/d)+4);
  }
  return {h:(h+360)%360, s:mx?d/mx:0, v:mx};
}
function hsvToRgb(h,s,v){
  const c=v*s, x=c*(1-Math.abs(((h/60)%2)-1)), m=v-c;
  let p=[0,0,0];
  if(h<60)p=[c,x,0]; else if(h<120)p=[x,c,0]; else if(h<180)p=[0,c,x];
  else if(h<240)p=[0,x,c]; else if(h<300)p=[x,0,c]; else p=[c,0,x];
  return {r:Math.round((p[0]+m)*255), g:Math.round((p[1]+m)*255), b:Math.round((p[2]+m)*255)};
}

/* ---------- deterministic PRNG ---------- */
function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a>>>15), 1 | a);
    t = (t + Math.imul(t ^ (t>>>7), 61 | t)) ^ t;
    return ((t ^ (t>>>14)) >>> 0) / 4294967296;
  };
}

/* ---------- exhibition ---------- */
const DAYS = 157;

/* Hue sectors are laid out so complementary hues give complementary bases:
   A 0–90° opposite T 180–270°, C 90–180° opposite G 270–360°. */
const SECTORS = [
  {from:0,   to:90,  fam:'A', name:'0–90°'},
  {from:90,  to:180, fam:'C', name:'90–180°'},
  {from:180, to:270, fam:'T', name:'180–270°'},
  {from:270, to:360, fam:'G', name:'270–360°'}
];

/* Time decides which relationships are permitted; `unlocks` names the ones
   each phase adds to those before it. */
const PHASES = [
  {n:1, days:'1–39',    from:1,   to:39,  label:'simple attachment',   unlocks:['simple attachment','two-way attachment']},
  {n:2, days:'40–78',   from:40,  to:78,  label:'multi-way junctions', unlocks:['three-way junction','four-way junction']},
  {n:3, days:'79–117',  from:79,  to:117, label:'loops and clusters',  unlocks:['loop closure','cluster infill']},
  {n:4, days:'118–157', from:118, to:157, label:'long-range bridging', unlocks:['long-range bridge']}
];
const phaseOf = (day) => PHASES.find(p => day>=p.from && day<=p.to);
const permittedKinds = (phase) => PHASES.filter(p => p.n<=phase.n).flatMap(p => p.unlocks);

/* Phase 1 keeps growth within this many nail spacings of the initial node. */
const NEAR_RADIUS = 4;

/* Plate matching: the silhouette metrics compared with the day's target
   profile, each as a rank within the archive. [key, label, weight] */
const DIMS = [
  ['area',       'Plate area',         1.2],
  ['branches',   'Branch count',       1.0],
  ['elongation', 'Elongation',         0.8],
  ['density',    'Silhouette density', 0.8]
];
const WSUM = DIMS.reduce((a,d)=>a+d[2],0);

/* Placement: how strongly the day's growth energy (reach), magnetic bias
   (direction) and the reading's orientation each pull the choice among
   permitted joins. */
const W_REACH = 0.6, W_BIAS = 0.4, W_TURN = 0.3, W_KIND = 0.5;
/* The composition spreads along all three walls rather than massing on the
   first. Room pulls growth toward stretches of the strip with less metal
   within ROOM_BAND inches either side; owed pulls it toward the side of the
   strip that has had less than its share of the exhibition so far. */
const W_ROOM = 3, ROOM_BAND = 24, W_OWED = 2;
/* How dense each relationship is, 0…1. Growth energy (amplitude with
   occupancy) asks for a denser relationship as it rises; the permitted kind
   nearest that density is preferred. */
const DENSITY = {
  'simple attachment':0, 'two-way attachment':0.4, 'three-way junction':0.55, 'loop closure':0.7,
  'four-way junction':0.8, 'cluster infill':0.9, 'long-range bridge':1
};
/* The orientations a single join is tried at when the reading's own one
   fits nowhere: every 15°. */
const ROTATIONS = Array.from({length:24}, (_,i) => i*15);

/* Physical contact. Plates meet at their connection points (the ends of their
   branches, listed in the catalog). A join puts a point of the new plate on a
   point of the composition; up to MAX_JOINT plates can meet at one point. Two
   points closer than JOIN_TOL are the same joint. */
const MAX_JOINT = 4, JOIN_TOL = 0.15;
/* Branches meeting at a joint come in from clearly different directions: at
   least MIN_SPLAY degrees apart. Two branch ends pointing the same way would
   put one plate on top of the other. */
const MIN_SPLAY = 90;
/* Plates touch but do not lie on one another. Within CONTACT inches of a
   joint the pose is built on, branch ends meet and may overlap; elsewhere at
   most OVERLAP_TOL samples of the new plate (one every SAMPLE inches) may fall
   on metal already on the wall. */
const SAMPLE = 0.25, CONTACT = 0.75, OVERLAP_TOL = 2;
/* A plate hangs on one free nail: one under its metal, or one its edge
   rests against, no more than NAIL_REACH inches outside it. The nail deepest
   in the metal is the one used. Only when no plate can hang anywhere is one
   carried by its joints alone, so that growth never dead-ends. */
const NAIL_REACH = 1;
/* A joint, or a stretch of a plate's side, can take a new plate only while
   the wall PROBE inches out from it is bare. Sides are offered every
   SIDE_STEP inches along the outline. */
const PROBE = 1, SIDE_STEP = 1;
/* A plate meeting a corner from the next wall is tried at every FACE_STEP
   degrees its branch end can face the corner at, keeping FACE_MARGIN degrees
   clear of the angles where the metal beside it would touch first. */
const FACE_STEP = 10, FACE_MARGIN = 5;
/* A touch takes the composition onto the next wall only where no crossing
   is already under way within CORNER_SPACING inches up or down the corner. */
const CORNER_SPACING = 24;
/* Two plates this many contacts apart in the composition are in distant
   areas of it; a plate joining them is a long-range bridge. */
const BRIDGE_HOPS = 6;

/* Exhibition calendar: open daily except Mondays, from 16 October 2027. */
function openDayDate(n){
  let d = Date.UTC(2027,9,16), c=0;
  for(;;){
    const dt = new Date(d);
    if(dt.getUTCDay() !== 1){ c++; if(c===n) return dt; }
    d += 86400000;
  }
}

/* Reading → normalised parameters and the targets they set. Independent of
   the wall and of what has been installed. */
function read(hex){
  const rgb = hexToRgb(hex);
  if(!rgb) throw new Error('Not a six-digit hex colour: '+hex);
  const {r,g,b} = rgb;
  const {h,s,v} = rgbToHsv(r,g,b);
  const hPos = (h % 90) / 90;                     // position inside the family sector
  const params = {
    amplitude:   s,                               // VLF atmospheric amplitude
    variability: Math.abs(r-b)/255,               // signal variability
    frequency:   4 + (h/360)*24,                  // dominant frequency, kHz
    bias:        h,                               // directional magnetic bias, degrees clockwise from up
    occupancy:   Math.round(v*120),               // anonymous occupancy count
    vibration:   g/255                            // structural vibration index
  };
  /* Amplitude and occupancy together are the day's growth energy. A day of
     "almost no growth" is low energy: a small plate, attached tightly. */
  const energy = s * v;
  return {
    hex: rgbToHex(r,g,b), r, g, b, h, s, v, hPos, params, energy,
    sector: SECTORS.find(x => h>=x.from && h<x.to) || SECTORS[3],
    target: {area: energy, branches: hPos, elongation: params.variability, density: params.vibration},
    /* Orientation comes from the position inside the sector, so every family
       can take every angle. */
    rotation: (Math.round(hPos*24) % 24) * 15
  };
}

/* A whole exhibition of readings scattered from one colour. */
function seedReadings(hex, n){
  const {r,g,b} = hexToRgb(hex);
  const rnd = mulberry32(((r<<16)|(g<<8)|b) ^ 0x9E3779B9);
  const out = [];
  for(let i=0;i<(n||DAYS);i++){
    out.push(rgbToHex(Math.floor(rnd()*256), Math.floor(rnd()*256), Math.floor(rnd()*256)));
  }
  return out;
}

/* Rank of each value within its list, 0…1, ties sharing their mean rank. */
function ranks(values){
  const order = values.map((v,i)=>[v,i]).sort((a,b)=>a[0]-b[0]);
  const out = new Array(values.length);
  for(let i=0;i<order.length;){
    let j=i; while(j<order.length && order[j][0]===order[i][0]) j++;
    for(let k=i;k<j;k++) out[order[k][1]] = ((i+j-1)/2) / Math.max(1, values.length-1);
    i=j;
  }
  return out;
}

/* ---------- plate geometry ---------- */
/* Outlines come as "Mx yLx y…Z" per ring, in inches about the plate's frame
   origin, y down. A pose is a clockwise rotation in degrees about that origin
   followed by a translation to (x, y) on the unfolded wall. */
const parseRings = (d) => d.split('Z').filter(Boolean)
  .map(r => r.slice(1).split('L').map(q => q.split(' ').map(Number)));

function inside(rings, rule, x, y){
  let wind = 0, crossings = 0;
  for(const r of rings){
    for(let i=0, j=r.length-1; i<r.length; j=i++){
      const ya = r[j][1], yb = r[i][1];
      if((ya<=y) === (yb<=y)) continue;
      if(r[j][0] + (y-ya)/(yb-ya)*(r[i][0]-r[j][0]) > x){ crossings++; wind += yb>ya ? 1 : -1; }
    }
  }
  return rule==='evenodd' ? crossings%2===1 : wind!==0;
}
function edgeDistance(rings, x, y){
  let best = Infinity;
  for(const r of rings){
    for(let i=0, j=r.length-1; i<r.length; j=i++){
      const ax=r[j][0], ay=r[j][1], dx=r[i][0]-ax, dy=r[i][1]-ay, len2=dx*dx+dy*dy;
      const t = len2 ? Math.max(0, Math.min(1, ((x-ax)*dx+(y-ay)*dy)/len2)) : 0;
      best = Math.min(best, Math.hypot(x-ax-t*dx, y-ay-t*dy));
    }
  }
  return best;
}
/* Cell centres (on a `step` grid anchored at the origin) inside the rings,
   as a flat [x0,y0,x1,y1,…] list. */
function fill(rings, rule, step, x0, x1, y0, y1){
  const out = [];
  for(let r=Math.ceil(y0/step-0.5); (r+0.5)*step<y1; r++){
    const y = (r+0.5)*step, xs = [];
    for(const ring of rings){
      for(let i=0, j=ring.length-1; i<ring.length; j=i++){
        const ya = ring[j][1], yb = ring[i][1];
        if((ya<=y) === (yb<=y)) continue;
        xs.push([ring[j][0] + (y-ya)/(yb-ya)*(ring[i][0]-ring[j][0]), yb>ya ? 1 : -1]);
      }
    }
    xs.sort((a,b) => a[0]-b[0]);
    let wind = 0;
    for(let k=0; k<xs.length-1; k++){
      wind += xs[k][1];
      if(rule==='evenodd' ? k%2===1 : wind===0) continue;
      for(let c=Math.ceil(xs[k][0]/step-0.5); (c+0.5)*step<=xs[k+1][0]; c++) out.push(c, r);
    }
  }
  return out;
}
const bounds = (rings) => {
  const pts = rings.flat();
  return [Math.min(...pts.map(p=>p[0])), Math.max(...pts.map(p=>p[0])), Math.min(...pts.map(p=>p[1])), Math.max(...pts.map(p=>p[1]))];
};
const turnOf = (deg) => { const a = deg*Math.PI/180; return [Math.cos(a), Math.sin(a)]; };
const transform = ([c,s], x, y, p) => [c*p[0]-s*p[1]+x, s*p[0]+c*p[1]+y];
const normDeg = (a) => ((a%360)+360)%360;
const angleBetween = (a, b) => { const d = Math.abs(normDeg(a)-normDeg(b)); return Math.min(d, 360-d); };
/* Whether a branch pointing `dir` can join the branches already at a joint. */
const splays = (members, dir) => members.every(m => angleBetween(m.dir, dir)>=MIN_SPLAY);

/* Convex hull of a point list, counter-clockwise (monotone chain). */
function convexHull(points){
  const ps = [...points].sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  const cross = (o,a,b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
  const half = (list) => {
    const h = [];
    for(const q of list){
      while(h.length>=2 && cross(h[h.length-2], h[h.length-1], q)<=0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  return [...half(ps), ...half(ps.reverse())];
}

/* What the engine needs of a plate's shape, worked out once on first use. */
const shapes = new WeakMap();
function shapeOf(p){
  if(shapes.has(p)) return shapes.get(p);
  const rings = parseRings(p.d);
  const [x0,x1,y0,y1] = bounds(rings);
  const cells = fill(rings, p.rule, SAMPLE, x0, x1, y0, y1);
  const samples = new Float64Array(cells.length);
  for(let i=0; i<cells.length; i++) samples[i] = (cells[i]+0.5)*SAMPLE;
  /* For each connection point, the samples nearest it first: where a join
     collides with the metal already there, it does so around the joint, so a
     fit test in this order rejects a bad pose in a handful of samples. */
  const n = samples.length/2;
  const nearest = p.points.map(([px, py]) => {
    const d = new Float64Array(n);
    for(let i=0; i<n; i++) d[i] = Math.hypot(samples[2*i]-px, samples[2*i+1]-py);
    return Int32Array.from({length:n}, (_, i) => i).sort((a, b) => d[a]-d[b]);
  });
  const pairs = [];
  for(let a=0; a<p.points.length; a++) for(let b=0; b<p.points.length; b++){
    if(a!==b) pairs.push([a, b, Math.hypot(p.points[b][0]-p.points[a][0], p.points[b][1]-p.points[a][1])]);
  }
  const hull = convexHull(rings.flat());
  const radius = Math.max(...p.points.flatMap(([px, py]) => hull.map(v => Math.hypot(v[0]-px, v[1]-py))));
  /* For each connection point on the hull, the directions it can face a
     line in and still be the first of the plate to touch it: those between
     its two hull edges' outward normals, as [middle, half-width]. null for a
     point inside the hull. */
  const [hx, hy] = [hull.reduce((a,v) => a+v[0], 0)/hull.length, hull.reduce((a,v) => a+v[1], 0)/hull.length];
  const outward = (a, b) => {
    let nx = b[1]-a[1], ny = a[0]-b[0];
    if(nx*((a[0]+b[0])/2-hx) + ny*((a[1]+b[1])/2-hy) < 0){ nx = -nx; ny = -ny; }
    const l = Math.hypot(nx, ny);
    return [nx/l, ny/l];
  };
  const faces = p.points.map(([px, py]) => {
    const i = hull.findIndex(v => Math.hypot(v[0]-px, v[1]-py)<=JOIN_TOL);
    if(i<0) return null;
    const v = hull[i], n1 = outward(hull[(i-1+hull.length)%hull.length], v), n2 = outward(v, hull[(i+1)%hull.length]);
    const half = Math.acos(Math.max(-1, Math.min(1, n1[0]*n2[0]+n1[1]*n2[1])))*90/Math.PI;
    return [normDeg(Math.atan2(n1[0]+n2[0], -(n1[1]+n2[1]))*180/Math.PI), half];
  });
  const shape = {rings, samples, nearest, pairs, hull, radius, faces, span: Math.max(0, ...pairs.map(q => q[2]))};
  shapes.set(p, shape);
  return shape;
}

/* Kinds of relationship, from the joints a new plate lands on. `joins` lists
   the joints with the plates already meeting there; `hops[a][b]` is the
   contact distance between two installed plates. */
function classify(joins, hops){
  if(joins.length===1){
    const k = joins[0].members.length;
    return k===1 ? 'simple attachment' : k===2 ? 'three-way junction' : 'four-way junction';
  }
  const plates = new Set(joins.flatMap(j => j.members.map(m => m.d)));
  if(plates.size>=3 || joins.some(j => j.members.length>1)) return 'cluster infill';
  const [a, b] = [...plates];
  const h = b===undefined ? 0 : hops[a][b];
  return h<=1 ? 'two-way attachment' : h>=BRIDGE_HOPS ? 'long-range bridge' : 'loop closure';
}

function createEngine(data){
  const wall = data.wall, nails = wall.nails;
  const plates = data.plates.map((p,index) => ({...p, index, norm:{}}));
  for(const [k] of DIMS){
    const r = ranks(plates.map(p => p[k]));
    plates.forEach((p,i) => { p.norm[k] = r[i]; });
  }
  const plateById = new Map(plates.map(p => [p.id, p]));

  const [pitchU, pitchY] = wall.pitch;
  const u0 = Math.min(...nails.map(n => n.u)), y0 = Math.min(...nails.map(n => n.y));
  const at = new Map(nails.map((n,i) => [n.col+':'+n.row, i]));

  /* Initial node: the nail nearest the centre of the longest wall. */
  const main = wall.walls.reduce((a,w) => w.length>a.length ? w : a);
  const centre = {u: main.u + main.length/2, y: wall.height/2};
  const dist = (a,b) => Math.hypot(a.u-b.u, a.y-b.y);
  let origin = 0;
  nails.forEach((n,i) => { if(dist(n,centre) < dist(nails[origin],centre)) origin = i; });

  /* The lines where one wall meets the next. */
  const corners = wall.walls.slice(1).map(w => w.u);
  /* Metal per inch of strip, were the whole exhibition spread evenly along it. */
  const evenFill = DAYS*plates.reduce((a,p) => a+p.area, 0)/plates.length/wall.width;

  /* The wall as an occupancy grid, one cell per SAMPLE inches. */
  const GW = Math.ceil(wall.width/SAMPLE), GH = Math.ceil(wall.height/SAMPLE);

  /* The composition so far: what is installed, the metal it covers, its
     joints, the nails taken and the contact distance between its plates. */
  function newField(){
    return {installed:[], outlines:[], occ:new Uint8Array(GW*GH), cols:new Int32Array(GW), joints:[], nails:new Set(), hops:[]};
  }

  /* The installed plate whose edge a point rests on, within JOIN_TOL, or -1. */
  function sideAt(f, x, y){
    return f.outlines.findIndex(o => x>=o.box[0]-JOIN_TOL && x<=o.box[1]+JOIN_TOL && y>=o.box[2]-JOIN_TOL && y<=o.box[3]+JOIN_TOL
      && edgeDistance(o.rings, x, y)<=JOIN_TOL);
  }

  /* Where each connection point of a plate in the given pose would land: on
     an open joint within JOIN_TOL, or failing that on the side of an
     installed plate. A side contact starts a new joint, held by that plate. */
  function joinsOf(f, plate, rot, x, y){
    const t = turnOf(rot), out = [];
    plate.points.forEach((p, point) => {
      const [wx, wy] = transform(t, x, y, p);
      let best = null, bd = JOIN_TOL;
      for(const j of f.joints){
        if(j.members.length>=MAX_JOINT) continue;
        const d = Math.hypot(j.x-wx, j.y-wy);
        if(d<=bd){ bd = d; best = j; }
      }
      if(best){ out.push({joint:best, x:best.x, y:best.y, point, members:best.members}); return; }
      const side = sideAt(f, wx, wy);
      if(side>=0) out.push({joint:null, x:wx, y:wy, point, members:[{d:side, point:null, dir:normDeg(p[2]+rot+180)}]});
    });
    return out;
  }

  /* Whether a plate fits in a pose: on one wall, off the existing metal, and
     over a free nail to hang on. Returns that nail; null if there is none and
     `carried` allows that; undefined if the pose does not fit. `point` is the
     connection point the pose was built on, `joints` the joints it lands on. */
  function fits(f, plate, rot, x, y, point, joints, carried){
    const {samples:s, nearest} = shapeOf(plate), order = nearest[point], [c, sn] = turnOf(rot);
    let hits = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for(const k of order){
      const i = 2*k, wx = c*s[i]-sn*s[i+1]+x, wy = sn*s[i]+c*s[i+1]+y;
      if(wx<minX) minX = wx; if(wx>maxX) maxX = wx; if(wy<minY) minY = wy; if(wy>maxY) maxY = wy;
      if(wy<0 || wy>=wall.height || wx<0 || wx>=wall.width) return undefined;
      if(!f.occ[Math.floor(wy/SAMPLE)*GW + Math.floor(wx/SAMPLE)]) continue;
      if(joints.some(j => Math.hypot(wx-j.x, wy-j.y)<=CONTACT)) continue;
      if(++hits>OVERLAP_TOL) return undefined;
    }
    /* A plate is flat metal: it cannot fold round a corner. */
    if(!wall.walls.some(w => minX>=w.u-JOIN_TOL && maxX<=w.u+w.length+JOIN_TOL)) return undefined;
    const rings = shapeOf(plate).rings;
    let nail = -1, depth = -NAIL_REACH;
    for(let col=Math.ceil((minX-NAIL_REACH-u0)/pitchU); u0+col*pitchU<=maxX+NAIL_REACH; col++){
      for(let row=Math.ceil((minY-NAIL_REACH-y0)/pitchY); y0+row*pitchY<=maxY+NAIL_REACH; row++){
        const i = at.get(col+':'+row);
        if(i===undefined || f.nails.has(i)) continue;
        /* The nail in the plate's own frame. */
        const dx = nails[i].u-x, dy = nails[i].y-y, lx = c*dx+sn*dy, ly = -sn*dx+c*dy;
        const m = edgeDistance(rings, lx, ly) * (inside(rings, plate.rule, lx, ly) ? 1 : -1);
        if(m>=depth){ depth = m; nail = i; }
      }
    }
    return nail>=0 ? nail : carried ? null : undefined;
  }

  /* Adds a decided plate to the composition. */
  function install(f, d){
    const v = f.installed.length, joins = joinsOf(f, d.plate, d.rotation, d.x, d.y);
    const t = turnOf(d.rotation);
    const world = shapeOf(d.plate).rings.map(r => r.map(p => transform(t, d.x, d.y, p)));
    const [x0,x1,yA,yB] = bounds(world), cells = fill(world, d.plate.rule, SAMPLE, x0, x1, yA, yB);
    f.outlines.push({rings:world, rule:d.plate.rule, box:[x0,x1,yA,yB]});
    for(let i=0; i<cells.length; i+=2){
      const col = cells[i], row = cells[i+1];
      if(col>=0 && col<GW && row>=0 && row<GH && !f.occ[row*GW+col]){ f.occ[row*GW+col] = 1; f.cols[col]++; }
    }
    const landed = new Map(joins.map(j => [j.point, j]));
    d.plate.points.forEach((p, point) => {
      const j = landed.get(point);
      const member = {d:v, point, dir:normDeg(p[2]+d.rotation)};
      if(j && j.joint) j.joint.members.push(member);
      else if(j) f.joints.push({x:j.x, y:j.y, members:[...j.members, member]});
      else { const [x, y] = transform(t, d.x, d.y, p); f.joints.push({x, y, members:[member]}); }
    });
    if(d.touch) f.joints.push({x:d.touch.x, y:d.touch.y, corner:true, members:[{d:v, point:null, dir:d.touch.dir}]});
    if(d.nail!==null) f.nails.add(d.nail);
    /* Contact distances: one more than the nearest touched plate's, then any
       pair that is now closer through the new plate. */
    const touched = [...new Set(joins.flatMap(j => j.members.filter(m => m.d!==v).map(m => m.d)))];
    const row = f.installed.map((_, x) => touched.length ? 1 + Math.min(...touched.map(u => f.hops[u][x])) : Infinity);
    f.hops.forEach((r, x) => r.push(row[x]));
    f.hops.push([...row, 0]);
    for(let a=0; a<v; a++) for(let b=0; b<v; b++){
      if(f.hops[a][v]+f.hops[v][b] < f.hops[a][b]) f.hops[a][b] = f.hops[a][v]+f.hops[v][b];
    }
    f.installed.push(d);
  }

  /* Whether a joint can still take a branch: some direction a new plate's
     body could leave it in, splayed from the branches there, is not already
     covered by metal PROBE inches out. Metal is never removed, so a closed
     joint stays closed. */
  function isOpen(f, j){
    if(j.closed || j.members.length>=MAX_JOINT) return false;
    for(let d=0; d<360; d+=30){
      if(!splays(j.members, d+180)) continue;
      const a = d*Math.PI/180, px = j.x+Math.sin(a)*PROBE, py = j.y-Math.cos(a)*PROBE;
      if(px<0 || px>=wall.width || py<0 || py>=wall.height) continue;
      if(!f.occ[Math.floor(py/SAMPLE)*GW + Math.floor(px/SAMPLE)]) return true;
    }
    j.closed = true;
    return false;
  }

  /* Places along the sides of installed plates where a new plate's point
     could rest with open wall beyond: the last resort when no branch end can
     take a plate. Each is a joint held by that plate, facing straight out
     from its edge. */
  function sideJoints(f){
    const out = [];
    f.outlines.forEach((o, d) => {
      for(const ring of o.rings){
        let carry = SIDE_STEP/2;
        for(let i=0; i<ring.length; i++){
          const [ax, ay] = ring[i], [bx, by] = ring[(i+1)%ring.length], len = Math.hypot(bx-ax, by-ay);
          for(; carry<len; carry+=SIDE_STEP){
            const x = ax+(bx-ax)*carry/len, y = ay+(by-ay)*carry/len;
            let nx = (by-ay)/len, ny = -(bx-ax)/len;
            if(inside(o.rings, o.rule, x+nx*0.1, y+ny*0.1)){ nx = -nx; ny = -ny; }
            const px = x+nx*PROBE, py = y+ny*PROBE;
            if(px<0 || px>=wall.width || py<0 || py>=wall.height || f.occ[Math.floor(py/SAMPLE)*GW + Math.floor(px/SAMPLE)]) continue;
            out.push({x, y, members:[{d, point:null, dir:normDeg(Math.atan2(nx, -ny)*180/Math.PI)}]});
          }
          carry -= len;
        }
      }
    });
    return out;
  }

  /* Joins at a corner, where the composition crosses onto the next wall. A
     plate pinned to a joint by one of its points turns until its metal just
     touches the corner line, and that touch becomes a joint on the line. A
     plate on the next wall meets such a joint with a branch pointing straight
     into the corner. */
  function cornerJoins(plate, open){
    const pts = plate.points, {hull, radius, faces} = shapeOf(plate), out = [];
    for(const a of open){
      if(a.corner){
        for(const dir of [90, 270]) pts.forEach((p, point) => {
          if(faces[point]===null || !splays(a.members, dir)) return;
          const [mid, half] = faces[point];
          for(let off=-Math.floor((half-FACE_MARGIN)/FACE_STEP)*FACE_STEP; off<=half-FACE_MARGIN; off+=FACE_STEP){
            const rot = normDeg(dir-mid+off);
            const [px, py] = transform(turnOf(rot), 0, 0, p);
            out.push({rot, point, x:a.x-px, y:a.y-py, joins:[a]});
          }
        });
        continue;
      }
      for(const c of corners){
        const gap = Math.abs(c-a.x), side = Math.sign(c-a.x);
        if(gap>radius) continue;
        pts.forEach((p, point) => {
          /* How far the metal reaches toward the corner from the joint, and
             the hull vertex that reaches it, with the plate turned `deg`. */
          const reachAt = (deg) => {
            const [co, sn] = turnOf(deg);
            let best = -Infinity, at = null;
            for(const v of hull){
              const x = side*(co*(v[0]-p[0])-sn*(v[1]-p[1]));
              if(x>best){ best = x; at = v; }
            }
            return [best-gap, at];
          };
          let prev = reachAt(0)[0];
          for(let deg=1; deg<=360; deg++){
            const cur = reachAt(deg)[0];
            if((prev<0) !== (cur<0)){
              let lo = deg-1, hi = deg;
              for(let k=0; k<20; k++){ const mid = (lo+hi)/2; if((reachAt(mid)[0]<0) === (prev<0)) lo = mid; else hi = mid; }
              const rot = normDeg(lo), t = turnOf(rot);
              if(splays(a.members, p[2]+rot)){
                const [px, py] = transform(t, 0, 0, p), x = a.x-px, y = a.y-py;
                const [, ty] = transform(t, x, y, reachAt(lo)[1]);
                out.push({rot, point, x, y, joins:[a], touch:{x:c, y:ty, dir:side>0 ? 90 : 270}});
              }
            }
            prev = cur;
          }
        });
      }
    }
    return out;
  }

  /* Every way the plate can join the composition: one of its points on an
     open joint at the given rotations, and with `pairs` two of its points on
     two joints at once, whatever rotation that takes. With `sides`, one of
     its points on the side of a plate instead. */
  function joinsFor(f, plate, rotations, {sides, pairs:withPairs}){
    const pts = plate.points, out = [];
    const open = sides ? sideJoints(f) : f.joints.filter(j => isOpen(f, j));
    for(const rot of rotations){
      const t = turnOf(rot);
      for(const j of open) pts.forEach((p, point) => {
        if(!splays(j.members, p[2]+rot)) return;
        const [px, py] = transform(t, 0, 0, p);
        out.push({rot, point, x:j.x-px, y:j.y-py, joins:[j]});
      });
    }
    if(sides || !withPairs) return out;
    /* Pairs of joints no farther apart than the plate's own points can reach,
       found by sweeping the joints in order across the wall. Each unordered
       pair once: the ordered point pairs cover both ways round. */
    const {pairs, span} = shapeOf(plate), reach = span+JOIN_TOL;
    open.sort((a, b) => a.x-b.x || a.y-b.y);
    for(let i=0; i<open.length; i++) for(let k=i+1; k<open.length && open[k].x-open[i].x<=reach; k++){
      const a = open[i], b = open[k];
      const dj = Math.hypot(b.x-a.x, b.y-a.y);
      if(dj>reach) continue;
      for(const [pa, pb, dp] of pairs){
        if(Math.abs(dp-dj)>JOIN_TOL) continue;
        const A = pts[pa], B = pts[pb];
        const rot = normDeg((Math.atan2(b.y-a.y, b.x-a.x) - Math.atan2(B[1]-A[1], B[0]-A[0]))*180/Math.PI);
        if(!splays(a.members, A[2]+rot) || !splays(b.members, B[2]+rot)) continue;
        const [px, py] = transform(turnOf(rot), 0, 0, A);
        out.push({rot, point:pa, x:a.x-px, y:a.y-py, joins:[a, b]});
      }
    }
    out.push(...cornerJoins(plate, open));
    return out;
  }

  /* The best permitted pose for the plate, or null. Joins are ranked by cost
     and tested for fit in that order, so only the winner and the ones that
     lost to an obstruction are ever fitted. */
  function placeOn(f, plate, reading, accept, {carried, sides}){
    const inst = f.installed;
    const cu = inst.reduce((a,d) => a+d.x, 0)/inst.length;
    const cy = inst.reduce((a,d) => a+d.y, 0)/inst.length;
    const near = (c) => Math.max(Math.abs(c.x-inst[0].x)/pitchU, Math.abs(c.y-inst[0].y)/pitchY);
    /* Crossings already under way: touches still waiting for the next wall's
       plate, and those that have it. */
    const crossing = f.joints.filter(j => j.corner && (j.members.length>1 || isOpen(f, j)));
    /* Metal along the strip: `metal[k]` is the area left of column k. */
    const metal = new Float64Array(GW+1);
    for(let i=0; i<GW; i++) metal[i+1] = metal[i]+f.cols[i]*SAMPLE*SAMPLE;
    const metalIn = (u0, u1) => {
      const a = Math.max(0, Math.min(GW, Math.floor(u0/SAMPLE))), b = Math.max(0, Math.min(GW, Math.ceil(u1/SAMPLE)));
      return [metal[b]-metal[a], Math.max(SAMPLE, (b-a)*SAMPLE)];
    };
    /* The reading's own orientation and the two-point joins first; every
       orientation only if none of those fits. */
    for(const [rotations, pairs] of [[[reading.rotation], true], [ROTATIONS, false]]){
      const cands = joinsFor(f, plate, rotations, {sides, pairs})
        .filter(c => { c.kind = classify(c.joins, f.hops); return accept(c.kind, near(c)); });
      if(!cands.length) continue;
      let far = 0, crowd = 0, owed = 0;
      for(const c of cands){
        far = Math.max(far, Math.hypot(c.x-cu, c.y-cy));
        /* A touch with no crossing near it opens the next wall, and the room
           it makes is over there. */
        c.opens = !!c.touch && !crossing.some(j => j.x===c.touch.x && j.members[0].dir===c.touch.dir && Math.abs(j.y-c.touch.y)<CORNER_SPACING);
        const u = c.opens ? c.touch.x + (c.touch.dir===90 ? ROOM_BAND : -ROOM_BAND) : c.x;
        const [area, width] = metalIn(u-ROOM_BAND, u+ROOM_BAND);
        c.crowd = area/width;
        /* Strip left beyond the pose, outward from the composition, less the
           strip the metal already there would cover spread evenly. */
        const [beyond, length] = c.x>=cu ? metalIn(c.x, wall.width) : metalIn(0, c.x);
        c.owed = Math.max(0, length - beyond/evenFill);
        crowd = Math.max(crowd, c.crowd); owed = Math.max(owed, c.owed);
      }
      far = far || 1; crowd = crowd || 1; owed = owed || 1;
      for(const c of cands){
        const du = c.x-cu, dy = c.y-cy;
        const heading = (Math.atan2(du,-dy)*180/Math.PI + 360) % 360;   // clockwise from up
        c.cost = W_REACH*Math.abs(reading.energy-Math.hypot(du,dy)/far)
          + W_BIAS*angleBetween(heading, reading.params.bias)/180
          + W_TURN*angleBetween(c.rot, reading.rotation)/180
          + W_KIND*Math.abs(reading.energy-DENSITY[c.kind])
          + W_ROOM*c.crowd/crowd
          + W_OWED*(1 - c.owed/owed);
      }
      cands.sort((a,b) => a.cost-b.cost);
      for(const c of cands){
        const nail = fits(f, plate, c.rot, c.x, c.y, c.point, c.joins, carried || c.opens);
        if(nail===undefined) continue;
        /* A pose can land more points than it was built on; judge what it really makes. */
        const joins = joinsOf(f, plate, c.rot, c.x, c.y);
        const kind = classify(joins, f.hops);
        if(!accept(kind, near(c))) continue;
        return {rotation:c.rot, x:c.x, y:c.y, nail, joins, kind, touch:c.touch || null, options:cands.length};
      }
    }
    return null;
  }

  /* One day's decision, given the composition so far. */
  function decide(hex, f){
    const installed = f.installed, day = installed.length + 1;
    if(day > DAYS) throw new Error('The exhibition has only '+DAYS+' open days.');
    const reading = read(hex), phase = phaseOf(day);

    /* Family from the hue sector. If that family is exhausted, the next
       sector round the wheel that still has plates stands in. */
    const used = new Set(installed.map(d => d.plate.id));
    const first = SECTORS.indexOf(reading.sector);
    let fam = reading.sector.fam, pool = [];
    for(let k=0;k<SECTORS.length && !pool.length;k++){
      fam = SECTORS[(first+k)%SECTORS.length].fam;
      pool = plates.filter(p => p.family===fam && !used.has(p.id));
    }
    const scored = pool.map(p => {
      let d2 = 0;
      for(const [k,,w] of DIMS){ const e = p.norm[k]-reading.target[k]; d2 += w*e*e; }
      return {plate:p, score:100*(1-Math.sqrt(d2/WSUM))};
    }).sort((a,b) => b.score-a.score || a.plate.index-b.plate.index);

    const pick = scored[0];
    let spot = null, blocked = false;
    if(!installed.length){
      /* The first plate hangs on the initial node by its hang point. */
      const [px, py] = transform(turnOf(reading.rotation), 0, 0, pick.plate.hang);
      spot = {rotation:reading.rotation, x:nails[origin].u-px, y:nails[origin].y-py, nail:origin,
              joins:[], kind:'initial node', touch:null, options:1};
    } else {
      const allowed = new Set(permittedKinds(phase));
      const permitted = (kind, near) => allowed.has(kind) && (phase.n>1 || near<=NEAR_RADIUS);
      /* Every open day must install its plate, so when the rules leave
         nowhere to go they give way in turn: first the phase's relationships
         (any join is taken), then the nail (the plate is carried by its
         joints), then the branch ends (a point rests on a plate's side). */
      const anyJoin = (kind) => kind!=='long-range bridge';
      const MODES = [{carried:false, sides:false}, {carried:true, sides:false}, {carried:true, sides:true}];
      for(const mode of MODES){
        spot = placeOn(f, pick.plate, reading, permitted, mode);
        blocked = mode!==MODES[0];
        if(!spot){ spot = placeOn(f, pick.plate, reading, anyJoin, mode); blocked = true; }
        if(spot) break;
      }
      if(!spot) throw new Error('Day '+day+': plate '+pick.plate.id+' fits nowhere on the wall.');
    }

    const joins = spot.joins.map(j => ({
      x:j.x, y:j.y, point:j.point,
      with:j.members.map(m => ({decision:installed[m.d], point:m.point}))
    }));
    const touching = [...new Set(joins.flatMap(j => j.with.map(w => w.decision)))].sort((a,b) => a.day-b.day);
    const names = touching.map(d => d.plate.id);
    const list = names.length>1 ? names.slice(0,-1).join(', ')+' and '+names[names.length-1] : names[0];
    const kind = spot.kind;
    const relation = kind==='initial node' ? 'initial node, the first plate of the composition'
      : kind==='simple attachment' ? 'simple attachment to Plate '+list
      : kind==='two-way attachment' ? (names.length>1 ? 'two-way attachment to Plates '+list : 'two-way attachment to Plate '+list+' at two points')
      : kind==='three-way junction' || kind==='four-way junction' ? kind+' with Plates '+list
      : kind==='loop closure' ? 'loop closure joining Plates '+list
      : kind==='cluster infill' ? 'cluster infill among Plates '+list
      : 'long-range bridge between Plates '+list;
    const across = spot.joins.some(j => j.joint && j.joint.corner);
    const corner = spot.touch ? ', touching the corner' : across ? ', across the corner' : '';

    return {
      day, date: openDayDate(day), reading, phase,
      family: pick.plate.family, familyRequested: reading.sector.fam,
      scored, plate: pick.plate, score: pick.score,
      x: spot.x, y: spot.y, rotation: spot.rotation, nail: spot.nail, touch: spot.touch,
      joins, touching, parent: touching[0] || null,
      kind, relation: relation+corner, options: spot.options, blocked,
      installedBefore: installed.length
    };
  }

  /* The Growth Field after each of the given daily readings. Decisions
     already made for the first days can be passed in as `kept` and are
     reinstalled rather than decided again. */
  function grow(readings, kept){
    const f = newField(), out = [];
    for(const d of (kept || [])){ install(f, d); out.push(d); }
    for(const hex of readings.slice(out.length)){
      const d = decide(hex, f);
      install(f, d); out.push(d);
    }
    return out;
  }

  return {wall, nails, plates, plateById, origin, grow};
}

root.Ouijatari = {
  DAYS, SECTORS, PHASES, DIMS, NEAR_RADIUS,
  hexToRgb, rgbToHex, rgbToHsv, hsvToRgb,
  read, seedReadings, phaseOf, permittedKinds, openDayDate, createEngine
};
})(typeof window !== 'undefined' ? window : globalThis);
