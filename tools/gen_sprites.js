#!/usr/bin/env node
// Authoring source for the Bark Party story-mode sprites. Each sprite below is drawn by hand as
// SVG shapes in WORLD units (viewBox = world size); this script writes them to art/svg/<name>.svg
// at 3 px per world unit. Run tools/render_sprites.js afterwards to rasterize to PNG.
//
// Style: Dog Better look. Flat cartoon, warm palette, one cel-shade tone per colour, thick warm
// dark-brown outline (#2B1F1A) around each silhouette, thinner inner detail lines.
// All characters face RIGHT and stand on the bottom edge (minus ~1 unit padding).
const fs = require('fs');
const path = require('path');

const OUT = '#2B1F1A';
const WH = '#FFFFFF';
const PX = 3;
const C = {
  sq: '#C8662E', sqS: '#A24E22', cream: '#F8E8CB', creamS: '#E8CDA2', mask: '#5A392B',
  nose: '#3F2A22', pink: '#FF9DB8', gum: '#FF5A8A', gumS: '#DE3F6F', gold: '#FFB020', goldS: '#DB8A0C',
  purple: '#7B5CFF', purpleS: '#5C40DB', mouth: '#8E3B3B', tongue: '#FF7C9C', star: '#FFD23F', starS: '#F2A62A',
  wood: '#C98B55', woodS: '#A9703F', woodD: '#8A5734', brass: '#E2AA45', brassS: '#BE8A2E',
  terra: '#CF6E48', terraS: '#AD5537', mustard: '#E6A847', mustardS: '#C8892E',
  sky: '#5BB8F0', skyS: '#3F97D1', mint: '#5FCF9E', mintS: '#43AD7F', lav: '#9C7EFF', lavS: '#7D5FE0',
  red: '#EC5B4E', redS: '#C9443A', blue: '#4C8FE6', blueS: '#3772C4', green: '#58B86C', greenS: '#3F9853',
  leaf: '#6DBA5F', leafS: '#4F9A47', cat: '#A0948D', catS: '#837670', catL: '#EADFD6',
  vac: '#7F90A8', vacS: '#66768D', vacL: '#BAC5D4', kraft: '#CC9C62', kraftS: '#AC7E48', dust: '#F0E5D3', dustS: '#D9C7AC',
};

