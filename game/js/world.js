'use strict';
/* ===== Город: генерация карты, коллизии, поиск пути, отрисовка земли и домов ===== */

const T = 48;            // размер клетки, px
const P = 10;            // период кварталов: 2 клетки дороги + 8 клеток квартала
const NB = 7;            // кварталов по стороне
const N = NB * P + 2;    // клеток по стороне (72)
const WORLD_PX = N * T;
const ROAD = 0, SIDE = 1, GRASS = 2, BLD = 3, PATH = 4, LOT = 5;
const PERSP = 560;       // «высота камеры» для псевдо-3D домов

const World = {
  tiles: new Uint8Array(N * N),
  buildings: [],
  trees: [],
  decos: [],
  markers: [],
  parkSpots: [],
  shops: [],
  dist: new Int16Array(N * N),
  qbuf: new Int32Array(N * N),
  overview: null,
  rng: null,
};

function tileAt(tx, ty) { return (tx < 0 || ty < 0 || tx >= N || ty >= N) ? BLD : World.tiles[ty * N + tx]; }
function setTile(tx, ty, v) { if (tx >= 0 && ty >= 0 && tx < N && ty < N) World.tiles[ty * N + tx] = v; }
function solidTile(tx, ty) { return tileAt(tx, ty) === BLD; }
function solidAt(x, y) { return solidTile(Math.floor(x / T), Math.floor(y / T)); }
const isHRoad = (ty) => ty % P < 2;
const isVRoad = (tx) => tx % P < 2;
const tc = (t) => t * T + T / 2;

const LAYOUT = [
  ['park', 'res', 'res', 'park', 'beer:Хмельной Двор', 'res', 'respray'],
  ['res', 'beer:Пивной Рай', 'res', 'res', 'res', 'hospital', 'park'],
  ['res', 'park', 'fruit', 'res', 'tower', 'res', 'res'],
  ['beer:Пенная Точка', 'park', 'busstop', 'home', 'res', 'park', 'beer:Бочка'],
  ['res', 'res', 'tower', 'res', 'park', 'beer:У Петровича', 'res'],
  ['res', 'zoo', 'beer:Пиво-Воды', 'park', 'res', 'res', 'fruit'],
  ['garages', 'res', 'res', 'park', 'tower', 'res', 'park'],
];

const WALLS = ['#d6b46a', '#b9b6ad', '#a65a43', '#dcd8cc', '#c98f5b', '#9fb0b8', '#d9c9a3'];
const ROOFS = ['#4b4846', '#57524d', '#3f4245', '#5d5650', '#4f4a44'];

function genWorld() {
  const R = World.rng = mulberry32(20241119);
  const t = World.tiles;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) t[y * N + x] = (isHRoad(y) || isVRoad(x)) ? ROAD : GRASS;

  for (let bj = 0; bj < NB; bj++) {
    for (let bi = 0; bi < NB; bi++) {
      const ox = bi * P + 2, oy = bj * P + 2;
      for (let k = 0; k < 8; k++) {
        setTile(ox + k, oy, SIDE); setTile(ox + k, oy + 7, SIDE);
        setTile(ox, oy + k, SIDE); setTile(ox + 7, oy + k, SIDE);
      }
      buildBlock(LAYOUT[bj][bi], ox, oy, R);
    }
  }
  // заборы вокруг парков и вольера — по внешним краям травы внутри квартала
  World.decos.forEach((d) => { d.bb = decoBBox(d); });
  World.shops = World.markers.filter((m) => m.type === 'beer');
  buildOverview();
}