let X; // current drawing context
const r2 = (n) => Math.round(n * 100) / 100;
function attrs(o) {
  return Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}="${typeof v === 'number' ? r2(v) : v}"`)
    .join(' ');
}
function el(sh, extra = {}) {
  const { t, ...p } = sh;
  return `<${t} ${attrs({ ...p, ...extra })}/>`;
}
const E = (cx, cy, rx, ry, rot) => ({ t: 'ellipse', cx, cy, rx, ry, transform: rot ? `rotate(${rot} ${cx} ${cy})` : undefined });
const Ci = (cx, cy, r) => ({ t: 'circle', cx, cy, r });
const P = (d) => ({ t: 'path', d });
const R = (x, y, width, height, rx = 0, rot) => ({ t: 'rect', x, y, width, height, rx, transform: rot ? `rotate(${rot} ${x + width / 2} ${y + height / 2})` : undefined });

// A filled silhouette (one or more merged shapes) with outline and optional single cel shade.
// Shade = darker crescent on the lower-left (light from upper right). `extra` is drawn clipped inside.
function blob(shapes, fill, shade, o = {}) {
  if (!Array.isArray(shapes)) shapes = [shapes];
  const O = o.O ?? X.O;
  let s = '';
  if (O > 0) s += shapes.map((sh) => el(sh, { fill: OUT, stroke: OUT, 'stroke-width': 2 * O, 'stroke-linejoin': 'round' })).join('');
  s += shapes.map((sh) => el(sh, { fill })).join('');
  if (shade || o.extra) {
    const id = 'k' + X.id++;
    X.defs.push(`<clipPath id="${id}">${shapes.map((sh) => el(sh)).join('')}</clipPath>`);
    s += `<g clip-path="url(#${id})">`;
    if (shade) {
      const so = o.so ?? X.so;
      const [dx, dy] = o.off || [so, -so];
      s += `<rect x="-2000" y="-2000" width="5000" height="5000" fill="${shade}"/><g transform="translate(${r2(dx)} ${r2(dy)})">${shapes
        .map((sh) => el(sh, { fill }))
        .join('')}</g>`;
    }
    if (o.extra) s += o.extra;
    s += '</g>';
  }
  return o.tf ? `<g transform="${o.tf}">${s}</g>` : s;
}
// Detail line (thinner than the outline).
function ln(d, w = 0.55, color = OUT) {
  const sw = typeof w === 'number' && w < 5 ? w * X.O : w;
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${r2(sw)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
// Round-capped thick stroke shapes (limbs, bars) merged with one outline pass.
function strokes(ds, w, color, o = {}) {
  const O = o.O ?? X.O;
  const base = { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  let s = ds.map((d) => `<path ${attrs({ d, ...base, stroke: OUT, 'stroke-width': w + 2 * O })}/>`).join('');
  s += ds.map((d) => `<path ${attrs({ d, ...base, stroke: color, 'stroke-width': w })}/>`).join('');
  return s;
}
function eyeDot(x, y, r) {
  return `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="${OUT}"/><circle cx="${r2(x + r * 0.32)}" cy="${r2(y - r * 0.38)}" r="${r2(r * 0.38)}" fill="${WH}"/>`;
}
function starPath(cx, cy, Ro, Ri, rot = -90) {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const a = ((rot + i * 36) * Math.PI) / 180;
    const rr = i % 2 ? Ri : Ro;
    p.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  return 'M' + p.map((q) => q.map(r2).join(' ')).join(' L') + ' Z';
}
function star(cx, cy, Ro, o = {}) {
  return blob(P(starPath(cx, cy, Ro, Ro * 0.48, o.rot ?? -90)), C.star, C.starS, { O: o.O, so: Ro * 0.18 });
}
function heartPath(cx, cy, s) {
  const k = (a, b) => `${r2(cx + a * s)} ${r2(cy + b * s)}`;
  return `M${k(0, 0.92)} C${k(-0.25, 0.72)} ${k(-1, 0.3)} ${k(-1, -0.25)} C${k(-1, -0.78)} ${k(-0.42, -1.02)} ${k(0, -0.55)} C${k(0.42, -1.02)} ${k(1, -0.78)} ${k(1, -0.25)} C${k(1, 0.3)} ${k(0.25, 0.72)} ${k(0, 0.92)} Z`;
}
function spiral(x, y, s, w = 0.45) {
  // little dizzy swirl eye
  return ln(
    `M${r2(x)} ${r2(y)} a${r2(0.5 * s)} ${r2(0.5 * s)} 0 1 1 ${r2(1 * s)} 0 a${r2(1 * s)} ${r2(1 * s)} 0 1 1 ${r2(-2 * s)} 0 a${r2(1.5 * s)} ${r2(1.5 * s)} 0 1 1 ${r2(3 * s)} 0`,
    w,
  );
}
function text(str, x, y, size, fill, o = {}) {
  const sw = o.sw ?? X.O * 1.6;
  return `<text x="${r2(x)}" y="${r2(y)}" font-family="'Bagel Fat One', 'Arial Black', sans-serif" font-size="${r2(size)}" text-anchor="${o.anchor || 'middle'}" fill="${fill}" stroke="${OUT}" stroke-width="${r2(sw)}" stroke-linejoin="round" paint-order="stroke" ${o.ls ? `letter-spacing="${o.ls}"` : ''} ${o.tf ? `transform="${o.tf}"` : ''}>${str}</text>`;
}

// ---------------------------------------------------------------- squirrels
// Tail drawn in local coords: base at origin, plume rising up and to the left, curl at the top.
const TAIL = 'M3 2 C-10 5 -17.5 -6 -16.5 -18 C-15.5 -30 -6.5 -38.5 3 -37.5 C10.5 -36.5 11.5 -27.5 6 -25.5 C2 -24 -0.5 -28 2 -30 C-3.5 -29.5 -6.5 -22 -5.5 -15 C-4.5 -8 1 -4.5 7 -4.5 Z';
function tail(x, y, rot, s, o = {}) {
  const O = X.O / s;
  let g = blob(P(TAIL), C.sq, C.sqS, { O, so: 2.2, off: [2.2, -1.4] });
  g += ln('M-12.5 -12 Q-10.5 -14.5 -8 -13.5', 0.5 * X.O / s);
  g += ln('M-11.5 -25 Q-9 -27.5 -6 -26.5', 0.5 * X.O / s);
  g += ln('M-1.5 -33.5 Q1.5 -34.5 3.5 -33', 0.5 * X.O / s);
  return `<g transform="translate(${r2(x)} ${r2(y)}) rotate(${r2(rot)}) scale(${s})">${g}</g>`;
}
const DROOPY_TAIL = 'M26 45.2 C17 46.5 5 46.5 2.5 41.5 C0.5 37 4.5 33 9 34.5 C12.5 35.5 12.5 39.5 9.5 39.8 C12 41.5 17 41 26 39.5 Z';

// Squirrel / boss head in head-local coords (centre of skull at origin, facing right).
function sqHead(x, y, rot, s, f = {}) {
  const O = X.O / s;
  const so = 1.2;
  let g = '';
  g += blob(P('M-5.5 -4.5 Q-7.5 -14 -2.5 -13 Q-0.5 -10 -0.5 -5.5 Z'), C.sqS, null, { O });
  g += blob(P('M-2.2 -6 Q-2.6 -15.8 2.8 -14.2 Q4.8 -10.5 3.6 -5.6 Z'), C.sq, C.sqS, {
    O, so: 0.9,
    extra: `<path d="M-0.4 -7.4 Q-0.5 -12.6 2 -12 Q3.1 -10 2.4 -7.2Z" fill="${C.pink}"/>`,
  });
  // tufts on cheek
  g += blob([Ci(0, 0, 8.5), E(6, 2.3, 5.2, 4)], C.sq, C.sqS, {
    O, so,
    extra:
      `<ellipse cx="7" cy="4.6" rx="4.6" ry="2.6" fill="${C.cream}"/><ellipse cx="0.5" cy="7.6" rx="5.5" ry="2.6" fill="${C.cream}"/>`,
  });
  g += ln('M-8.3 1.6 L-9.8 2.6 L-8.2 3.4', 0.55 * X.O / s);
  if (f.mask !== false) {
    // bandit mask with knot tails behind the head
    g += blob(P('M-7.2 -3.2 L-11.6 -5.8 L-10.4 -1.8 L-12 1 L-7.4 -0.6 Z'), C.mask, null, { O: O * 0.75 });
    g += blob(
      P('M-8 -3.4 C-4 -6 4 -6.6 8.9 -2.8 C9.3 0 6.6 1.4 4.6 0.8 C3 0.3 1.6 0.6 0.2 1.2 C-3 2.4 -6.2 1.6 -8 -0.6 Z'),
      C.mask, null, { O: O * 0.75 },
    );
  }
  const ex = 3.8, ey = -2.1;
  const eyes = f.eyes || 'normal';
  if (eyes === 'normal' || eyes === 'smug' || eyes === 'wide') {
    const ry = eyes === 'wide' ? 2.6 : 2.25;
    g += `<ellipse cx="${ex}" cy="${ey}" rx="2.05" ry="${ry}" fill="${WH}" stroke="${OUT}" stroke-width="${r2(0.4 * X.O / s)}"/>`;
    g += eyeDot(ex + 0.5, ey + 0.25, eyes === 'wide' ? 1.1 : 1.3);
    if (eyes === 'smug') {
      // heavy lid: smug half-closed eye
      g += `<path d="M${ex - 2.4} ${ey - 0.2} Q${ex} ${ey - 3.2} ${ex + 2.4} ${ey - 0.6} L${ex + 2.4} ${ey - 3} L${ex - 2.4} ${ey - 3} Z" fill="${f.mask === false ? C.sq : C.mask}"/>`;
      g += ln(`M${ex - 2.3} ${ey - 0.1} Q${ex} ${ey - 0.9} ${ex + 2.4} ${ey - 0.5}`, 0.55 * X.O / s);
    }
  } else if (eyes === 'swirl') {
    g += `<circle cx="${ex}" cy="${ey}" r="2.9" fill="${WH}" stroke="${OUT}" stroke-width="${r2(0.4 * X.O / s)}"/>`;
    g += spiral(ex - 0.4, ey, 1.05, 0.3 * X.O / s);
  } else if (eyes === 'squeeze') {
    g += ln(`M${ex - 1.8} ${ey - 1.8} L${ex + 1.2} ${ey} L${ex - 1.8} ${ey + 1.6}`, 0.7 * X.O / s, f.mask === false ? OUT : WH);
  }
  // brow
  if (f.brow === 'angry') g += ln('M1 -6.8 Q3.8 -5.6 6.8 -4.2', 0.6 * X.O / s);
  else if (f.brow === 'worried') g += ln('M1.2 -5 Q4 -7.4 6.6 -7', 0.6 * X.O / s);
  else if (f.brow !== 'none') g += ln('M1.3 -6.6 Q3.9 -8.2 6.7 -6', 0.6 * X.O / s);
  // nose
  g += `<ellipse cx="11" cy="0.9" rx="1.65" ry="1.3" fill="${C.nose}"/><ellipse cx="11.3" cy="0.4" rx="0.55" ry="0.35" fill="${WH}"/>`;
  const m = f.mouth || 'grin';
  if (m === 'grin') {
    g += `<rect x="8.4" y="5.3" width="1.6" height="1.9" rx="0.3" fill="${WH}" stroke="${OUT}" stroke-width="${r2(0.35 * X.O / s)}"/>`;
    g += ln('M5.6 4.2 Q6.6 5.6 7.4 5.4 Q9.4 6.8 11.2 3.4', 0.55 * X.O / s);
  } else if (m === 'smirk') {
    g += ln('M6.2 5.4 Q8.8 6 11.2 3.2', 0.55 * X.O / s);
    g += ln('M10.6 2.6 Q11.8 3.2 11.6 4.4', 0.45 * X.O / s);
  } else if (m === 'open') {
    g += `<path d="M6 4.2 Q8.6 9.6 11.4 3.6 Z" fill="${C.mouth}" stroke="${OUT}" stroke-width="${r2(0.5 * X.O / s)}" stroke-linejoin="round"/>`;
    g += `<path d="M7.6 6.6 Q9.2 5.6 10.4 6.6 Q9.2 8.2 7.6 6.6Z" fill="${C.tongue}"/>`;
    g += `<rect x="8.3" y="3.9" width="1.5" height="1.5" rx="0.3" fill="${WH}" stroke="${OUT}" stroke-width="${r2(0.3 * X.O / s)}"/>`;
  } else if (m === 'tongue') {
    g += ln('M6 5 Q7.4 4.2 8.6 5.2 Q9.8 4.2 11 4.2', 0.55 * X.O / s);
    g += `<path d="M8.2 5.2 Q8.2 8.6 9.6 8.4 Q10.8 8.2 10.2 4.8 Z" fill="${C.tongue}" stroke="${OUT}" stroke-width="${r2(0.45 * X.O / s)}" stroke-linejoin="round"/>`;
  } else if (m === 'o') {
    g += `<ellipse cx="8.9" cy="5.6" rx="1.4" ry="1.7" fill="${C.mouth}" stroke="${OUT}" stroke-width="${r2(0.5 * X.O / s)}"/>`;
  }
  if (f.monocle) {
    g += ln(`M${ex + 0.4} ${ey + 3.2} C${ex + 1.4} 7 -2 9 -1 14`, 0.4 * X.O / s, C.goldS);
    g += `<circle cx="${ex + 0.2}" cy="${ey + 0.1}" r="3.1" fill="#DFF4FF" fill-opacity="0.18"/>`;
    g += strokes([`M${ex + 0.2 - 3.1} ${ey + 0.1} a3.1 3.1 0 1 0 6.2 0 a3.1 3.1 0 1 0 -6.2 0`], 0.75, C.gold, { O: 0.38 * X.O / s });
    g += `<path d="M${ex + 1.2} ${ey - 2.2} q1.2 0.4 1.6 1.6" fill="none" stroke="${WH}" stroke-width="0.35" stroke-linecap="round"/>`;
  }
  if (f.crown) g += f.crown;
  return `<g transform="translate(${r2(x)} ${r2(y)}) rotate(${r2(rot)}) scale(${s})">${g}</g>`;
}
function crownLocal(cx0, cy0, rot0, O0, k = 1) {
  const cx = 0, cy = 0, rot = 0, O = O0 / k;
  const d = `M${cx - 4.2} ${cy + 2.2} L${cx - 4.8} ${cy - 3} L${cx - 2.2} ${cy - 0.6} L${cx} ${cy - 4.2} L${cx + 2.2} ${cy - 0.6} L${cx + 4.8} ${cy - 3} L${cx + 4.2} ${cy + 2.2} Z`;
  let g = blob(P(d), C.gold, C.goldS, { O, so: 0.6 });
  g += `<circle cx="${cx}" cy="${cy + 0.6}" r="0.9" fill="${C.gum}" stroke="${OUT}" stroke-width="${r2(O * 0.5)}"/>`;
  g += `<circle cx="${cx - 4.8}" cy="${cy - 3.2}" r="0.7" fill="${C.gold}" stroke="${OUT}" stroke-width="${r2(O * 0.5)}"/>`;
  g += `<circle cx="${cx + 4.8}" cy="${cy - 3.2}" r="0.7" fill="${C.gold}" stroke="${OUT}" stroke-width="${r2(O * 0.5)}"/>`;
  g += `<circle cx="${cx}" cy="${cy - 4.4}" r="0.7" fill="${C.gold}" stroke="${OUT}" stroke-width="${r2(O * 0.5)}"/>`;
  return `<g transform="translate(${cx0} ${cy0}) rotate(${rot0}) scale(${k})">${g}</g>`;
}
function acornAt(x, y, s, golden) {
  const O = 1.1 / s;
  const nut = golden ? C.gold : '#CF8E4E', nutS = golden ? C.goldS : '#AE6F36';
  const cap = golden ? '#E39A1A' : '#7E4E2C', capS = golden ? '#B87510' : '#62391F';
  let g = strokes(['M0 -5.6 Q0.6 -7.2 2 -7.6'], 1.3, cap, { O });
  g += blob(P('M-5.4 -0.6 C-5.6 4.4 -2.2 7.4 0 8.6 C2.2 7.4 5.6 4.4 5.4 -0.6 Z'), nut, nutS, { O, so: 1.2 });
  g += blob(P('M-6.6 0.2 Q-7 -5.6 0 -5.8 Q7 -5.6 6.6 0.2 Q0 1.8 -6.6 0.2 Z'), cap, capS, {
    O, so: 0.9,
    extra: ln('M-4 -3.5 L-2 -1 M-1 -4.6 L1.4 -1.2 M2.4 -4.4 L4.4 -1.6', 0.3 * 1.1 / s / X.O * X.O, golden ? '#FFD06A' : '#9C6A44'),
  });
  g += `<ellipse cx="2.4" cy="3" rx="0.9" ry="1.6" fill="${WH}" fill-opacity="0.55" transform="rotate(-20 2.4 3)"/>`;
  return `<g transform="translate(${r2(x)} ${r2(y)}) scale(${s})">${g}</g>`;
}

function squirrelRun(fr) {
  const F = [
    // stretched, airborne
    { b: -2.6, tilt: -7, rx: 13, tail: -12, fn: [47.5, 39], ff: [44, 41], hn: [6.5, 40.5], hf: [10, 42], hr: -18 },
    // front paws land
    { b: -1, tilt: 7, rx: 12.5, tail: -2, fn: [41, 44], ff: [37.5, 44], hn: [12, 37.5], hf: [15, 39.5], hr: -30 },
    // bunched: hind feet land ahead
    { b: 0, tilt: 0, rx: 10.5, tail: 10, fn: [31, 44], ff: [28, 44], hn: [35.5, 44], hf: [32.5, 43.6], hr: 0 },
    // push off
    { b: -1.8, tilt: -11, rx: 12, tail: 4, fn: [45, 36.5], ff: [42.5, 38.5], hn: [13, 44], hf: [17, 44], hr: 0 },
  ][fr];
  const b = F.b;
  const hip = [19, 35.5 + b], sh = [34, 36 + b];
  let g = '';
  // far legs (shade colour)
  g += strokes([`M${sh[0] - 2} ${sh[1]} L${F.ff[0]} ${F.ff[1]}`], 2.6, C.sqS);
  g += blob(Ci(F.ff[0], F.ff[1], 1.6), C.sqS, null);
  g += strokes([`M${hip[0] + 2} ${hip[1] + 2} L${F.hf[0] + 1.5} ${F.hf[1] - 0.8}`], 3, C.sqS);
  g += blob(E(F.hf[0], F.hf[1], 3.4, 1.45, F.hr), C.sqS, null);
  g += tail(17.5, 35.5 + b, F.tail, 0.74);
  g += blob(E(27, 33 + b, F.rx, 8, F.tilt), C.sq, C.sqS, {
    extra: `<ellipse cx="${30}" cy="${38.6 + b}" rx="${F.rx * 0.62}" ry="4" fill="${C.cream}" transform="rotate(${F.tilt} 30 ${38.6 + b})"/>`,
  });
  // near hind leg
  g += strokes([`M${hip[0]} ${hip[1] + 2} L${F.hn[0] + 1.5} ${F.hn[1] - 0.8}`], 3.3, C.sq);
  g += blob(E(F.hn[0], F.hn[1], 3.7, 1.5, F.hr), C.sq, C.sqS, { so: 0.6 });
  g += blob(E(hip[0], hip[1], 6.2, 5.4, F.tilt), C.sq, C.sqS, { so: 1 });
  g += ln(`M${hip[0] - 3} ${hip[1] - 3.5} Q${hip[0] + 2} ${hip[1] - 5.5} ${hip[0] + 5} ${hip[1] - 1}`, 0.5);
  // near front leg
  g += strokes([`M${sh[0]} ${sh[1]} L${F.fn[0]} ${F.fn[1]}`], 2.8, C.sq);
  g += blob(Ci(F.fn[0], F.fn[1], 1.75), C.sq, C.sqS, { so: 0.5 });
  g += sqHead(40.5, 24.5 + b, F.tilt * 0.4, 1, { mouth: fr === 0 ? 'open' : 'grin' });
  return g;
}

function squirrelUpright(o) {
  // o: tailRot, lean (deg around hips), arm: 'rest'|'windup'|'throw', face, headDy
  const hd = o.headDy || 0;
  let g = '';
  g += tail(24.5, 43.5, o.tailRot || 0, 1);
  // far foot + far arm
  g += blob(E(39, 44.2, 4.2, 1.4), C.sqS, null);
  let upper = '';
  if (o.arm === 'rest') upper += strokes(['M34 27.5 L40.5 31.2'], 2.4, C.sqS) + blob(Ci(40.8, 31.2, 1.5), C.sqS, null);
  if (o.arm === 'windup') upper += strokes(['M34.5 28 L40 33'], 2.4, C.sqS) + blob(Ci(40.2, 33.2, 1.5), C.sqS, null);
  if (o.arm === 'throw') upper += strokes(['M33 28 L28.5 34.5'], 2.4, C.sqS) + blob(Ci(28.3, 34.8, 1.5), C.sqS, null);
  upper += blob(E(31.5, 33.5, 8.6, 10.5), C.sq, C.sqS, {
    extra: `<ellipse cx="35" cy="35.5" rx="5.2" ry="8.4" fill="${C.cream}"/>`,
  });
  upper += sqHead(34.5, 18 + hd, o.headRot || 0, 1, o.face || {});
  if (o.arm === 'rest') {
    upper += strokes(['M33 27.5 L37.5 31'], 2.6, C.sq) + blob(Ci(37.8, 31, 1.7), C.sq, C.sqS, { so: 0.5 });
  } else if (o.arm === 'windup') {
    upper += strokes(['M31 27 Q27 22 25.5 15'], 2.7, C.sq);
    upper += acornAt(25, 11.4, 0.8, false);
    upper += blob(Ci(25.6, 15.2, 1.8), C.sq, C.sqS, { so: 0.5 });
  } else if (o.arm === 'throw') {
    upper += strokes(['M34 27 Q41 26 47 23'], 2.7, C.sq);
    upper += blob([Ci(47.6, 22.6, 1.8)], C.sq, C.sqS, { so: 0.5 });
    upper += ln('M49.6 17.6 Q52 18.8 52.2 21', 0.5) + ln('M50.6 24.2 Q52.2 25.4 52 27.4', 0.5);
  }
  g += `<g transform="rotate(${o.lean || 0} 32 42)">${upper}</g>`;
  // haunch + near foot
  g += blob(E(29.5, 39.5, 6.6, 5.8), C.sq, C.sqS, { so: 1 });
  g += ln('M25.5 36 Q30 33.6 34 37.5', 0.5);
  g += blob(E(34, 44.1, 5, 1.5), C.sq, C.sqS, { so: 0.6 });
  return g;
}

function squirrelStunned() {
  let g = '';
  g += blob(P(DROOPY_TAIL), C.sq, C.sqS, { so: 1.6, off: [1.6, -1.2] });
  g += ln('M8 37 Q10 36 11.5 37.5', 0.5) + ln('M14 42.5 Q16 41.6 18 42.6', 0.5);
  g += blob(E(37, 44.6, 3.6, 1.4, -10), C.sqS, null);
  g += blob(E(30, 37, 9.5, 8.5, -8), C.sq, C.sqS, { extra: `<ellipse cx="34" cy="39" rx="5.6" ry="5.8" fill="${C.cream}"/>` });
  g += strokes(['M33 33 L37 40'], 2.4, C.sq) + blob(Ci(37.3, 40.4, 1.6), C.sq, C.sqS, { so: 0.5 });
  g += blob(E(28.5, 41.6, 6.2, 4.2), C.sq, C.sqS, { so: 1 });
  g += blob(E(41.5, 44.1, 4.6, 1.5, -12), C.sq, C.sqS, { so: 0.6 });
  g += sqHead(34, 24.5, 16, 0.95, { eyes: 'swirl', mouth: 'tongue', brow: 'worried' });
  // stars orbiting
  g += `<ellipse cx="32" cy="8.6" rx="11" ry="2.6" fill="none" stroke="${OUT}" stroke-width="0.45" stroke-dasharray="1.6 1.4" transform="rotate(10 32 8.6)"/>`;
  g += star(22.5, 7.4, 2.9, { O: 0.75 }) + star(37, 4.8, 2.6, { O: 0.75, rot: -80 }) + star(43, 11.6, 2.2, { O: 0.7, rot: -100 });
  return g;
}

// ---------------------------------------------------------------- boss
function boss(o) {
  // o: pose 'idle'|'idle2'|'windup'|'throw'|'hurt'|'defeated'
  const pose = o.pose;
  const s = 2.35;
  let g = '';
  const bob = pose === 'idle2' ? 1.2 : 0;
  if (pose === 'defeated') {
    g += `<g transform="translate(0 0)">${blob(P('M44 127 C28 128.4 8 128 5 118 C2.6 110 9 102 18 105 C24 107 24 115 18 115.5 C24 120 34 119.5 46 116 Z'), C.sq, C.sqS, { so: 3, off: [3, -2] })}</g>`;
    // cape puddle
    g += blob(P('M40 82 C26 96 16 112 14 125 Q50 130 84 125 L76 84 Z'), C.purple, C.purpleS, {
      so: 3, extra: `<path d="M10 124.5 Q50 129 88 124" fill="none" stroke="${C.gold}" stroke-width="7"/>`,
    });
    g += blob(E(66, 104, 29, 24), C.sq, C.sqS, { so: 3, extra: `<ellipse cx="76" cy="108" rx="16" ry="17" fill="${C.cream}"/>` });
    g += blob(E(64, 79, 21, 6.5, -10), C.cream, C.creamS, { so: 2, extra: dots(64, 79, 21, 6.5) });
    // legs sticking out
    g += blob(E(78, 118, 12, 8, -10), C.sq, C.sqS, { so: 2 });
    g += blob(E(98, 121.5, 6.5, 6.5), C.sq, C.sqS, { so: 1.5 });
    g += blob(E(101, 119.5, 4.5, 6, -8), C.cream, C.creamS, { so: 1, O: 1.4 });
    g += strokes(['M82 86 Q90 94 88 104'], 6, C.sq) + blob(Ci(88, 105, 4), C.sq, C.sqS, { so: 1 });
    g += sqHead(72, 58, 14, s, {
      mask: false, eyes: 'swirl', mouth: 'tongue', brow: 'worried', monocle: false,
    });
    // monocle dangling
    g += `<path d="M76 74 Q80 84 88 86" fill="none" stroke="${C.goldS}" stroke-width="1"/>`;
    g += strokes(['M86 89 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0'], 1.6, C.gold, { O: 1.1 });
    // fallen crown
    g += crownLocal(100, 121, 28, 2.6, 1.55);
    g += `<ellipse cx="74" cy="21" rx="22" ry="4.5" fill="none" stroke="${OUT}" stroke-width="1" stroke-dasharray="3.6 3" transform="rotate(8 74 21)"/>`;
    g += star(54, 20, 5.4, { O: 1.6 }) + star(82, 15, 5, { O: 1.6, rot: -78 }) + star(95, 25, 4.2, { O: 1.5, rot: -100 });
    return g;
  }
  let tailRot = { idle: 0, idle2: 5, windup: -6, throw: 8, hurt: -6 }[pose];
  g += tail(42, 118, tailRot, 2.2);
  const lean = { idle: 0, idle2: 0, windup: -5, throw: 6, hurt: -5 }[pose];
  let body = '';
  // cape
  const sway = pose === 'idle2' ? -2 : pose === 'throw' ? -5 : 0;
  body += blob(P(`M60 60 C40 70 ${22 + sway} 98 ${15 + sway} 122 Q50 128 80 122 L86 64 Z`), C.purple, C.purpleS, {
    so: 3.4,
    extra: `<path d="M${10 + sway} 121 Q50 129 84 121" fill="none" stroke="${C.gold}" stroke-width="7.4"/><path d="M${10 + sway} 121 Q50 129 84 121" fill="none" stroke="${OUT}" stroke-width="0.9" transform="translate(0 -3.6)"/><path d="M${17 + sway} 120 C${24 + sway} 98 40 72 60 60" fill="none" stroke="${C.gold}" stroke-width="6"/>`,
  });
  // far arm (behind body)
  if (pose === 'windup' || pose === 'idle' || pose === 'idle2')
    body += strokes(['M62 80 Q56 90 58 98'], 6, C.sqS) + blob(Ci(58, 99, 3.8), C.sqS, null);
  if (pose === 'throw') body += strokes(['M64 80 Q56 88 54 96'], 6, C.sqS) + blob(Ci(54, 97, 3.8), C.sqS, null);
  if (pose === 'hurt') body += strokes(['M62 78 Q52 70 50 60'], 6, C.sqS) + blob(Ci(50, 58.6, 3.8), C.sqS, null);
  body += blob(E(70, 96 + bob * 0.4, 28, 28 - bob * 0.4), C.sq, C.sqS, {
    so: 3, extra: `<ellipse cx="80" cy="${100 + bob * 0.3}" rx="16.5" ry="21" fill="${C.cream}"/>`,
  });
  // ermine collar
  body += blob(E(72, 70 + bob, 21, 6.5, -4), C.cream, C.creamS, { so: 2, extra: dots(72, 70 + bob, 21, 6.5) });
  const face = {
    idle: { mask: false, eyes: 'smug', mouth: 'smirk', brow: 'none', monocle: true },
    idle2: { mask: false, eyes: 'smug', mouth: 'smirk', brow: 'none', monocle: true },
    windup: { mask: false, eyes: 'normal', mouth: 'grin', brow: 'angry', monocle: true },
    throw: { mask: false, eyes: 'normal', mouth: 'open', brow: 'angry', monocle: true },
    hurt: { mask: false, eyes: 'squeeze', mouth: 'o', brow: 'worried', monocle: false },
  }[pose];
  const crownRot = pose === 'hurt' ? 34 : -8;
  const crownPos = pose === 'hurt' ? [4.5, -13.2] : [0.2, -9.6];
  face.crown = crownLocal(crownPos[0], crownPos[1], crownRot, 2.6 / s, 0.74);
  body += sqHead(76, 47 + bob, pose === 'hurt' ? -12 : pose === 'throw' ? 6 : 0, s, face);
  if (pose === 'hurt') {
    // monocle popped off, swinging on its chain
    body += `<path d="M86 52 Q96 62 99 70" fill="none" stroke="${C.goldS}" stroke-width="1"/>`;
    body += strokes(['M96 73 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0'], 1.6, C.gold, { O: 1.1 });
  }
  // near arm
  if (pose === 'idle' || pose === 'idle2') body += strokes(['M82 78 Q88 84 87 93'], 6.4, C.sq) + blob(Ci(87, 94, 4.2), C.sq, C.sqS, { so: 1 });
  if (pose === 'windup') {
    body += strokes(['M74 80 Q60 66 50 50'], 6.4, C.sq);
    body += acornAt(46, 44, 1.5, true);
    body += blob(Ci(49.5, 49.5, 4.4), C.sq, C.sqS, { so: 1 });
  }
  if (pose === 'throw') {
    body += strokes(['M84 80 Q98 76 108 68'], 6.4, C.sq) + blob(Ci(109, 67, 4.4), C.sq, C.sqS, { so: 1 });
    body += ln('M110 55 Q114.5 58.5 114 63.5', 1) + ln('M103 57.5 Q107.5 58.5 109.5 61', 1);
  }
  if (pose === 'hurt') body += strokes(['M84 78 Q94 70 98 58'], 6.4, C.sq) + blob(Ci(98.6, 56.6, 4.2), C.sq, C.sqS, { so: 1 });
  g += `<g transform="rotate(${lean} 70 124)">${body}</g>`;
  // haunches and feet stay planted
  g += blob(E(62, 112, 13, 11.5), C.sq, C.sqS, { so: 2.4 });
  g += ln('M54 104 Q62 99 70 104', 1.2);
  g += blob(E(53, 123, 10.5, 3.6), C.sqS, null);
  g += blob(E(78, 122.8, 11.5, 3.8), C.sq, C.sqS, { so: 1.2 });
  if (pose === 'hurt') {
    g += `<path d="M108 22 l6 -4 M110 30 l8 0 M104 16 l2 -6" stroke="${OUT}" stroke-width="1.4" stroke-linecap="round"/>`;
    g += blob(P('M101 38 Q97 44 100 46 Q103 47 103.5 44 Q103.5 41 101 38 Z'), '#BFE6FF', '#93CCF2', { O: 1, so: 0.8 });
  }
  return g;
}
function dots(cx, cy, rx, ry) {
  let s = '';
  for (let i = -2; i <= 2; i++) s += `<path d="M${r2(cx + i * rx * 0.38)} ${r2(cy - ry * 0.1)} l0 ${r2(ry * 0.45)}" stroke="${OUT}" stroke-width="1.3" stroke-linecap="round"/>`;
  return s;
}

// ---------------------------------------------------------------- props
function bonePath(cx, cy, L, t, k) {
  return [R(cx - L / 2, cy - t / 2, L, t), Ci(cx - L / 2, cy - k * 0.72, k), Ci(cx - L / 2, cy + k * 0.72, k), Ci(cx + L / 2, cy - k * 0.72, k), Ci(cx + L / 2, cy + k * 0.72, k)];
}
function bone(W, H, gold, O) {
  const cx = W / 2, cy = H / 2;
  const L = W * 0.6, t = H * 0.36, k = H * 0.24;
  let g = blob(bonePath(cx, cy, L, t, k), gold ? C.gold : '#F8EBCF', gold ? C.goldS : '#E3C99C', { O, so: H * 0.07, off: [0, -H * 0.09] });
  g += `<path d="M${r2(cx - L * 0.3)} ${r2(cy - t * 0.18)} L${r2(cx + L * 0.25)} ${r2(cy - t * 0.18)}" stroke="${WH}" stroke-opacity="0.8" stroke-width="${r2(t * 0.22)}" stroke-linecap="round"/>`;
  if (gold) g += sparkle(cx + L / 2 + k * 0.4, cy - k * 1.3, H * 0.16) + sparkle(cx - L * 0.35, cy + t * 0.9, H * 0.1);
  return g;
}
function sparkle(x, y, r) {
  return `<path d="M${r2(x)} ${r2(y - r)} Q${r2(x + r * 0.18)} ${r2(y - r * 0.18)} ${r2(x + r)} ${r2(y)} Q${r2(x + r * 0.18)} ${r2(y + r * 0.18)} ${r2(x)} ${r2(y + r)} Q${r2(x - r * 0.18)} ${r2(y + r * 0.18)} ${r2(x - r)} ${r2(y)} Q${r2(x - r * 0.18)} ${r2(y - r * 0.18)} ${r2(x)} ${r2(y - r)} Z" fill="${WH}" stroke="${OUT}" stroke-width="${r2(r * 0.22)}" stroke-linejoin="round"/>`;
}

function cake() {
  let g = '';
  g += blob(E(30, 51.6, 27, 2.6), '#F4EEE6', '#DCD2C6', { so: 0.8, off: [0, -0.8] });
  const tiers = [
    [8, 36, 44, 15.5],
    [13, 25.5, 34, 12],
    [18.5, 16, 23, 11],
  ];
  const sprinkle = ['#5BB8F0', '#FFB020', '#5FCF9E', '#9C7EFF', '#FF5A8A'];
  tiers.forEach(([x, y, w, h], i) => {
    let sp = '';
    for (let j = 0; j < Math.floor(w / 6); j++) {
      const sx = x + 4 + j * 6 + (i % 2) * 2, sy = y + h - 4 - ((j * 7) % 3);
      sp += `<rect x="${r2(sx)}" y="${r2(sy)}" width="2" height="0.9" rx="0.45" fill="${sprinkle[(i + j) % 5]}" transform="rotate(${(j * 47) % 90 - 45} ${r2(sx + 1)} ${r2(sy + 0.45)})"/>`;
    }
    g += blob(R(x, y, w, h, 2.5), '#FBE3B6', '#EAC48C', { so: 1.6, off: [0, -1.6], extra: sp });
    // frosting band with drips
    const drips = [];
    const n = Math.round(w / 7);
    for (let j = 0; j < n; j++) {
      const dx = x + 3 + (j * (w - 6)) / (n - 1);
      drips.push(Ci(dx, y + 3.6 + (j % 2 ? 1.6 : 0.4), 1.9));
    }
    g += blob([R(x - 1.2, y - 1, w + 2.4, 5, 2.5), ...drips], i === 1 ? '#FFB3C8' : '#FF8FB1', i === 1 ? '#F28EAB' : '#E86E95', { so: 1, off: [0, -1] });
    g += `<path d="M${x + 1.5} ${y + 0.6} L${x + w * 0.45} ${y + 0.6}" stroke="${WH}" stroke-opacity="0.7" stroke-width="1" stroke-linecap="round"/>`;
  });
  // candles
  [[23.5, '#5BB8F0'], [30, '#9C7EFF'], [36.5, '#5FCF9E']].forEach(([cx, col], i) => {
    const top = i === 1 ? 6.6 : 8.2;
    g += blob(R(cx - 1.3, top, 2.6, 15.5 - top), col, null, { O: 1 });
    g += `<path d="M${cx - 1.3} ${top + 2.4} l2.6 -1.2 M${cx - 1.3} ${top + 5} l2.6 -1.2" stroke="${WH}" stroke-width="0.8"/>`;
    g += blob(P(`M${cx} ${top - 5.6} Q${cx + 2.4} ${top - 2.2} ${cx + 1.4} ${top - 0.6} Q${cx} ${top + 0.4} ${cx - 1.4} ${top - 0.6} Q${cx - 2.2} ${top - 2.4} ${cx} ${top - 5.6} Z`), C.gold, null, {
      O: 0.9, extra: `<ellipse cx="${cx}" cy="${top - 1.5}" rx="0.8" ry="1.2" fill="#FFF3C4"/>`,
    });
  });
  return g;
}

function present(col, colS, rib, ribS) {
  let g = '';
  g += blob(R(5, 15, 26, 19, 1.6), col, colS, { so: 1.8, extra: `<rect x="15.6" y="10" width="4.8" height="30" fill="${rib}"/><rect x="15.6" y="10" width="1.4" height="30" fill="${ribS}"/>` });
  g += blob(R(3, 10.6, 30, 6.4, 1.8), col, colS, { so: 1.2, off: [0, -1.2], extra: `<rect x="15.6" y="5" width="4.8" height="16" fill="${rib}"/><rect x="15.6" y="5" width="1.4" height="16" fill="${ribS}"/>` });
  g += blob([E(12.6, 7.4, 5, 3.2, 24), E(23.4, 7.4, 5, 3.2, -24)], rib, ribS, { O: 1.2, so: 0.8 });
  g += `<ellipse cx="13" cy="7.2" rx="2" ry="1" fill="${ribS}" transform="rotate(24 13 7.2)"/><ellipse cx="23" cy="7.2" rx="2" ry="1" fill="${ribS}" transform="rotate(-24 23 7.2)"/>`;
  g += blob([P('M16.6 9.6 L13.2 15 L15.6 14.6 L16.4 16.4 Z'), P('M19.4 9.6 L22.8 15 L20.4 14.6 L19.6 16.4 Z')], rib, ribS, { O: 1.1, so: 0.5 });
  g += blob(R(15.4, 7.2, 5.2, 4, 1.6), rib, ribS, { O: 1.2, so: 0.6 });
  g += `<path d="M7.5 18 L7.5 25" stroke="${WH}" stroke-opacity="0.45" stroke-width="1.4" stroke-linecap="round"/>`;
  return g;
}

function cage(open) {
  let g = '';
  const xs = [10, 18, 26, 34, 42, 50, 58, 66, 74];
  const bars = [];
  for (const x of xs) {
    const inDoor = x > 30 && x < 54;
    const dome = x === 42 ? `M42 30 L42 12` : `M${x} 30 Q${x} ${12 + Math.abs(42 - x) * 0.12} 42 11`;
    bars.push(dome);
    if (inDoor && open) bars.push(`M${x} 30 L${x} 40`);
    else bars.push(`M${x} 30 L${x} 71`);
  }
  const rails = ['M10 30 L74 30', 'M10 50 L30 50 M54 50 L74 50'];
  if (!open) rails.push('M30 50 L54 50');
  g += blob(Ci(42, 4.2, 2.6), 'none', null, { O: 0 });
  g += strokes(['M42 7.8 a2.6 2.6 0 1 1 0.01 0'], 1.4, C.brass, { O: 1.1 });
  g += strokes([...bars, ...rails], 1.5, C.brass, { O: 1.1 });
  g += blob(E(42, 10.6, 4.4, 2.6), C.brass, C.brassS, { O: 1.4, so: 0.8 });
  // door frame
  if (!open) {
    g += strokes(['M30 40 L54 40 L54 71 L30 71 Z'], 2.3, C.brass, { O: 1.1 });
    g += padlock(54, 55, false);
  } else {
    g += strokes(['M30 40 L54 40 L54 71 M30 71 L30 40'], 2.3, C.brass, { O: 1.1 });
    // door swung open on its right hinge, seen at an angle
    const door = ['M54 40 L69 44 L69 74 L54 71', 'M59 41.4 L59 72', 'M64 42.7 L64 73', 'M54 55.5 L69 59'];
    g += strokes(door, 1.6, C.brass, { O: 1.1 });
    g += strokes(['M54 40 L69 44 L69 74 L54 71'], 2.3, C.brass, { O: 1.1 });
    g += padlock(75.5, 66, true);
  }
  // base tray
  g += blob(R(4, 70.5, 76, 6.5, 2.6), '#B9733F', '#99592C', { O: 1.6, so: 1.2, off: [0, -1.2] });
  g += blob(R(7, 76.4, 70, 4.4, 1.8), '#9E5F33', null, { O: 1.6 });
  g += `<path d="M9 72.6 L50 72.6" stroke="${WH}" stroke-opacity="0.35" stroke-width="1.1" stroke-linecap="round"/>`;
  return g;
}
function padlock(x, y, broken) {
  let g = '';
  if (!broken) g += strokes([`M${x - 2.6} ${y} L${x - 2.6} ${y - 3} Q${x - 2.6} ${y - 6.4} ${x} ${y - 6.4} Q${x + 2.6} ${y - 6.4} ${x + 2.6} ${y - 3} L${x + 2.6} ${y}`], 1.4, '#B9C2CC', { O: 1 });
  else g += strokes([`M${x - 2.6} ${y - 1} L${x - 3.4} ${y - 4} Q${x - 4.4} ${y - 7.6} ${x - 1.6} ${y - 8.6} Q${x + 1} ${y - 9.2} ${x + 1.8} ${y - 6.6}`], 1.4, '#B9C2CC', { O: 1 });
  const tf = broken ? `rotate(14 ${x} ${y + 3})` : undefined;
  g += blob(R(x - 4.4, y - 0.6, 8.8, 7.6, 1.8), C.gold, C.goldS, {
    O: 1.2, so: 0.9, tf,
    extra: `<circle cx="${x}" cy="${y + 2.4}" r="1.1" fill="${OUT}"/><path d="M${x} ${y + 2.6} L${x} ${y + 5}" stroke="${OUT}" stroke-width="1"/>`,
  });
  if (broken) g += `<path d="M${x - 8} ${y - 7} l-2 -2 M${x - 9} ${y - 3} l-2.6 0 M${x - 6} ${y - 10} l-0.6 -2.4" stroke="${OUT}" stroke-width="0.9" stroke-linecap="round"/>`;
  return g;
}

function balloonPost(up) {
  let g = '';
  g += blob(P('M6 88.4 Q6 83 15 83 Q24 83 24 88.4 Z'), C.woodS, null, { O: 1.4 });
  g += blob(R(13, 42, 4, 43, 1.2), C.wood, C.woodS, { O: 1.4, so: 1, off: [1, 0] });
  g += `<path d="M14.4 46 L14.4 80" stroke="${WH}" stroke-opacity="0.3" stroke-width="0.8"/>`;
  g += blob(R(11.6, 40.4, 6.8, 3.4, 1.4), C.woodD, null, { O: 1.4 });
  if (up) {
    g += ln('M15 40.6 Q12.4 38.4 15 36.2 Q17.6 34 15 32', 0.5);
    g += blob(P('M15 31.6 L12.6 35 L17.4 35 Z'), C.gum, C.gumS, { O: 1.2, so: 0.5 });
    g += blob(P('M15 32.4 C4 31.6 2 18 3 13 C4.5 5 10 3.2 15 3.2 C20 3.2 25.5 5 27 13 C28 18 26 31.6 15 32.4 Z'), C.gum, C.gumS, {
      O: 1.5, so: 2, off: [2.2, -1.6],
      extra: `<g fill="${WH}" fill-opacity="0.9"><ellipse cx="15.6" cy="20.4" rx="4" ry="3.2"/><ellipse cx="10.6" cy="15.6" rx="1.6" ry="2.1" transform="rotate(-20 10.6 15.6)"/><ellipse cx="13.8" cy="12.8" rx="1.6" ry="2.1"/><ellipse cx="17.6" cy="12.8" rx="1.6" ry="2.1"/><ellipse cx="20.8" cy="15.6" rx="1.6" ry="2.1" transform="rotate(20 20.8 15.6)"/></g>`,
    });
    g += `<path d="M21.6 7.6 Q24.6 9.6 24.6 13.4" fill="none" stroke="${WH}" stroke-width="1.6" stroke-linecap="round"/>`;
  } else {
    // deflated balloon slumped over the post top
    g += blob(P('M15 41.2 C11 40 7.6 42 7.2 45 C6.8 48 8 50.6 9.6 51 C10.6 49 11.6 47.6 12.6 46 L17.4 46 C18.8 48 19.6 50.6 21.4 50.4 C23.4 49.6 23.8 46.6 22.8 44 C21.6 41.2 18.6 40.4 15 41.2 Z'), C.gum, C.gumS, { O: 1.4, so: 1 });
    g += ln('M11 43.6 Q12.4 45 11.6 47', 0.45) + ln('M19.4 43 Q18.6 44.6 19.8 46.4', 0.45) + ln('M14 42.4 Q15.2 43.6 16.4 42.4', 0.45);
    g += blob(P('M15 41.4 L13.4 39 L16.6 39 Z'), C.gum, C.gumS, { O: 1, so: 0.4 });
  }
  return g;
}

function partyArch() {
  let g = '';
  const cols = [[C.gum, C.gumS], [C.gold, C.goldS], [C.sky, C.skyS], [C.mint, C.mintS], [C.lav, C.lavS]];
  const pts = [];
  for (let i = 0; i < 6; i++) pts.push([18 + (i % 2 ? 3 : -3), 137 - i * 13]);
  const N = 13;
  for (let i = 0; i <= N; i++) {
    const a = Math.PI + (i / N) * Math.PI;
    pts.push([100 + 82 * Math.cos(a), 70 + 56 * Math.sin(a)]);
  }
  for (let i = 5; i >= 0; i--) pts.push([182 + (i % 2 ? -3 : 3), 137 - i * 13]);
  // back layer (offset small balloons) for cluster feel
  pts.forEach(([x, y], i) => {
    if (i % 2 === 0) return;
    const [c, cs] = cols[(i + 2) % 5];
    const ox = x < 100 ? 4.5 : -4.5;
    g += blob(E(x + ox, y - 5, 6.4, 7), c, cs, { O: 1.8, so: 1.4 });
  });
  pts.forEach(([x, y], i) => {
    const [c, cs] = cols[i % 5];
    g += blob(E(x, y, 9, 10), c, cs, { O: 2, so: 2, extra: `<ellipse cx="${r2(x + 3.4)}" cy="${r2(y - 4.4)}" rx="1.6" ry="2.6" fill="${WH}" fill-opacity="0.75" transform="rotate(30 ${r2(x + 3.4)} ${r2(y - 4.4)})"/>` });
  });
  // base weights
  g += blob(R(8, 140, 20, 8, 2.4), C.woodD, null, { O: 2 }) + blob(R(172, 140, 20, 8, 2.4), C.woodD, null, { O: 2 });
  // banner strings + banner
  g += ln('M44 34 L50 46 M156 34 L150 46', 0.7);
  g += blob(P('M30 50 L40 47 L40 66 L30 68 L34 58.5 Z'), C.gumS, null, { O: 2 });
  g += blob(P('M170 50 L160 47 L160 66 L170 68 L166 58.5 Z'), C.gumS, null, { O: 2 });
  g += blob(P('M38 44 Q100 54 162 44 L162 64 Q100 74 38 64 Z'), '#FFF4DE', '#F0DDBA', { O: 2, so: 1.6, off: [0, -1.6] });
  g += text('BARK PARTY', 100, 66.6, 17.5, C.gum, { sw: 3.4, ls: 0.6 });
  return g;
}

// ---------------------------------------------------------------- hazards
function catSleep() {
  let g = '';
  g += blob(E(34, 36.5, 25, 11.5), C.cat, C.catS, {
    so: 2,
    extra: ln('M24 25.4 Q26 30 24.6 33 M32 25 Q34 30 32.6 33.4 M40 25.4 Q42 30 40.6 33', 0.9, C.catS),
  });
  // tail curled around the front
  g += strokes(['M11 39 C6 46 18 47.6 30 46.4 C38 45.8 43 45.6 46 44.6'], 5.6, C.cat);
  g += `<path d="M38 44.2 L37 48 M32 44.6 L31.4 48.4" stroke="${C.catS}" stroke-width="1.6"/>`;
  // head resting on paws
  g += blob(E(50, 43.4, 6.4, 3), C.catL, C.creamS, { so: 0.8, off: [0, -0.8] });
  g += blob([P('M46.6 26.2 L46.4 16.4 L53 22.6 Z'), P('M58.6 22.4 L64 15.6 L64.6 26 Z')], C.cat, C.catS, { so: 0.8, extra: `<path d="M48 23.6 L48 19.4 L51 22.6Z M60.6 22.6 L63 19.6 L63.4 23.4Z" fill="${C.pink}"/>` });
  g += blob(E(55.6, 32.6, 11.4, 9.4), C.cat, C.catS, { so: 1.4, extra: `<ellipse cx="57" cy="37.6" rx="6.6" ry="4" fill="${C.catL}"/>` });
  // grumpy closed eyes + frown brows
  g += ln('M48.4 31.6 Q51 32.8 53.4 31.6 M59.6 31.6 Q62 32.8 64.4 31.4', 0.6);
  g += ln('M48.6 28.6 L53 29.8 M59.8 29.8 L64.2 28.4', 0.55);
  g += `<path d="M55.4 35.2 L58.4 35.2 L56.9 36.6 Z" fill="${C.pink}" stroke="${OUT}" stroke-width="0.6" stroke-linejoin="round"/>`;
  g += ln('M54.4 38.8 Q55.6 37.6 56.9 38.6 Q58.2 37.6 59.4 38.8', 0.5);
  g += ln('M45.4 35.8 L50 36.2 M45.8 38.6 L50.2 37.6 M63.8 36.2 L68.4 35.6 M63.6 37.6 L68 38.6', 0.35);
  g += text('z', 60.5, 18.6, 7, WH, { sw: 1.6 }) + text('z', 65, 11, 9, WH, { sw: 1.8 }) ;
  return g;
}
function catAwake(fr) {
  let g = '';
  // puffed tail straight up
  g += blob([E(10, 18, 4.6, 11, -14), Ci(12.6, 29, 4)], C.cat, C.catS, {
    so: 1.2, extra: `<path d="M5 14 l10 -3 M5.6 20 l10 -3" stroke="${C.catS}" stroke-width="1.6"/>`,
  });
  g += ln('M5.4 11.8 l-2 -1 M5.2 17 l-2.2 0 M6.2 23 l-2 1', 0.6);
  // far legs
  g += strokes(['M22 34 L19.4 45.6', 'M44 34 L46.6 45.6'], 4, C.catS);
  // arched body
  g += blob(P('M14 38 C12 22 24 13.4 34 13.6 C44 13.8 52 22 50.6 38 Q32 42.6 14 38 Z'), C.cat, C.catS, {
    so: 2,
    extra: `<path d="M23 16.6 Q25 21 24 25 M31.6 13.8 Q33.4 18.4 32.4 22.4 M40.2 15.6 Q41.4 20 40 23.6" fill="none" stroke="${C.catS}" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="38" cy="38" rx="9" ry="5" fill="${C.catL}"/>`,
  });
  // fur spikes on the back
  g += ln('M20 18.4 L18.4 15 M27.6 14.4 L27.4 10.8 M35.6 13.6 L36.6 10 M43 16.2 L45.4 13.4', 0.6);
  // near legs
  g += strokes(['M18 36 L15.2 45', 'M47 37 L48.4 45'], 4.6, C.cat);
  g += blob([E(14.8, 45.4, 3.6, 2), E(49.2, 45.4, 3.6, 2)], C.cat, C.catS, { so: 0.6 });
  // head
  g += blob([P('M46.4 17.6 L41.6 9 L50.2 12 Z'), P('M58.6 13.6 L64 6.8 L64.8 16.6 Z')], C.cat, C.catS, { so: 0.8, extra: `<path d="M44.4 13 L43.6 10.6 L47.4 12.4Z M60.8 13.6 L63 10.4 L63.4 14.4Z" fill="${C.pink}"/>` });
  g += blob(Ci(54.4, 21.4, 9.8), C.cat, C.catS, { so: 1.3, extra: `<ellipse cx="57" cy="27" rx="6.2" ry="4.4" fill="${C.catL}"/>` });
  // angry-but-cute eyes
  g += `<ellipse cx="51.4" cy="19.4" rx="2.3" ry="2.2" fill="${C.gold}" stroke="${OUT}" stroke-width="0.6"/><ellipse cx="59.8" cy="19" rx="2.1" ry="2.1" fill="${C.gold}" stroke="${OUT}" stroke-width="0.6"/>`;
  g += `<ellipse cx="51.8" cy="19.6" rx="0.8" ry="1.6" fill="${OUT}"/><ellipse cx="60.1" cy="19.2" rx="0.75" ry="1.5" fill="${OUT}"/>`;
  g += ln('M48.4 15.6 L53.6 17.4 M57.6 17 L62.2 14.8', 0.7);
  // hissing mouth with fangs
  g += `<path d="M53.2 25 Q57 22.8 60.8 24.8 Q60.4 30.4 57 30.6 Q53.6 30.4 53.2 25 Z" fill="${C.mouth}" stroke="${OUT}" stroke-width="0.75" stroke-linejoin="round"/>`;
  g += `<path d="M55 25 L55.8 27.2 L56.6 24.6 Z M57.8 24.4 L58.6 27 L59.4 24.6 Z" fill="${WH}" stroke="${OUT}" stroke-width="0.35" stroke-linejoin="round"/>`;
  g += `<path d="M55.4 29.4 Q57 27.8 58.8 29.4 Q57 30.6 55.4 29.4 Z" fill="${C.tongue}"/>`;
  g += `<path d="M55.6 22.4 L58 22.4 L56.8 23.6 Z" fill="${C.pink}" stroke="${OUT}" stroke-width="0.5" stroke-linejoin="round"/>`;
  g += ln('M62.6 23.4 L67.4 22 M62.8 25.4 L67.6 26', 0.35);
  // swiping paw
  if (fr === 0) {
    g += strokes(['M48 30 Q54 33 60.6 33.6'], 4.2, C.cat);
    g += blob(Ci(61.6, 33.4, 2.9), C.cat, C.catS, { so: 0.6 });
    g += ln('M63.2 31.4 l2 -1.4 M64 33.4 l2.4 0 M63.4 35.4 l2 1.4', 0.4);
  } else {
    g += strokes(['M48 30 Q56 39 62 40'], 4.2, C.cat);
    g += blob(Ci(62.8, 40.4, 2.9), C.cat, C.catS, { so: 0.6 });
    g += ln('M66.4 30.6 Q69 36 66.6 43.6 M63.6 29 Q65.4 34.4 63.4 38', 0.55);
  }
  return g;
}

function vacuum(fr) {
  let g = '';
  g += blob(R(3, 8.4, 54, 12.6, 6.3), C.vac, C.vacS, { O: 1.4, so: 1.4, off: [0, -1.6] });
  g += blob(P('M8.6 9 Q10 3.6 22 3.4 L38 3.4 Q50 3.6 51.4 9 Z'), C.vacL, '#9EAABA', { O: 1.3, so: 0.8, off: [0, -0.8] });
  g += blob(Ci(14.5, 22.1, 2.4), '#5B6474', null, { O: 1.3 }) + `<circle cx="14.5" cy="22.1" r="0.9" fill="#A8B1BE"/>`;
  g += `<rect x="4.2" y="15.6" width="51.6" height="1.6" fill="${C.gum}"/>`;
  g += blob(R(27, 1.6, 6, 2.6, 1.3), C.gold, C.goldS, { O: 1, so: 0.5 });
  // face visor
  g += blob(R(37.4, 9.4, 16.6, 6.4, 3.2), '#3E4756', null, { O: 0.9 });
  g += `<path d="M39.6 11.4 L44.2 12.8 L44 14 Q41.8 14.6 39.8 13.4 Z" fill="${WH}"/><path d="M52 11.4 L47.4 12.8 L47.6 14 Q49.8 14.6 51.8 13.4 Z" fill="${WH}"/>`;
  g += `<circle cx="42.6" cy="13.4" r="0.8" fill="${OUT}"/><circle cx="49" cy="13.4" r="0.8" fill="${OUT}"/>`;
  // spinning side brush
  const a0 = fr === 0 ? 0 : 30;
  let br = '';
  for (let i = 0; i < 6; i++) {
    const a = ((a0 + i * 60) * Math.PI) / 180;
    br += `M52.6 22 L${r2(52.6 + Math.cos(a) * 5)} ${r2(22 + Math.sin(a) * 1.8)} `;
  }
  g += `<path d="${br}" stroke="${OUT}" stroke-width="1.5" stroke-linecap="round"/><path d="${br}" stroke="${C.gold}" stroke-width="0.6" stroke-linecap="round"/>`;
  g += blob(E(52.6, 21.6, 2.2, 1.2), '#5B6474', null, { O: 0.9 });
  if (fr === 1) g += ln('M58 20 l1.4 -0.6 M58.2 23 l1.4 0.6', 0.35);
  else g += ln('M58.4 21.4 l1.4 0', 0.35);
  return g;
}

function toyBlocks() {
  let g = '';
  const wood = '#EDC58C', woodS = '#D2A468';
  const block = (x, y, s, rot, letter, col) => {
    let b = blob(R(x, y, s, s, 2), wood, woodS, { O: 1.4, so: 1.4, extra: `<rect x="${x + 2.6}" y="${y + 2.6}" width="${s - 5.2}" height="${s - 5.2}" rx="1.4" fill="${col}"/>` });
    b += text(letter, x + s / 2, y + s * 0.75, s * 0.62, WH, { sw: 1.4 });
    return `<g transform="rotate(${rot} ${x + s / 2} ${y + s / 2})">${b}</g>`;
  };
  g += block(3, 22.5, 15.5, 0, 'A', C.red);
  g += block(21.4, 22.5, 15.5, 0, 'B', C.blue);
  g += block(12, 6.4, 15.5, 8, 'C', C.green);
  return g;
}

// ---------------------------------------------------------------- furniture
function couch(top) {
  const y0 = 90 - top + X.O; // shape top of the seat cushions
  let g = '';
  g += blob(R(22, 78, 9, 9.6, 2), C.woodD, null) + blob(R(189, 78, 9, 9.6, 2), C.woodD, null);
  g += blob(R(22, 7, 176, 44, 14), C.terra, C.terraS, { so: 2.4 });
  g += blob(R(30, 13, 79, 34, 11), C.terra, C.terraS, { so: 2 }) + blob(R(111, 13, 79, 34, 11), C.terra, C.terraS, { so: 2 });
  g += `<circle cx="69.5" cy="28" r="1.4" fill="${C.terraS}"/><circle cx="150.5" cy="28" r="1.4" fill="${C.terraS}"/>`;
  g += blob(R(20, 54, 180, 26, 6), C.terra, C.terraS, { so: 2.4, off: [0, -2.4] });
  g += blob(R(27, y0, 84, 17, 7), C.terra, C.terraS, { so: 2, off: [0, -2] }) + blob(R(109, y0, 84, 17, 7), C.terra, C.terraS, { so: 2, off: [0, -2] });
  g += `<path d="M34 ${y0 + 3} L80 ${y0 + 3} M116 ${y0 + 3} L162 ${y0 + 3}" stroke="${WH}" stroke-opacity="0.35" stroke-width="1.8" stroke-linecap="round"/>`;
  for (const [x, flip] of [[4, 1], [186, -1]]) {
    g += blob(R(x, 28, 30, 52, 13), C.terra, C.terraS, { so: 2.4 });
    const cx = x + 15;
    g += ln(`M${cx - 9} 38 Q${cx} 33 ${cx + 9} 38`, 0.5);
  }
  return g;
}
function armchair(top) {
  const y0 = 90 - top + X.O;
  let g = '';
  g += blob(R(18, 78, 8, 9.6, 2), C.woodD, null) + blob(R(84, 78, 8, 9.6, 2), C.woodD, null);
  g += blob(R(16, 5, 78, 46, 18), C.mustard, C.mustardS, { so: 2.4 });
  g += ln('M30 20 Q55 14 80 20', 0.5);
  g += `<circle cx="55" cy="28" r="1.4" fill="${C.mustardS}"/>`;
  g += blob(R(18, 56, 74, 24, 6), C.mustard, C.mustardS, { so: 2.4, off: [0, -2.4] });
  g += blob(R(25, y0, 60, 17, 7), C.mustard, C.mustardS, { so: 2, off: [0, -2] });
  g += `<path d="M31 ${y0 + 3} L66 ${y0 + 3}" stroke="${WH}" stroke-opacity="0.4" stroke-width="1.8" stroke-linecap="round"/>`;
  g += blob(R(3, 27, 26, 53, 12), C.mustard, C.mustardS, { so: 2.4 }) + blob(R(81, 27, 26, 53, 12), C.mustard, C.mustardS, { so: 2.4 });
  g += ln('M8 37 Q16 32 24 37', 0.5) + ln('M86 37 Q94 32 102 37', 0.5);
  return g;
}
function sideTable(top) {
  const y0 = 70 - top + X.O;
  let g = '';
  g += blob([R(13, 18, 7, 49.2, 2), R(70, 18, 7, 49.2, 2)], C.woodS, null);
  g += blob(R(16, 48, 58, 5, 2), C.wood, C.woodS, { so: 1, off: [0, -1] });
  g += blob(R(9, y0 + 8, 72, 12, 2), C.wood, C.woodS, { so: 1.6, off: [0, -1.6] });
  g += blob(R(32, y0 + 10.6, 26, 7, 1.6), C.woodS, null, { O: 0.9 * X.O / 2.2 * 1.6 });
  g += blob(Ci(45, y0 + 14, 1.4), C.gold, null, { O: 0.9 });
  g += blob(R(3, y0, 84, 9, 3), C.wood, C.woodS, { so: 1.6, off: [0, -1.6] });
  g += `<path d="M8 ${y0 + 2.6} L60 ${y0 + 2.6}" stroke="${WH}" stroke-opacity="0.35" stroke-width="1.4" stroke-linecap="round"/>`;
  return g;
}
function bookshelf(top) {
  const y0 = 170 - top + X.O;
  let g = '';
  const fw = '#B7774A', fwS = '#965C35';
  g += blob(R(4, y0, 92, 163.4 - y0 + 2, 3), fw, fwS, { so: 2 });
  g += blob(R(11, y0 + 8, 78, 146 - y0), '#7A4B2D', null, { O: 1.4 });
  const shelves = [y0 + 8 + 35.5, y0 + 8 + 72, y0 + 8 + 108.5, 155.4];
  const palette = [C.red, C.blue, C.green, C.gold, C.lav, C.gum, '#E58A3C', C.sky, C.mint, '#F4E6C9'];
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  let prev = y0 + 8;
  shelves.forEach((sy, si) => {
    let x = 13;
    while (x < 84) {
      const w = 4.6 + Math.floor(rnd() * 4.5);
      if (x + w > 87) break;
      const h = 21 + Math.floor(rnd() * 11);
      const lean = si !== 3 && rnd() < 0.12 && x > 20 ? 10 : 0;
      const col = palette[Math.floor(rnd() * palette.length)];
      const bx = x, by = sy - h;
      const book = blob(R(bx, by, w, h, 0.8), col, shadeOf(col), {
        O: 1.2, so: 0.9, off: [0.9, 0],
        extra: `<rect x="${bx}" y="${by + 3}" width="${w}" height="1.4" fill="${WH}" fill-opacity="0.55"/><rect x="${bx}" y="${by + h - 5}" width="${w}" height="1.4" fill="${WH}" fill-opacity="0.55"/>`,
      });
      g += lean ? `<g transform="rotate(${lean} ${bx + w} ${sy})">${book}</g>` : book;
      x += w + (lean ? 4.6 : 0.4);
      if (rnd() < 0.08) x += 6;
    }
    if (si < 3) g += blob(R(8, sy, 84, 4.4, 1), fw, fwS, { O: 1.6, so: 1, off: [0, -1] });
    prev = sy;
  });
  g += blob(R(6, 159, 88, 7.2, 2), fwS, null, { O: 1.8 });
  g += `<path d="M10 ${y0 + 2.6} L70 ${y0 + 2.6}" stroke="${WH}" stroke-opacity="0.3" stroke-width="1.4" stroke-linecap="round"/>`;
  return g;
}
function shadeOf(col) {
  const map = { [C.red]: C.redS, [C.blue]: C.blueS, [C.green]: C.greenS, [C.gold]: C.goldS, [C.lav]: C.lavS, [C.gum]: C.gumS, [C.sky]: C.skyS, [C.mint]: C.mintS, '#E58A3C': '#C46C24', '#F4E6C9': '#E1C99C' };
  return map[col] || '#00000033';
}
function cardboardBox(top) {
  const y0 = 60 - top + X.O;
  let g = '';
  g += blob(R(3.5, y0, 53, 57.6 - y0, 2), C.kraft, C.kraftS, {
    so: 2.2,
    extra: `<rect x="25" y="${y0 - 2}" width="10" height="20" fill="#E8C690"/><path d="M3 ${y0 + 13} L57 ${y0 + 13}" stroke="${OUT}" stroke-width="1"/><path d="M25 ${y0} L25 ${y0 + 18} M35 ${y0} L35 ${y0 + 18}" stroke="#C9A06A" stroke-width="0.6"/>`,
  });
  // "this way up" arrows + paw stamp
  g += `<g fill="none" stroke="${C.kraftS}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 44 L12 34 M9 37 L12 34 L15 37 M19 44 L19 34 M16 37 L19 34 L22 37"/></g>`;
  g += `<g fill="${C.kraftS}"><ellipse cx="43" cy="42" rx="4.2" ry="3.4"/><ellipse cx="37.8" cy="36.8" rx="1.6" ry="2.1"/><ellipse cx="41.4" cy="34.4" rx="1.6" ry="2.1"/><ellipse cx="45.2" cy="34.4" rx="1.6" ry="2.1"/><ellipse cx="48.6" cy="36.8" rx="1.6" ry="2.1"/></g>`;
  return g;
}
function cushion(top) {
  const y0 = 30 - top + X.O;
  let g = '';
  const d = `M4 ${y0 + 2.4} Q9 ${y0 + 4.4} 13 ${y0} L67 ${y0} Q71 ${y0 + 4.4} 76 ${y0 + 2.4} Q73 ${y0 + 12} 76 27.6 Q70 25.4 65 27.6 L15 27.6 Q10 25.4 4 27.6 Q7 ${y0 + 12} 4 ${y0 + 2.4} Z`;
  g += blob(P(d), '#FF8FB1', '#E36F93', { so: 2, off: [1.2, -2] });
  g += ln(`M18 ${y0 + 4} Q40 ${y0 + 8} 62 ${y0 + 4}`, 0.45);
  g += blob(Ci(40, y0 + 11.6, 2), '#E36F93', null, { O: 1 });
  g += `<path d="M18 ${y0 + 2.6} L44 ${y0 + 2.6}" stroke="${WH}" stroke-opacity="0.45" stroke-width="1.6" stroke-linecap="round"/>`;
  return g;
}
function floorLamp() {
  let g = '';
  g += blob(R(18.4, 34, 3.2, 120), C.brass, C.brassS, { so: 1, off: [1, 0] });
  g += blob(P('M7 157.4 Q7 151.2 20 151.2 Q33 151.2 33 157.4 Z'), C.brass, C.brassS, { so: 1, off: [0, -1] });
  g += blob(P('M11 8 L29 8 L35.4 36 L4.6 36 Z'), '#FFF0D2', '#EAD3A6', { so: 2, extra: `<path d="M3 31.6 L37 31.6" stroke="${C.gum}" stroke-width="2"/>` });
  g += blob(Ci(20, 5.2, 2), C.brass, null, { O: 1.4 });
  return g;
}
function pottedPlant() {
  let g = '';
  const leaf = (x, y, ang, len, w) => {
    const d = `M0 0 Q${w} ${-len * 0.45} 0 ${-len} Q${-w} ${-len * 0.45} 0 0 Z`;
    return `<g transform="translate(${x} ${y}) rotate(${ang})">${blob(P(d), C.leaf, C.leafS, { O: 1.6, so: 1.2 })}${ln(`M0 -2 L0 ${-len * 0.8}`, 0.4)}</g>`;
  };
  g += leaf(25, 55, -58, 28, 7.5) + leaf(25, 55, 56, 28, 7.5) + leaf(25, 55, -30, 38, 8) + leaf(25, 55, 32, 36, 8) + leaf(25, 55, -6, 48, 8.6) + leaf(25, 55, 12, 30, 7);
  g += blob(P('M11 59 L39 59 L36 77.2 L14 77.2 Z'), C.terra, C.terraS, { O: 2, so: 2 });
  g += blob(R(8.6, 53.6, 32.8, 7.6, 2), C.terra, C.terraS, { O: 2, so: 1.2, off: [0, -1.2] });
  g += `<path d="M13 56 L30 56" stroke="${WH}" stroke-opacity="0.35" stroke-width="1.2" stroke-linecap="round"/>`;
  return g;
}
function rug() {
  let g = '';
  for (let i = 0; i < 9; i++) g += ln(`M${2.4} ${4.6 + i * 0.85} l-1.6 0`, 0.4) + ln(`M${237.6} ${4.6 + i * 0.85} l1.6 0`, 0.4);
  g += blob(E(120, 8, 116, 6.2), '#D9A066', '#C08752', {
    O: 1.5, so: 1.2, off: [0, -1.2],
    extra: `<ellipse cx="120" cy="7.6" rx="98" ry="4.4" fill="none" stroke="#C4824C" stroke-width="1.4"/><ellipse cx="120" cy="7.6" rx="78" ry="3.2" fill="none" stroke="${C.cream}" stroke-width="1.2"/><ellipse cx="120" cy="7.6" rx="56" ry="2.2" fill="none" stroke="${C.terra}" stroke-width="1.2"/><ellipse cx="120" cy="7.6" rx="30" ry="1.2" fill="#C4824C"/>`,
  });
  return g;
}
function floorLiving() {
  let g = '';
  const W = 128;
  const tones = ['#CB8C56', '#C3824D', '#D1955F'];
  const rows = [[5, 14, [40, 104]], [14, 27, [12, 76]], [27, 40, [56, 120]]];
  rows.forEach(([y1, y2, seams], ri) => {
    const pts = [...seams].sort((a, b) => a - b);
    // planks between seams, wrapping around the tile edge so both edges match
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = i + 1 < pts.length ? pts[i + 1] : pts[0] + W;
      const col = tones[(ri + i) % 3];
      for (const off of [0, -W]) g += `<rect x="${a + off}" y="${y1}" width="${b - a}" height="${y2 - y1}" fill="${col}"/>`;
      for (const off of [0, -W]) g += `<rect x="${a + off}" y="${y2 - 2}" width="${b - a}" height="2" fill="#A96D3E" fill-opacity="0.55"/>`;
    }
    for (const sx of seams) g += `<path d="M${sx} ${y1} L${sx} ${y2}" stroke="${OUT}" stroke-opacity="0.75" stroke-width="0.9"/>`;
    g += `<path d="M0 ${y2} L${W} ${y2}" stroke="${OUT}" stroke-opacity="0.75" stroke-width="0.9"/>`;
  });
  // grain flecks (kept away from the tile edges)
  const grain = [[20, 9], [70, 10], [94, 8.4], [36, 19], [100, 21], [52, 23], [22, 32], [86, 34], [106, 31]];
  g += grain.map(([x, y]) => `<path d="M${x} ${y} q4 -1.4 8 0" fill="none" stroke="#A3683A" stroke-width="0.7" stroke-linecap="round"/>`).join('');
  g = `<rect x="0" y="0" width="${W}" height="40" fill="${tones[0]}"/>` + g;
  g += `<rect x="0" y="1.4" width="${W}" height="3.6" fill="#E3AE76"/>`;
  g += `<rect x="0" y="0" width="${W}" height="1.6" fill="${OUT}"/>`;
  return g;
}

// ---------------------------------------------------------------- effects / ui
function dust(fr) {
  const sets = [
    [[9.5, 11.6, 3.2], [14.6, 12.4, 2.6], [12, 9.6, 2.6]],
    [[6.4, 10.6, 3.8], [12, 8, 4.6], [17.6, 10.4, 3.8], [12, 12, 3.4]],
    [[4.8, 8.8, 3.2], [12, 6, 3.8], [19.2, 8.6, 3], [9, 12.4, 1.6], [16, 12.6, 1.4]],
  ][fr];
  const op = [1, 0.9, 0.55][fr];
  const g = blob(sets.map(([x, y, r]) => Ci(x, y, r)), C.dust, C.dustS, { O: 1, so: 0.9 });
  return `<g opacity="${op}">${g}</g>`;
}
function barkBurst() {
  const pts = [];
  const N = 18;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const big = i % 2 === 0;
    pts.push([45 + Math.cos(a) * (big ? 43 : 34), 28 + Math.sin(a) * (big ? 26 : 19.5)]);
  }
  const d = 'M' + pts.map((p) => p.map(r2).join(' ')).join(' L') + ' Z';
  let g = blob(P(d), C.gold, C.goldS, { O: 1.8, so: 2.2 });
  g += text('WOOF!', 45, 35, 17.5, WH, { sw: 3.4 });
  return g;
}

// A little red party wagon the freed pups can ride in (tow ring at the front, right).
function wagon() {
  let g = '';
  g += blob(R(16, 29, 64, 4, 2), C.vacS, null, { O: 1.2 });
  g += blob(P('M7 9 L89 9 L85 31 L11 31 Z'), C.red, C.redS, {
    O: 2, so: 1.6, off: [1.4, -1.6],
    extra: `<path d="M13 14 L83 14" stroke="${WH}" stroke-opacity="0.35" stroke-width="1.6" stroke-linecap="round"/><path d="M8 24 L88 24" stroke="${C.redS}" stroke-width="1" stroke-linecap="round"/>`,
  });
  g += blob(R(4, 4, 88, 7, 3.5), '#FFF4DE', '#EAD3A6', { O: 1.6, so: 1, off: [0.8, -1] });
  for (const x of [24, 72]) {
    g += blob(Ci(x, 34, 9), '#4A3E39', '#36302C', { O: 1.8, so: 1.4 });
    g += blob(Ci(x, 34, 3.2), C.gold, C.goldS, { O: 1.1, so: 0.6 });
    g += `<path d="M${x - 5.6} ${34} L${x + 5.6} ${34} M${x} ${34 - 5.6} L${x} ${34 + 5.6}" stroke="#36302C" stroke-width="1" stroke-linecap="round"/>`;
  }
  g += strokes([`M90 18 Q94 16 94.5 12`], 1.6, C.gold, { O: 1 });
  return g;
}

// ---------------------------------------------------------------- kitchen (Chapter 2)
const K = { cab: '#5FB7A8', cabS: '#43978A', counterTop: '#F2E4C8', counterTopS: '#D9C7A2', steel: '#C9D3DC', steelS: '#A3B0BC', tile: '#F4EBDD', tileS: '#DCCDB8', tile2: '#D6B48E', bowl: '#FF7C9C', bowlS: '#E05E7E' };

// A kitchen counter: a pale stone top on teal cabinets with two doors and brass knobs.
function kitchenCounter(top) {
  let g = '';
  const y0 = 72 - top + X.O;
  g += blob(R(4, y0 + 8, 152, 60, 2), K.cab, K.cabS, { O: 2.2, so: 1.8, off: [1.6, -1.8] });
  g += `<path d="M80 ${y0 + 12} L80 ${y0 + 64}" stroke="${OUT}" stroke-width="1.6"/>`;
  g += `<path d="M14 ${y0 + 16} L70 ${y0 + 16} L70 ${y0 + 60} L14 ${y0 + 60} Z M90 ${y0 + 16} L146 ${y0 + 16} L146 ${y0 + 60} L90 ${y0 + 60} Z" fill="none" stroke="${K.cabS}" stroke-width="1.4" stroke-linejoin="round"/>`;
  g += blob(Ci(64, y0 + 38, 2.6), C.brass, C.brassS, { O: 1, so: 0.5 }) + blob(Ci(96, y0 + 38, 2.6), C.brass, C.brassS, { O: 1, so: 0.5 });
  g += blob(R(0, y0, 160, 10, 3), K.counterTop, K.counterTopS, { O: 2.2, so: 1.4, off: [0, -2] });
  g += `<path d="M10 ${y0 + 3} L80 ${y0 + 3}" stroke="${WH}" stroke-opacity="0.5" stroke-width="1.6" stroke-linecap="round"/>`;
  return g;
}

// A wooden stool, lower than the counter: the first step up.
function stool(top) {
  let g = '';
  const y0 = 60 - top + X.O;
  g += strokes([`M12 ${y0 + 8} L8 58`, `M44 ${y0 + 8} L48 58`, `M28 ${y0 + 8} L28 58`], 4.2, C.wood, { O: 1.4 });
  g += strokes([`M10 40 L46 40`], 2.6, C.woodS, { O: 1 });
  g += blob(E(28, y0 + 5, 25, 5), C.wood, C.woodS, { O: 2, so: 1.2, off: [0, -1.4] });
  g += `<path d="M14 ${y0 + 3} L36 ${y0 + 3}" stroke="${WH}" stroke-opacity="0.4" stroke-width="1.4" stroke-linecap="round"/>`;
  return g;
}

// A tall fridge the dog cannot run through; its top is a high shelf to reach by stool and counter.
function fridge(top) {
  let g = '';
  const y0 = 160 - top + X.O;
  g += blob(R(4, y0, 82, 156, 5), K.steel, K.steelS, { O: 2.4, so: 2, off: [2, -2] });
  g += `<path d="M8 ${y0 + 52} L82 ${y0 + 52}" stroke="${OUT}" stroke-width="1.8"/>`;
  g += strokes([`M70 ${y0 + 14} L70 ${y0 + 42}`, `M70 ${y0 + 62} L70 ${y0 + 120}`], 3.6, K.steelS, { O: 1.2 });
  g += `<path d="M12 ${y0 + 6} L12 ${y0 + 44}" stroke="${WH}" stroke-opacity="0.55" stroke-width="2" stroke-linecap="round"/>`;
  // A couple of paw magnets and a party note.
  g += blob(R(22, y0 + 70, 22, 16, 2), C.gold, C.goldS, { O: 1.2, so: 0.8 });
  g += `<path d="M26 ${y0 + 75} L40 ${y0 + 75} M26 ${y0 + 80} L36 ${y0 + 80}" stroke="${OUT}" stroke-width="1" stroke-linecap="round"/>`;
  g += blob(Ci(50, y0 + 96, 4), C.gum, C.gumS, { O: 1, so: 0.5 }) + blob(Ci(30, y0 + 104, 3.4), C.sky, C.skyS, { O: 1, so: 0.5 });
  return g;
}

// The pup's bowl, a decoration on the floor.
function dogBowl() {
  let g = '';
  g += blob(P('M4 8 L40 8 L35 18 L9 18 Z'), K.bowl, K.bowlS, { O: 1.6, so: 1, off: [1, -1] });
  g += blob(E(22, 8, 18, 3.4), K.bowlS, null, { O: 1.4 });
  g += blob(E(22, 7.6, 13, 2.2), C.cream, C.creamS, { O: 0.9, so: 0.6 });
  g += `<path d="M9 11 L19 11" stroke="${WH}" stroke-opacity="0.45" stroke-width="1.4" stroke-linecap="round"/>`;
  return g;
}

// Checkerboard kitchen tiles, one 128-unit strip that repeats.
function floorKitchen() {
  let g = blob(R(0, 0, 128, 40), K.tile, null, { O: 0 });
  for (let i = 0; i < 4; i++) {
    const x = i * 32;
    g += `<rect x="${x}" y="0" width="16" height="16" fill="${K.tile2}"/><rect x="${x + 16}" y="16" width="16" height="16" fill="${K.tile2}"/>`;
    g += `<rect x="${x}" y="32" width="16" height="8" fill="${K.tile2}"/>`;
  }
  g += `<path d="M0 0 L128 0" stroke="${OUT}" stroke-width="3"/>`;
  g += `<g stroke="${K.tileS}" stroke-width="0.8">${[16, 32, 48, 64, 80, 96, 112].map((x) => `<path d="M${x} 0 L${x} 40"/>`).join('')}<path d="M0 16 L128 16 M0 32 L128 32"/></g>`;
  return g;
}

// ---------------------------------------------------------------- registry
const S = {};
const add = (name, W, H, O, fn, top) => (S[name] = { W, H, O, fn, top });
for (let i = 0; i < 4; i++) add(`squirrel_run_${i}`, 56, 48, 1.5, () => squirrelRun(i));
add('squirrel_throw_0', 56, 48, 1.5, () => squirrelUpright({ arm: 'windup', lean: -8, tailRot: -6, face: { mouth: 'grin', brow: 'angry' } }));
add('squirrel_throw_1', 56, 48, 1.5, () => squirrelUpright({ arm: 'throw', lean: 9, tailRot: 8, face: { mouth: 'open', brow: 'angry' } }));
add('squirrel_stunned', 56, 48, 1.5, () => squirrelStunned());
add('squirrel_idle_0', 56, 48, 1.5, () => squirrelUpright({ arm: 'rest', tailRot: 0 }));
add('squirrel_idle_1', 56, 48, 1.5, () => squirrelUpright({ arm: 'rest', tailRot: -7, headDy: 0.6, headRot: 4 }));
add('boss_idle_0', 120, 130, 2.6, () => boss({ pose: 'idle' }));
add('boss_idle_1', 120, 130, 2.6, () => boss({ pose: 'idle2' }));
add('boss_throw_0', 120, 130, 2.6, () => boss({ pose: 'windup' }));
add('boss_throw_1', 120, 130, 2.6, () => boss({ pose: 'throw' }));
add('boss_hurt', 120, 130, 2.6, () => boss({ pose: 'hurt' }));
add('boss_defeated', 120, 130, 2.6, () => boss({ pose: 'defeated' }));
add('acorn', 16, 18, 1.1, () => acornAt(8, 8.6, 1, false));
add('acorn_golden', 16, 18, 1.1, () => acornAt(8, 8.6, 1, true) + sparkle(13.4, 4, 1.8));
add('bone', 28, 14, 1.2, () => bone(28, 14, false, 1.2));
add('bone_gold', 36, 18, 1.4, () => bone(36, 18, true, 1.4));
add('cake', 60, 56, 1.5, () => cake());
add('present_red', 36, 36, 1.4, () => present(C.red, C.redS, C.gold, C.goldS));
add('present_blue', 36, 36, 1.4, () => present(C.blue, C.blueS, '#FF8FB1', '#E36F93'));
add('present_green', 36, 36, 1.4, () => present(C.green, C.greenS, '#FFF4DE', '#EAD3A6'));
add('cage_closed', 84, 84, 1.6, () => cage(false));
add('cage_open', 84, 84, 1.6, () => cage(true));
add('balloon_post_down', 30, 90, 1.4, () => balloonPost(false));
add('balloon_post_up', 30, 90, 1.4, () => balloonPost(true));
add('party_arch', 200, 150, 2, () => partyArch());
add('cat_sleep', 70, 50, 1.5, () => catSleep());
add('cat_awake_0', 70, 50, 1.5, () => catAwake(0));
add('cat_awake_1', 70, 50, 1.5, () => catAwake(1));
add('vacuum_0', 60, 26, 1.4, () => vacuum(0));
add('vacuum_1', 60, 26, 1.4, () => vacuum(1));
add('toy_blocks', 40, 40, 1.4, () => toyBlocks());
add('couch', 220, 90, 2.2, () => couch(50), 50);
add('armchair', 110, 90, 2.2, () => armchair(48), 48);
add('side_table', 90, 70, 2.2, () => sideTable(68), 68);
add('bookshelf', 100, 170, 2.2, () => bookshelf(168), 168);
add('cardboard_box', 60, 60, 2.2, () => cardboardBox(59.5), 59.5);
add('cushion', 80, 30, 2, () => cushion(26), 26);
add('floor_lamp', 40, 160, 2, () => floorLamp());
add('potted_plant', 50, 80, 2, () => pottedPlant());
add('rug', 240, 16, 1.5, () => rug());
add('floor_living', 128, 40, 1.6, () => floorLiving(), 40);
for (let i = 0; i < 3; i++) add(`dust_${i}`, 24, 16, 1, () => dust(i));
add('star', 12, 12, 0.9, () => star(6, 6.4, 5.1, { O: 0.9 }));
add('heart', 16, 16, 1, () => blob(P(heartPath(8, 8.6, 6.3)), C.gum, C.gumS, { so: 1.1, extra: `<ellipse cx="10.6" cy="5.4" rx="1.3" ry="0.9" fill="${WH}" fill-opacity="0.8" transform="rotate(30 10.6 5.4)"/>` }));
add('bark_burst', 90, 56, 1.8, () => barkBurst());
add('heart_full', 24, 22, 1.4, () => blob(P(heartPath(12, 11.6, 9.6)), C.gum, C.gumS, { so: 1.6, extra: `<ellipse cx="16" cy="6.8" rx="2" ry="1.3" fill="${WH}" fill-opacity="0.85" transform="rotate(30 16 6.8)"/>` }));
add('heart_empty', 24, 22, 1.4, () => blob(P(heartPath(12, 11.6, 9.6)), '#E9DAD2', '#D5C2B8', { so: 1.6 }));
add('bone_icon', 28, 16, 1.4, () => bone(28, 16, false, 1.4));
add('wagon', 96, 44, 2, () => wagon());
add('kitchen_counter', 160, 72, 2.2, () => kitchenCounter(70), 70);
add('stool', 56, 60, 2, () => stool(58), 58);
add('fridge', 90, 160, 2.4, () => fridge(158), 158);
add('dog_bowl', 44, 20, 1.6, () => dogBowl());
add('floor_kitchen', 128, 40, 1.6, () => floorKitchen(), 40);

const only = process.argv.slice(2);
const dir = path.resolve(__dirname, '..', 'art', 'svg');
fs.mkdirSync(dir, { recursive: true });
let n = 0;
for (const [name, s] of Object.entries(S)) {
  if (only.length && !only.includes(name)) continue;
  X = { W: s.W, H: s.H, O: s.O, defs: [], id: 0, so: s.O * 0.9 };
  const body = s.fn();
  const topAttr = s.top !== undefined ? ` data-top="${s.top}"` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s.W * PX}" height="${s.H * PX}" viewBox="0 0 ${s.W} ${s.H}" data-world-w="${s.W}" data-world-h="${s.H}"${topAttr}>\n<defs>${X.defs.join('')}</defs>\n${body}\n</svg>\n`;
  fs.writeFileSync(path.join(dir, `${name}.svg`), svg);
  n++;
}
console.log(`wrote ${n} svgs`);