function buildBlock(kind, ox, oy, R) {
  const I = (ix) => ox + 1 + ix, J = (iy) => oy + 1 + iy;
  const fill = (ix, iy, w, h, v) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setTile(I(ix + x), J(iy + y), v); };
  const treesOn = (ix, iy, w, h, p) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (tileAt(I(ix + x), J(iy + y)) !== GRASS) continue;
      if (R() < p) addTree(I(ix + x) * T + 8 + R() * 32, J(iy + y) * T + 8 + R() * 32, R);
    }
  };
  const parkRow = (ix, iy, w, vertical) => {
    for (let k = 0; k < w; k++) {
      const tx = vertical ? I(ix) : I(ix + k), ty = vertical ? J(iy + k) : J(iy);
      World.parkSpots.push({ x: tc(tx), y: tc(ty), a: vertical ? 0 : (R() < 0.5 ? -Math.PI / 2 : Math.PI / 2) });
    }
    World.decos.push({ t: 'stalls', x: I(ix) * T, y: J(iy) * T, n: w, v: !!vertical });
  };
  const wall = () => WALLS[Math.floor(R() * WALLS.length)];
  const roof = () => ROOFS[Math.floor(R() * ROOFS.length)];
  const khr = (ix, iy, w, h, extra) => {
    const tall = R() < 0.18;
    return addBuilding(I(ix), J(iy), w, h, Object.assign({ H: tall ? 100 : 62, floors: tall ? 9 : 5, wall: wall(), roof: roof() }, extra || {}), R);
  };
  const fenceAround = () => {
    for (let iy = 0; iy < 6; iy++) for (let ix = 0; ix < 6; ix++) {
      if (tileAt(I(ix), J(iy)) !== GRASS) continue;
      const x = I(ix) * T, y = J(iy) * T;
      if (iy === 0) World.decos.push({ t: 'fence', x1: x, y1: y + 4, x2: x + T, y2: y + 4 });
      if (iy === 5) World.decos.push({ t: 'fence', x1: x, y1: y + T - 4, x2: x + T, y2: y + T - 4 });
      if (ix === 0) World.decos.push({ t: 'fence', x1: x + 4, y1: y, x2: x + 4, y2: y + T });
      if (ix === 5) World.decos.push({ t: 'fence', x1: x + T - 4, y1: y, x2: x + T - 4, y2: y + T });
    }
  };
  const marker = (type, x, y, extra) => { const m = Object.assign({ type, x, y }, extra || {}); World.markers.push(m); return m; };

  let name = null;
  if (kind.startsWith('beer:')) { name = kind.slice(5); kind = 'beer'; }

  switch (kind) {
    case 'res': {
      const v = Math.floor(R() * 4);
      if (v === 0) {
        khr(0, 0, 6, 2); fill(0, 2, 6, 1, LOT); parkRow(0, 2, 6);
        treesOn(0, 3, 6, 3, 0.45);
        World.decos.push({ t: 'playground', x: I(2) * T + 10, y: J(4) * T + 6 });
      } else if (v === 1) {
        khr(0, 4, 6, 2); fill(0, 3, 6, 1, PATH); fill(0, 2, 6, 1, LOT); parkRow(0, 2, 6);
        treesOn(0, 0, 6, 2, 0.5);
        World.decos.push({ t: 'bench', x: I(1) * T + 24, y: J(3) * T + 10, v: false });
        World.decos.push({ t: 'bench', x: I(4) * T + 24, y: J(3) * T + 10, v: false });
      } else if (v === 2) {
        khr(0, 0, 6, 2); khr(0, 4, 6, 2); fill(0, 3, 6, 1, LOT); parkRow(0, 3, 6);
        treesOn(0, 2, 6, 1, 0.55);
      } else {
        khr(0, 0, 2, 6); khr(4, 0, 2, 6); fill(3, 0, 1, 6, LOT); parkRow(3, 0, 6, true);
        fill(2, 0, 1, 6, PATH); treesOn(2, 0, 1, 6, 0);
        World.decos.push({ t: 'bench', x: I(2) * T + 24, y: J(2) * T + 24, v: true });
      }
      break;
    }
    case 'tower': {
      addBuilding(I(1), J(1), 4, 4, { H: 125, floors: 12, wall: R() < 0.5 ? '#b9b6ad' : '#dcd8cc', roof: '#45484c' }, R);
      fill(0, 0, 6, 1, LOT); parkRow(0, 0, 6);
      treesOn(0, 1, 6, 5, 0.35);
      break;
    }
    case 'park': {
      fill(2, 0, 1, 6, PATH); fill(0, 3, 6, 1, PATH);
      treesOn(0, 0, 6, 6, 0.55);
      fenceAround();
      World.decos.push({ t: 'fountain', x: I(2) * T + T / 2, y: J(3) * T + T / 2 });
      World.decos.push({ t: 'bench', x: I(1) * T + 24, y: J(3) * T + 6, v: false });
      World.decos.push({ t: 'bench', x: I(4) * T + 24, y: J(3) * T + 42, v: false });
      World.decos.push({ t: 'bench', x: I(2) * T + 6, y: J(1) * T + 24, v: true });
      break;
    }
    case 'beer': {
      const b = addBuilding(I(0), J(0), 3, 2, { H: 26, floors: 1, wall: '#7a2e2a', roof: '#3d3633', sign: 'ПИВО', sub: name, kind: 'shop' }, R);
      b.shopWin = true;
      fill(3, 0, 3, 2, LOT); parkRow(3, 1, 3);
      fill(0, 2, 6, 1, PATH);
      khr(0, 3, 6, 2);
      treesOn(0, 5, 6, 1, 0.5);
      marker('beer', tc(I(1)), tc(oy) + 6, { name, closedT: 0 });
      break;
    }
    case 'fruit': {
      addBuilding(I(0), J(0), 1, 1, { H: 16, floors: 1, wall: '#2f7d3a', roof: '#3a8f45', sign: 'ФРУКТЫ', kind: 'kiosk' }, R);
      khr(0, 4, 6, 2); fill(0, 3, 6, 1, PATH);
      treesOn(1, 0, 5, 3, 0.4);
      marker('fruit', tc(I(0)), tc(oy) + 6);
      break;
    }
    case 'busstop': {
      khr(0, 0, 6, 2); fill(0, 2, 6, 1, PATH); fill(0, 3, 6, 1, LOT); parkRow(0, 3, 5);
      treesOn(0, 4, 6, 2, 0.45);
      const sx = (ox + 7) * T, sy = (oy + 3) * T;
      World.decos.push({ t: 'busstop', x: sx + 10, y: sy + 6, w: 34, h: 84 });
      World.decos.push({ t: 'busbay', x: (ox + 8) * T, y: (oy + 2) * T, h: T * 4 });
      marker('busstop', sx + T / 2 - 4, sy + T);
      break;
    }
    case 'home': {
      addBuilding(I(0), J(0), 6, 2, { H: 62, floors: 5, wall: '#d6b46a', roof: '#4b4846', sign: 'ДОМ', kind: 'home' }, R);
      fill(0, 2, 6, 1, PATH); fill(0, 3, 6, 1, LOT); parkRow(0, 3, 6);
      treesOn(0, 4, 6, 2, 0.4);
      World.decos.push({ t: 'bench', x: I(4) * T + 24, y: J(2) * T + 38, v: false });
      World.decos.push({ t: 'playground', x: I(2) * T + 10, y: J(4) * T + 6 });
      marker('home', tc(I(2)), tc(J(2)));
      break;
    }
    case 'zoo': {
      addBuilding(I(1), J(0), 4, 2, { H: 30, floors: 2, wall: '#6d8f4e', roof: '#4d6b3a', sign: 'ЗООПАРК', kind: 'zoo' }, R);
      fill(0, 2, 6, 1, PATH);
      treesOn(0, 3, 6, 3, 0.35);
      treesOn(0, 0, 1, 2, 0.6); treesOn(5, 0, 1, 2, 0.6);
      World.decos.push({ t: 'enclosure', x: I(0) * T + 6, y: J(3) * T + 6, w: 6 * T - 12, h: 3 * T - 12 });
      World.decos.push({ t: 'sofaDeco', x: I(1) * T + 24, y: J(2) * T + 24, a: -Math.PI / 2, c: '#8c2f2f' });
      World.decos.push({ t: 'sofaDeco', x: I(4) * T + 24, y: J(2) * T + 24, a: -Math.PI / 2, c: '#3f5a8c' });
      marker('zoo', tc(I(2)) + T / 2, tc(J(2)));
      break;
    }
    case 'hospital': {
      addBuilding(I(1), J(0), 4, 3, { H: 50, floors: 4, wall: '#e9e7e1', roof: '#c9c6bf', sign: 'ТРАВМПУНКТ', kind: 'hospital', cross: true }, R);
      fill(0, 3, 6, 1, PATH); fill(0, 4, 6, 2, LOT); parkRow(0, 4, 6);
      treesOn(0, 0, 1, 3, 0.6); treesOn(5, 0, 1, 3, 0.6);
      marker('hospital', tc(I(2)) + T / 2, tc(J(3)));
      break;
    }
    case 'respray': {
      addBuilding(I(0), J(0), 6, 2, { H: 18, floors: 1, wall: '#8a8f94', roof: '#5b6066', sign: 'ГАРАЖ ДЯДИ ВИТИ', kind: 'garage' }, R);
      fill(0, 2, 6, 4, LOT);
      World.decos.push({ t: 'pad', x: I(2) * T, y: J(2) * T + 24, w: 2 * T, h: 2 * T });
      marker('respray', I(3) * T, J(3) * T + 24);
      break;
    }
    case 'garages': {
      addBuilding(I(0), J(0), 6, 2, { H: 18, floors: 1, wall: '#7f858a', roof: '#5b6066', sign: 'ГАРАЖИ', kind: 'garage' }, R);
      addBuilding(I(0), J(4), 6, 2, { H: 18, floors: 1, wall: '#7f858a', roof: '#5b6066', kind: 'garage' }, R);
      fill(0, 2, 6, 2, LOT);
      marker('garage', I(3) * T, J(3) * T);
      break;
    }
  }
}

function addBuilding(tx, ty, w, h, o, R) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setTile(tx + x, ty + y, BLD);
  const b = {
    x: tx * T, y: ty * T, w: w * T, h: h * T,
    H: o.H || 62, floors: o.floors || 5, wall: o.wall || '#b9b6ad', roof: o.roof || '#4b4846',
    sign: o.sign || null, sub: o.sub || null, kind: o.kind || 'res', cross: !!o.cross,
    details: [], lit: [],
  };
  const nv = Math.max(1, Math.floor((w * h) / 2));
  for (let i = 0; i < nv; i++) b.details.push({ t: 'vent', u: 10 + R() * (b.w - 26), v: 10 + R() * (b.h - 26), s: 7 + R() * 7 });
  if (b.kind === 'res' && R() < 0.6) b.details.push({ t: 'ant', u: 14 + R() * (b.w - 28), v: 10 + R() * (b.h - 20) });
  if (b.kind === 'res' && R() < 0.4) b.details.push({ t: 'dish', u: 14 + R() * (b.w - 28), v: 10 + R() * (b.h - 20) });
  for (let i = 0; i < 64; i++) b.lit.push(R() < 0.22);
  World.buildings.push(b);
  World.decos.push({ t: 'bshadow', b });
  return b;
}

function addTree(x, y, R) {
  World.trees.push({ x, y, r: 15 + R() * 11, h: 20 + R() * 16, v: Math.floor(R() * 4) });
}

function decoBBox(d) {
  switch (d.t) {
    case 'fence': return [Math.min(d.x1, d.x2) - 4, Math.min(d.y1, d.y2) - 4, Math.max(d.x1, d.x2) + 4, Math.max(d.y1, d.y2) + 4];
    case 'stalls': return d.v ? [d.x - 2, d.y - 2, d.x + T + 2, d.y + d.n * T + 2] : [d.x - 2, d.y - 2, d.x + d.n * T + 2, d.y + T + 2];
    case 'bshadow': return [d.b.x, d.b.y, d.b.x + d.b.w + 16, d.b.y + d.b.h + 16];
    case 'busstop': case 'pad': case 'enclosure': return [d.x - 4, d.y - 4, d.x + d.w + 4, d.y + d.h + 4];
    case 'busbay': return [d.x, d.y, d.x + T, d.y + d.h];
    case 'playground': return [d.x - 4, d.y - 4, d.x + 80, d.y + 70];
    default: return [d.x - 40, d.y - 40, d.x + 40, d.y + 40];
  }
}

/* ===== Коллизии ===== */
function collideCircle(o, r) {
  let hit = false, nx = 0, ny = 0;
  const x0 = Math.floor((o.x - r) / T), x1 = Math.floor((o.x + r) / T);
  const y0 = Math.floor((o.y - r) / T), y1 = Math.floor((o.y + r) / T);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!solidTile(tx, ty)) continue;
      const left = tx * T, top = ty * T;
      const cx = clamp(o.x, left, left + T), cy = clamp(o.y, top, top + T);
      let dx = o.x - cx, dy = o.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2), p = r - d;
        dx /= d; dy /= d;
        o.x += dx * p; o.y += dy * p; nx += dx; ny += dy;
      } else {
        // центр внутри стены: выталкиваем по кратчайшей оси
        const pl = o.x - left, pr = left + T - o.x, pt = o.y - top, pb = top + T - o.y;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) { o.x = left - r; nx -= 1; } else if (m === pr) { o.x = left + T + r; nx += 1; }
        else if (m === pt) { o.y = top - r; ny -= 1; } else { o.y = top + T + r; ny += 1; }
      }
    }
  }
  if (!hit) return null;
  const l = Math.hypot(nx, ny) || 1;
  return { nx: nx / l, ny: ny / l };
}

function lineOfSight(x0, y0, x1, y1) {
  const d = dist(x0, y0, x1, y1), steps = Math.ceil(d / 14);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (solidAt(lerp(x0, x1, t), lerp(y0, y1, t))) return false;
  }
  return true;
}

/* Поле расстояний (BFS) от клетки игрока — по нему гориллы на диванах объезжают дома */
function computeFlow(px, py) {
  const d = World.dist, q = World.qbuf;
  d.fill(32767);
  let sx = clamp(Math.floor(px / T), 0, N - 1), sy = clamp(Math.floor(py / T), 0, N - 1);
  if (solidTile(sx, sy)) {
    let found = false;
    for (let r = 1; r < 4 && !found; r++) for (let yy = -r; yy <= r && !found; yy++) for (let xx = -r; xx <= r; xx++) {
      if (!solidTile(sx + xx, sy + yy)) { sx += xx; sy += yy; found = true; break; }
    }
  }
  let h = 0, tl = 0;
  d[sy * N + sx] = 0; q[tl++] = sy * N + sx;
  while (h < tl) {
    const i = q[h++], x = i % N, y = (i / N) | 0, nd = d[i] + 1;
    if (x > 0 && d[i - 1] > nd && World.tiles[i - 1] !== BLD) { d[i - 1] = nd; q[tl++] = i - 1; }
    if (x < N - 1 && d[i + 1] > nd && World.tiles[i + 1] !== BLD) { d[i + 1] = nd; q[tl++] = i + 1; }
    if (y > 0 && d[i - N] > nd && World.tiles[i - N] !== BLD) { d[i - N] = nd; q[tl++] = i - N; }
    if (y < N - 1 && d[i + N] > nd && World.tiles[i + N] !== BLD) { d[i + N] = nd; q[tl++] = i + N; }
  }
}
function flowAt(tx, ty) { return (tx < 0 || ty < 0 || tx >= N || ty >= N) ? 32767 : World.dist[ty * N + tx]; }

/** Следующая точка по полю расстояний (центр соседней клетки, ближе к игроку). */
function flowNext(x, y) {
  const tx = Math.floor(x / T), ty = Math.floor(y / T);
  let best = flowAt(tx, ty), bx = tx, by = ty;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    if (dx && dy && (solidTile(tx + dx, ty) || solidTile(tx, ty + dy))) continue;
    const v = flowAt(tx + dx, ty + dy);
    if (v < best) { best = v; bx = tx + dx; by = ty + dy; }
  }
  return { x: tc(bx), y: tc(by), d: best };
}

/* ===== Обзорная карта ===== */
function buildOverview() {
  const s = 4;
  const cv = document.createElement('canvas'); cv.width = cv.height = N * s;
  const g = cv.getContext('2d');
  const cols = ['#3d4045', '#8f8c85', '#5f6a2c', '#c9b48a', '#9e8c68', '#55585d'];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { g.fillStyle = cols[tileAt(x, y)]; g.fillRect(x * s, y * s, s, s); }
  for (const b of World.buildings) { g.fillStyle = shade(b.wall, 0.9); g.fillRect(b.x / T * s, b.y / T * s, b.w / T * s, b.h / T * s); }
  World.overview = cv;
}
