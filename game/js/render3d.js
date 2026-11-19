'use strict';
/* ===== 3D-рендер на Three.js: город, модели, камера за спиной героя ===== */

const U = 1 / 12;          // пиксели мира → метры (клетка 48px = 4 м)
const CURB = 0.15;         // высота тротуара
const FOG_NEAR = 55, FOG_FAR = 165;
function gY(x, y) { return tileAt(Math.floor(x / T), Math.floor(y / T)) === ROAD ? 0 : CURB; }

/* ---------- конструктор геометрии с цветами вершин ---------- */
const _c = new THREE.Color();
class GB {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; this.i = []; this.v = 0; }
  _push(pts, col, uvs, out) {
    const a = pts[0], b = pts[1], c = pts[2];
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (out && nx * out[0] + ny * out[1] + nz * out[2] < 0) {
      pts = pts.slice().reverse();
      if (uvs) { const u = []; for (let k = pts.length - 1; k >= 0; k--) u.push(uvs[k * 2], uvs[k * 2 + 1]); uvs = u; }
      nx = -nx; ny = -ny; nz = -nz;
    }
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    _c.set(col);
    const base = this.v;
    for (let k = 0; k < pts.length; k++) {
      const q = pts[k];
      this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); this.c.push(_c.r, _c.g, _c.b);
      if (uvs) this.uv.push(uvs[k * 2], uvs[k * 2 + 1]); else this.uv.push(0, 0);
    }
    if (pts.length === 4) this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else this.i.push(base, base + 1, base + 2);
    this.v += pts.length;
  }
  quad(a, b, c, d, col, uvs, out) { this._push([a, b, c, d], col, uvs, out); }
  tri(a, b, c, col, out) { this._push([a, b, c], col, null, out); }
  /** Коробка: центр, размеры, поворот вокруг Y (угол как в 2D: от +X к +Z) */
  box(cx, cy, cz, sx, sy, sz, col, rot) {
    const ca = Math.cos(rot || 0), sa = Math.sin(rot || 0);
    const P = (x, y, z) => [cx + x * ca - z * sa, cy + y, cz + x * sa + z * ca];
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const v = [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), P(-hx, hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), P(-hx, hy, hz)];
    const C = [cx, cy, cz];
    const f = (a, b, c, d, sh) => {
      const m = [(v[a][0] + v[c][0]) / 2 - C[0], (v[a][1] + v[c][1]) / 2 - C[1], (v[a][2] + v[c][2]) / 2 - C[2]];
      this.quad(v[a], v[b], v[c], v[d], col, null, m);
    };
    f(4, 5, 6, 7); f(0, 1, 2, 3); f(0, 1, 5, 4); f(3, 2, 6, 7); f(0, 3, 7, 4); f(1, 2, 6, 5);
  }
  /** Цилиндр с осью Z (колёса) */
  cylZ(cx, cy, cz, r, len, col, seg) {
    seg = seg || 8;
    const z0 = cz - len / 2, z1 = cz + len / 2;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const p0 = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r];
      const mid = [Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0];
      this.quad([p0[0], p0[1], z0], [p1[0], p1[1], z0], [p1[0], p1[1], z1], [p0[0], p0[1], z1], col, null, mid);
      this.tri([cx, cy, z0], [p0[0], p0[1], z0], [p1[0], p1[1], z0], col, [0, 0, -1]);
      this.tri([cx, cy, z1], [p0[0], p0[1], z1], [p1[0], p1[1], z1], col, [0, 0, 1]);
    }
  }
  /** Цилиндр с осью Y */
  cylY(cx, cy, cz, r, h, col, seg) {
    seg = seg || 10;
    const y0 = cy - h / 2, y1 = cy + h / 2;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const x0 = cx + Math.cos(a0) * r, z0 = cz + Math.sin(a0) * r, x1 = cx + Math.cos(a1) * r, z1 = cz + Math.sin(a1) * r;
      const mid = [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)];
      this.quad([x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], col, null, mid);
      this.tri([cx, y1, cz], [x0, y1, z0], [x1, y1, z1], col, [0, 1, 0]);
    }
  }
  /** Низкополигональный эллипсоид */
  ball(cx, cy, cz, rx, ry, rz, col, seg, rings) {
    seg = seg || 8; rings = rings || 6;
    const P = (th, ph) => [cx + rx * Math.sin(th) * Math.cos(ph), cy + ry * Math.cos(th), cz + rz * Math.sin(th) * Math.sin(ph)];
    _c.set(col);
    for (let r = 0; r < rings; r++) {
      const t0 = r / rings * Math.PI, t1 = (r + 1) / rings * Math.PI;
      for (let k = 0; k < seg; k++) {
        const p0 = k / seg * TAU, p1 = (k + 1) / seg * TAU;
        const pts = r === 0 ? [P(t0, p0), P(t1, p1), P(t1, p0)] : r === rings - 1 ? [P(t0, p0), P(t0, p1), P(t1, p0)] : [P(t0, p0), P(t0, p1), P(t1, p1), P(t1, p0)];
        const tm = (t0 + t1) / 2, pm = (p0 + p1) / 2;
        let nx = Math.sin(tm) * Math.cos(pm) / rx, ny = Math.cos(tm) / ry, nz = Math.sin(tm) * Math.sin(pm) / rz;
        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        const a = pts[0], b = pts[1], c = pts[2];
        const cxp = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
        const cyp = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
        const czp = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        const q = cxp * nx + cyp * ny + czp * nz < 0 ? pts.reverse() : pts;
        const base = this.v;
        for (const v of q) { this.p.push(v[0], v[1], v[2]); this.n.push(nx, ny, nz); this.c.push(_c.r, _c.g, _c.b); this.uv.push(0, 0); }
        if (q.length === 4) this.i.push(base, base + 1, base + 2, base, base + 2, base + 3); else this.i.push(base, base + 1, base + 2);
        this.v += q.length;
      }
    }
  }
  mesh(mat) { return new THREE.Mesh(this.geometry(), mat || VCMAT); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}

/* ---------- текстуры из canvas ---------- */
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasTex(cv, repeat) {
  const t = new THREE.CanvasTexture(cv);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}
function noiseTex() {
  const cv = mkCanvas(256, 256), g = cv.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  const R = mulberry32(9);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(0,0,0,${0.02 + R() * 0.04})`; g.beginPath(); g.arc(R() * 256, R() * 256, 8 + R() * 30, 0, TAU); g.fill(); }
  for (let i = 0; i < 5000; i++) { const v = 170 + (R() * 85) | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(R() * 256, R() * 256, 1.5, 1.5); }
  return canvasTex(cv, true);
}
function windowTex(kind) {
  const cv = mkCanvas(256, 256), g = cv.getContext('2d');
  const R = mulberry32(kind.length * 31 + 7);
  g.fillStyle = '#f1efe9'; g.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const x = c * 32, y = r * 32;
    if (kind === 'res') {
      if (R() < 0.16) { g.fillStyle = '#cfcac0'; g.fillRect(x + 2, y + 18, 28, 12); g.fillStyle = '#b5afa3'; g.fillRect(x + 2, y + 18, 28, 2); }
      g.fillStyle = '#fbfbfb'; g.fillRect(x + 7, y + 5, 18, 19);
      const lit = R() < 0.18;
      g.fillStyle = lit ? '#ffd877' : (R() < 0.5 ? '#3b4d60' : '#2c3b4b'); g.fillRect(x + 9, y + 7, 14, 15);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 15, y + 7, 1.5, 15);
      if (!lit && R() < 0.4) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 10, y + 8, 4, 6); }
      g.fillStyle = '#9d988e'; g.fillRect(x + 6, y + 24, 20, 2);
      g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(x, y + 31, 32, 1);
    } else if (kind === 'shop') {
      g.fillStyle = '#3a3a3a'; g.fillRect(x + 1, y + 3, 30, 26);
      g.fillStyle = R() < 0.5 ? '#f3d27a' : '#7fb3cf'; g.fillRect(x + 3, y + 5, 26, 22);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 6, y + 7, 3, 18); g.fillRect(x + 12, y + 7, 2, 18);
      if (R() < 0.3) { g.fillStyle = '#6b3a12'; for (let k = 0; k < 4; k++) g.fillRect(x + 7 + k * 5, y + 16, 3, 9); }
    } else {
      g.fillStyle = '#6f757b'; g.fillRect(x + 2, y + 4, 28, 28);
      g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 6; k++) g.fillRect(x + 2, y + 7 + k * 4.5, 28, 1);
      g.fillStyle = R() < 0.4 ? '#8a5a3a' : '#556070'; g.fillRect(x + 3, y + 5, 26, 2);
    }
  }
  return canvasTex(cv, true);
}
function textTex(lines, w, h, bg, fg, border) {
  const cv = mkCanvas(w, h), g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = border; g.lineWidth = Math.max(6, h * 0.06); g.strokeRect(4, 4, w - 8, h - 8); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach((ln, i) => {
    g.fillStyle = ln.c || fg;
    g.font = `900 ${ln.s}px sans-serif`;
    const y = h * (n === 1 ? 0.53 : i === 0 ? 0.38 : 0.78);
    g.fillText(ln.t, w / 2, y, w - 20);
  });
  return canvasTex(cv, false);
}
function emojiTex(e, ring) {
  const cv = mkCanvas(128, 128), g = cv.getContext('2d');
  if (ring) { g.fillStyle = ring; g.beginPath(); g.arc(64, 64, 58, 0, TAU); g.fill(); g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(64, 64, 50, 0, TAU); g.fill(); }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '68px sans-serif';
  g.fillText(e, 64, 70);
  return canvasTex(cv, false);
}
function softDotTex() {
  const cv = mkCanvas(64, 64), g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return canvasTex(cv, false);
}
function skyTex() {
  const cv = mkCanvas(1024, 512), g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#2f6fc4'); gr.addColorStop(0.7, '#78a9df'); gr.addColorStop(1, '#bdd4e8');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = '#bdd4e8'; g.fillRect(0, 256, 1024, 256);
  const R = mulberry32(42);
  for (let i = 0; i < 26; i++) {
    const cx = R() * 1024, cy = 60 + R() * 170, w = 60 + R() * 140;
    for (let k = 0; k < 9; k++) {
      g.fillStyle = `rgba(255,255,255,${0.35 + R() * 0.4})`;
      g.beginPath(); g.ellipse(cx + (R() - 0.5) * w, cy + (R() - 0.5) * 18, 20 + R() * w * 0.4, 9 + R() * 14, 0, 0, TAU); g.fill();
    }
  }
  return canvasTex(cv, false);
}

/* ---------- материалы ---------- */
const MatCache = {};
function lam(hex) { return MatCache[hex] || (MatCache[hex] = new THREE.MeshLambertMaterial({ color: hex })); }
let VCMAT = null;

/* ===== Рендер ===== */
const R3 = {
  ready: false, frameNo: 0, reg: new Set(), carGeo: {}, sofaGeo: {},
  yaw: -Math.PI / 2, camDrag: 0, camPos: new THREE.Vector3(), lookAt: new THREE.Vector3(),
  _v: new THREE.Vector3(), _m: new THREE.Matrix4(), _q: new THREE.Quaternion(), _s: new THREE.Vector3(), _e: new THREE.Euler(),

  init(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    // если Android отобрал WebGL-контекст (сворачивание) — прогресс уже сохранён, просто перезапускаемся
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); }, false);
    canvas.addEventListener('webglcontextrestored', () => { location.reload(); }, false);
    r.setClearColor(0xbdd4e8);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xbdd4e8, FOG_NEAR, FOG_FAR);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.3, FOG_FAR + 15);
    this.scene.add(new THREE.HemisphereLight(0xe4f0ff, 0x6b6450, 0.95));
    const sun = new THREE.DirectionalLight(0xfff0d0, 0.7);
    sun.position.set(-0.6, 1, -0.35);
    this.scene.add(sun);
    VCMAT = new THREE.MeshLambertMaterial({ vertexColors: true });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(FOG_FAR + 5, 24, 12), new THREE.MeshBasicMaterial({ map: skyTex(), side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -1;
    this.sky = sky; this.scene.add(sky);
    this.buildWorld();
    this.buildDynamic();
    this.ready = true;
  },

  resize(w, h, dpr) {
    this.renderer.setPixelRatio(Math.min(dpr, 1.5));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.3 ? 70 : 58;
    this.camera.updateProjectionMatrix();
  },

  /* ---------- статичный город ---------- */
  buildWorld() {
    const S = T * U;
    const ground = new GB(), marks = new GB(), deco = new GB(), roofs = new GB();
    const walls = { res: new GB(), shop: new GB(), garage: new GB() };
    const COLS = { [ROAD]: '#50535a', [SIDE]: '#a19e96', [GRASS]: '#6f7a33', [PATH]: '#ab976f', [LOT]: '#62656b', [BLD]: '#55524c' };
    const base = new THREE.Color();
    const leafCols = ['#d9a52a', '#c9752a', '#e2c247', '#b0602a'];
    for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
      const v = tileAt(tx, ty), h = v === ROAD ? 0 : CURB;
      const x0 = tx * S, z0 = ty * S, x1 = x0 + S, z1 = z0 + S;
      base.set(COLS[v]).offsetHSL(0, 0, (hash2(tx, ty) - 0.5) * (v === GRASS ? 0.07 : 0.035));
      const col = '#' + base.getHexString();
      ground.quad([x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1], col, [tx * 0.5, ty * 0.5, tx * 0.5 + 0.5, ty * 0.5, tx * 0.5 + 0.5, ty * 0.5 + 0.5, tx * 0.5, ty * 0.5 + 0.5], [0, 1, 0]);
      if (h > 0) {
        const curb = '#c3c0b8';
        if (tileAt(tx, ty - 1) === ROAD) ground.quad([x0, 0, z0], [x1, 0, z0], [x1, h, z0], [x0, h, z0], curb, null, [0, 0, -1]);
        if (tileAt(tx, ty + 1) === ROAD) ground.quad([x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], curb, null, [0, 0, 1]);
        if (tileAt(tx - 1, ty) === ROAD) ground.quad([x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], curb, null, [-1, 0, 0]);
        if (tileAt(tx + 1, ty) === ROAD) ground.quad([x1, 0, z0], [x1, 0, z1], [x1, h, z1], [x1, h, z0], curb, null, [1, 0, 0]);
        // опавшие листья
        const nl = v === GRASS ? 4 : v === SIDE || v === PATH ? 1 : 0;
        for (let k = 0; k < nl; k++) {
          const a = hash2(tx * 13 + k, ty * 7 - k), b = hash2(ty * 5 + k, tx * 11 + k);
          if (v !== GRASS && a < 0.5) continue;
          const lx = x0 + 0.3 + a * (S - 0.6), lz = z0 + 0.3 + b * (S - 0.6), r = 0.16, ang = a * 6;
          const c = Math.cos(ang) * r, s = Math.sin(ang) * r;
          ground.quad([lx - c, h + 0.01, lz - s], [lx - s, h + 0.01, lz + c], [lx + c, h + 0.01, lz + s], [lx + s, h + 0.01, lz - c], leafCols[(a * 4) | 0], null, [0, 1, 0]);
        }
      }
      // разметка
      if (v === ROAD) {
        const hr = isHRoad(ty), vr = isVRoad(tx), W2 = '#e4e3da', y = 0.02;
        const rect = (px0, pz0, px1, pz1, c) => marks.quad([px0 * U, y, pz0 * U], [px1 * U, y, pz0 * U], [px1 * U, y, pz1 * U], [px0 * U, y, pz1 * U], c || W2, null, [0, 1, 0]);
        if (hr && !vr) {
          if (ty % P === 0) rect(tx * T + 8, (ty + 1) * T - 1.5, tx * T + 30, (ty + 1) * T + 1.5);
          const m = tx % P;
          if (m === 2 || m === P - 1) for (let k = 4; k < T; k += 11) rect(tx * T + 6, ty * T + k, tx * T + T - 6, ty * T + k + 6);
        } else if (vr && !hr) {
          if (tx % P === 0) rect((tx + 1) * T - 1.5, ty * T + 8, (tx + 1) * T + 1.5, ty * T + 30);
          const m = ty % P;
          if (m === 2 || m === P - 1) for (let k = 4; k < T; k += 11) rect(tx * T + k, ty * T + 6, tx * T + k + 6, ty * T + T - 6);
        }
      }
    }
    const seg = (gb, x1, y1, x2, y2, w, h, col) => {
      const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, nx = -dy / l * w / 2, ny = dx / l * w / 2;
      gb.quad([(x1 + nx) * U, h, (y1 + ny) * U], [(x2 + nx) * U, h, (y2 + ny) * U], [(x2 - nx) * U, h, (y2 - ny) * U], [(x1 - nx) * U, h, (y1 - ny) * U], col, null, [0, 1, 0]);
    };

    // фонари на углах кварталов
    for (let bj = 0; bj < NB; bj++) for (let bi = 0; bi < NB; bi++) {
      const ox = bi * P + 2, oy = bj * P + 2;
      for (const [cx, cy, ax, ay] of [[ox, oy, -1, -1], [ox + 7, oy, 1, -1], [ox, oy + 7, -1, 1], [ox + 7, oy + 7, 1, 1]]) {
        const px = (cx * T + T / 2 + ax * 14) * U, pz = (cy * T + T / 2 + ay * 14) * U;
        deco.box(px, CURB + 3, pz, 0.14, 6, 0.14, '#5b5f63');
        deco.box(px + ax * 0.6, CURB + 5.9, pz + ay * 0.6, 1.3, 0.1, 0.1, '#5b5f63', Math.atan2(ay, ax));
        deco.box(px + ax * 1.15, CURB + 5.8, pz + ay * 1.15, 0.5, 0.14, 0.3, '#f4f1dc', Math.atan2(ay, ax));
      }
    }

    // декор
    for (const d of World.decos) {
      switch (d.t) {
        case 'fence': {
          const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) * U, ang = Math.atan2(d.y2 - d.y1, d.x2 - d.x1);
          const mx = (d.x1 + d.x2) / 2 * U, mz = (d.y1 + d.y2) / 2 * U;
          deco.box(mx, CURB + 0.45, mz, len, 0.06, 0.05, '#4f5a44', ang);
          deco.box(mx, CURB + 0.95, mz, len, 0.06, 0.05, '#4f5a44', ang);
          const n = Math.max(1, Math.round(len / 1.2));
          for (let i = 0; i <= n; i++) {
            const t = i / n;
            deco.box(lerp(d.x1, d.x2, t) * U, CURB + 0.55, lerp(d.y1, d.y2, t) * U, 0.06, 1.1, 0.06, '#3f4836');
          }
          break;
        }
        case 'stalls': {
          for (let i = 0; i <= d.n; i++) {
            if (d.v) seg(marks, d.x + 4, d.y + i * T, d.x + T - 4, d.y + i * T, 2, CURB + 0.02, '#e6e6dc');
            else seg(marks, d.x + i * T, d.y + 4, d.x + i * T, d.y + T - 4, 2, CURB + 0.02, '#e6e6dc');
          }
          break;
        }
        case 'bench': {
          const a = d.v ? Math.PI / 2 : 0, x = d.x * U, z = d.y * U;
          deco.box(x, CURB + 0.45, z, 1.8, 0.08, 0.45, '#8a5a2e', a);
          const bx = -Math.sin(a) * 0.22, bz = Math.cos(a) * 0.22;
          deco.box(x - bx, CURB + 0.75, z - bz, 1.8, 0.35, 0.06, '#8a5a2e', a);
          deco.box(x + Math.cos(a) * 0.75, CURB + 0.22, z + Math.sin(a) * 0.75, 0.08, 0.45, 0.45, '#333', a);
          deco.box(x - Math.cos(a) * 0.75, CURB + 0.22, z - Math.sin(a) * 0.75, 0.08, 0.45, 0.45, '#333', a);
          break;
        }
        case 'fountain': {
          const x = d.x * U, z = d.y * U;
          deco.cylY(x, CURB + 0.25, z, 1.7, 0.5, '#8a877f', 16);
          deco.cylY(x, CURB + 0.46, z, 1.45, 0.1, '#4f86a8', 16);
          deco.cylY(x, CURB + 0.9, z, 0.25, 1.0, '#8a877f', 8);
          deco.cylY(x, CURB + 1.45, z, 0.5, 0.12, '#8a877f', 10);
          break;
        }
        case 'playground': {
          const x = d.x * U, z = d.y * U;
          marks.quad([x, CURB + 0.03, z], [x + 2.8, CURB + 0.03, z], [x + 2.8, CURB + 0.03, z + 2.8], [x, CURB + 0.03, z + 2.8], '#dcc88e', null, [0, 1, 0]);
          deco.box(x + 1.4, CURB + 0.12, z, 2.8, 0.25, 0.12, '#8b5a2b'); deco.box(x + 1.4, CURB + 0.12, z + 2.8, 2.8, 0.25, 0.12, '#8b5a2b');
          deco.box(x, CURB + 0.12, z + 1.4, 0.12, 0.25, 2.8, '#8b5a2b'); deco.box(x + 2.8, CURB + 0.12, z + 1.4, 0.12, 0.25, 2.8, '#8b5a2b');
          deco.box(x + 4.1, CURB + 0.9, z + 1.4, 0.8, 1.8, 0.8, '#c0392b');
          deco.box(x + 4.1, CURB + 0.5, z + 2.6, 0.6, 0.12, 1.8, '#2e86c1');
          deco.box(x + 5.3, CURB + 1.1, z + 0.6, 0.1, 2.2, 0.1, '#555'); deco.box(x + 6.4, CURB + 1.1, z + 0.6, 0.1, 2.2, 0.1, '#555');
          deco.box(x + 5.85, CURB + 2.2, z + 0.6, 1.2, 0.1, 0.1, '#555');
          deco.box(x + 5.85, CURB + 0.6, z + 0.6, 0.5, 0.06, 0.3, '#e67e22');
          break;
        }
        case 'busstop': {
          const x = d.x * U, z = d.y * U, w = d.w * U, h = d.h * U;
          deco.box(x + 0.1, CURB + 1.2, z + h / 2, 0.08, 2.4, h, '#2a5db0');
          deco.box(x + w / 2, CURB + 2.45, z + h / 2, w + 0.4, 0.12, h + 0.3, '#1f4fa0');
          deco.box(x + w / 2, CURB + 1.2, z + 0.05, w, 2.4, 0.08, '#2a5db0');
          deco.box(x + w / 2, CURB + 1.2, z + h - 0.05, w, 2.4, 0.08, '#2a5db0');
          deco.box(x + 0.5, CURB + 0.5, z + h / 2, 0.4, 0.08, h * 0.7, '#8a8f96');
          deco.box(x + w + 0.6, CURB + 1.4, z - 0.4, 0.08, 2.8, 0.08, '#666');
          deco.box(x + w + 0.6, CURB + 2.7, z - 0.4, 0.06, 0.6, 0.6, '#ffffff');
          break;
        }
        case 'busbay': {
          let px = d.x + 6, py = d.y + 40, k = 0;
          for (let yy = d.y + 40; yy < d.y + d.h - 40; yy += 16, k++) { const nx = d.x + (k % 2 ? 6 : 22); seg(marks, px, py, nx, yy + 16, 3, 0.02, '#e1b52c'); px = nx; py = yy + 16; }
          break;
        }
        case 'enclosure': {
          const x0 = d.x * U, z0 = d.y * U, x1 = (d.x + d.w) * U, z1 = (d.y + d.h) * U;
          marks.quad([x0, CURB + 0.02, z0], [x1, CURB + 0.02, z0], [x1, CURB + 0.02, z1], [x0, CURB + 0.02, z1], '#9a7b4a', null, [0, 1, 0]);
          for (const [a, b, c, e] of [[x0, z0, x1, z0], [x0, z1, x1, z1], [x0, z0, x0, z1], [x1, z0, x1, z1]]) {
            const len = Math.hypot(c - a, e - b), ang = Math.atan2(e - b, c - a);
            deco.box((a + c) / 2, CURB + 1.2, (b + e) / 2, len, 0.1, 0.1, '#6b5b3a', ang);
            deco.box((a + c) / 2, CURB + 0.6, (b + e) / 2, len, 0.1, 0.1, '#6b5b3a', ang);
            const n = Math.round(len / 1.5);
            for (let i = 0; i <= n; i++) deco.box(lerp(a, c, i / n), CURB + 0.7, lerp(b, e, i / n), 0.12, 1.4, 0.12, '#5a4a2e');
          }
          deco.box((x0 + x1) / 2, CURB + 0.4, (z0 + z1) / 2, 4, 0.8, 0.8, '#7a5a30');
          break;
        }
        case 'sofaDeco': {
          const g = sofaGB(d.c), x = d.x * U, z = d.y * U, ca = Math.cos(d.a), sa = Math.sin(d.a);
          for (let i = 0; i < g.p.length; i += 3) {
            const lx = g.p[i], lz = g.p[i + 2];
            g.p[i] = x + lx * ca - lz * sa; g.p[i + 1] += CURB; g.p[i + 2] = z + lx * sa + lz * ca;
            const nx = g.n[i], nz = g.n[i + 2];
            g.n[i] = nx * ca - nz * sa; g.n[i + 2] = nx * sa + nz * ca;
          }
          const off = deco.v;
          deco.p.push(...g.p); deco.n.push(...g.n); deco.c.push(...g.c); deco.uv.push(...g.uv);
          for (const idx of g.i) deco.i.push(idx + off);
          deco.v += g.v;
          break;
        }
        case 'pad': {
          const x0 = d.x, y0 = d.y, x1 = d.x + d.w, y1 = d.y + d.h, hh = CURB + 0.025;
          for (let k = 0; k < 4; k++) {
            const pts = [[x0 + 4, y0 + 4], [x1 - 4, y0 + 4], [x1 - 4, y1 - 4], [x0 + 4, y1 - 4]];
            const a = pts[k], b = pts[(k + 1) % 4], n = 6;
            for (let i = 0; i < n; i += 2) seg(marks, lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n), lerp(a[0], b[0], (i + 1) / n), lerp(a[1], b[1], (i + 1) / n), 4, hh, '#e1b52c');
          }
          break;
        }
      }
    }

    // дома
    this.signs = [];
    for (const b of World.buildings) {
      const x0 = b.x * U, z0 = b.y * U, x1 = (b.x + b.w) * U, z1 = (b.y + b.h) * U;
      let Hm, wk = 'res', vcell = 3;
      switch (b.kind) {
        case 'shop': Hm = 4.6; wk = 'shop'; vcell = 4.6; break;
        case 'kiosk': Hm = 3; wk = 'shop'; vcell = 3; break;
        case 'garage': Hm = 3.2; wk = 'garage'; vcell = 3.2; break;
        case 'zoo': Hm = 6.5; break;
        case 'hospital': Hm = b.floors * 3.2; break;
        default: Hm = b.floors * 3;
      }
      b.Hm = Hm;
      const y0 = CURB, y1 = CURB + Hm, gb = walls[wk];
      const wallQ = (ax, az, bx, bz, out) => {
        const len = Math.hypot(bx - ax, bz - az);
        const uu = Math.max(1, Math.round(len / 3)), vv = Hm / vcell;
        gb.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], b.wall, [0, 0, uu, 0, uu, vv, 0, vv], out);
      };
      wallQ(x0, z0, x1, z0, [0, 0, -1]); wallQ(x1, z1, x0, z1, [0, 0, 1]);
      wallQ(x0, z1, x0, z0, [-1, 0, 0]); wallQ(x1, z0, x1, z1, [1, 0, 0]);
      roofs.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], b.roof, null, [0, 1, 0]);
      const pc = '#' + new THREE.Color(b.roof).multiplyScalar(0.8).getHexString(), pw = 0.25, ph = 0.45;
      roofs.box((x0 + x1) / 2, y1 + ph / 2, z0 + pw / 2, x1 - x0, ph, pw, pc);
      roofs.box((x0 + x1) / 2, y1 + ph / 2, z1 - pw / 2, x1 - x0, ph, pw, pc);
      roofs.box(x0 + pw / 2, y1 + ph / 2, (z0 + z1) / 2, pw, ph, z1 - z0, pc);
      roofs.box(x1 - pw / 2, y1 + ph / 2, (z0 + z1) / 2, pw, ph, z1 - z0, pc);
      for (const d of b.details) {
        const dx = x0 + d.u * U, dz = z0 + d.v * U;
        if (d.t === 'vent') roofs.box(dx, y1 + 0.5, dz, d.s * U * 1.6, 1, d.s * U * 1.6, '#8d8a84');
        else if (d.t === 'ant') { roofs.box(dx, y1 + 1.5, dz, 0.08, 3, 0.08, '#333'); roofs.box(dx, y1 + 2.6, dz, 1.6, 0.06, 0.06, '#333'); roofs.box(dx, y1 + 2.2, dz, 1.1, 0.06, 0.06, '#333'); }
        else if (d.t === 'dish') { roofs.box(dx, y1 + 0.5, dz, 0.1, 1, 0.1, '#777'); roofs.box(dx, y1 + 1.0, dz, 0.15, 0.8, 0.8, '#ddd'); }
      }
      // подъезды жилых домов
      if (b.kind === 'res' || b.kind === 'home') {
        const ys = tileAt(Math.floor(b.x / T), Math.floor((b.y + b.h) / T)) !== BLD;
        const n = Math.max(1, Math.floor((x1 - x0) / 7));
        if ((x1 - x0) > (z1 - z0)) {
          for (let k = 0; k < n; k++) {
            const ex = x0 + (k + 0.5) * (x1 - x0) / n, ez = ys ? z1 : z0, s = ys ? 1 : -1;
            roofs.box(ex, CURB + 1.1, ez + s * 0.02, 1.2, 2.2, 0.06, '#5a3a22');
            roofs.box(ex, CURB + 2.5, ez + s * 0.5, 1.8, 0.12, 1.0, '#7d7a72');
          }
        }
      }
      if (b.cross) {
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        roofs.box(cx, y1 + 0.06, cz, 4.4, 0.1, 4.4, '#ffffff');
        roofs.box(cx, y1 + 0.12, cz, 1.1, 0.1, 3.4, '#d63031');
        roofs.box(cx, y1 + 0.12, cz, 3.4, 0.1, 1.1, '#d63031');
      }
      this.addSigns(b, x0, z0, x1, z1, y1);
    }

    const noise = noiseTex();
    const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.matrixAutoUpdate = false; this.scene.add(m); return m; };
    add(ground.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, map: noise }));
    add(marks.geometry(), VCMAT);
    add(deco.geometry(), VCMAT);
    add(roofs.geometry(), VCMAT);
    for (const k of Object.keys(walls)) if (walls[k].v) add(walls[k].geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, map: windowTex(k) }));

    // деревья — инстансы
    const trees = World.trees, n = trees.length;
    const trunkG = new THREE.CylinderGeometry(0.13, 0.2, 1, 6); trunkG.translate(0, 0.5, 0);
    const crownG = new THREE.IcosahedronGeometry(1, 1);
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: '#e8e4d8' }), n);
    const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshLambertMaterial({ color: '#ffffff' }), n * 2);
    const pal = [['#d9a52a', '#e8bf3c'], ['#c9702a', '#e08a36'], ['#9aa338', '#b9b545'], ['#c99a2a', '#a7aa40']];
    const R = mulberry32(3);
    const col = new THREE.Color();
    trees.forEach((t, i) => {
      const r = t.r * U * 1.35, hT = 2.4 + t.h * U * 1.6;
      this._m.compose(this._v.set(t.x * U, CURB, t.y * U), this._q.identity(), this._s.set(1, hT, 1));
      trunks.setMatrixAt(i, this._m);
      for (let k = 0; k < 2; k++) {
        const ox = (R() - 0.5) * r * 0.7, oz = (R() - 0.5) * r * 0.7, sc = r * (k ? 0.75 : 1);
        this._e.set(R() * 3, R() * 3, R() * 3);
        this._q.setFromEuler(this._e);
        this._m.compose(this._v.set(t.x * U + ox, CURB + hT + sc * (k ? 0.9 : 0.55), t.y * U + oz), this._q, this._s.set(sc, sc * 1.15, sc));
        crowns.setMatrixAt(i * 2 + k, this._m);
        crowns.setColorAt(i * 2 + k, col.set(pal[t.v][k]));
      }
    });
    trunks.frustumCulled = false; crowns.frustumCulled = false;
    trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    this.scene.add(trunks); this.scene.add(crowns);

    // маркеры
    this.markers = [];
    for (const m of World.markers) {
      const st = MARK_STYLE[m.type];
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.35, 1.8, 28), new THREE.MeshBasicMaterial({ color: st.col, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.35, 24), new THREE.MeshBasicMaterial({ color: st.col, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
      disc.rotation.x = -Math.PI / 2;
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex(st.icon, st.col), depthWrite: false }));
      icon.scale.set(1.5, 1.5, 1);
      const grp = new THREE.Group();
      grp.add(ring); grp.add(disc); grp.add(icon);
      grp.position.set(m.x * U, gY(m.x, m.y) + 0.04, m.y * U);
      this.scene.add(grp);
      this.markers.push({ m, grp, ring, disc, icon, closed: false, baseMat: icon.material, lockMat: m.type === 'beer' ? new THREE.SpriteMaterial({ map: emojiTex('🔒', '#8a8a8a'), depthWrite: false }) : null });
    }
  },

  addSigns(b, x0, z0, x1, z1, y1) {
    const mk = (tex, w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    const roofBoard = (lines, bg, fg, w, h, face) => {
      // две доски спиной к спине + стойки
      const t = textTex(lines, 512, Math.round(512 * h / w), bg, fg, '#111');
      const cx = (x0 + x1) / 2, cz = face < 0 ? z0 + 1.2 : z1 - 1.2;
      for (const s of [1, -1]) {
        const p = mk(t, w, h);
        p.position.set(cx, y1 + 1.2 + h / 2, cz + s * 0.03);
        p.rotation.y = s * face < 0 ? Math.PI : 0;
        this.scene.add(p);
      }
      const posts = new GB();
      posts.box(cx - w * 0.35, y1 + 0.65, cz, 0.12, 1.3, 0.12, '#333'); posts.box(cx + w * 0.35, y1 + 0.65, cz, 0.12, 1.3, 0.12, '#333');
      this.scene.add(new THREE.Mesh(posts.geometry(), VCMAT));
    };
    const facade = (lines, bg, fg, w, h, side, y) => {
      const t = textTex(lines, 512, Math.round(512 * h / w), bg, fg, '#222');
      const p = mk(t, w, h);
      const cx = (x0 + x1) / 2;
      if (side < 0) { p.position.set(cx, y, z0 - 0.05); p.rotation.y = Math.PI; }
      else p.position.set(cx, y, z1 + 0.05);
      this.scene.add(p);
    };
    switch (b.kind) {
      case 'shop':
        facade([{ t: 'ПИВО', s: 92, c: '#ffd23a' }, { t: '«' + b.sub + '»', s: 40, c: '#fff' }], '#6a1f1b', '#fff', 7, 1.7, -1, CURB + 3.6);
        roofBoard([{ t: '🍺 ПИВО', s: 110, c: '#ffd23a' }], '#5a1a17', '#fff', 7, 2, -1);
        break;
      case 'kiosk': facade([{ t: 'ФРУКТЫ 🍌', s: 80, c: '#ffe14d' }], '#2b6a33', '#fff', 3.6, 0.8, -1, CURB + 2.5); break;
      case 'home': facade([{ t: '🏠 ДОМ', s: 100, c: '#ffe14d' }], '#2c3e50', '#fff', 4, 1, 1, CURB + 3.2); break;
      case 'zoo': roofBoard([{ t: '🦍 ЗООПАРК', s: 90, c: '#ffe14d' }], '#2f5a2a', '#fff', 9, 2, 1); break;
      case 'hospital': facade([{ t: 'ТРАВМПУНКТ', s: 76, c: '#d63031' }], '#ffffff', '#d63031', 8, 1.2, 1, CURB + 3.3); break;
      case 'garage':
        if (b.sign) roofBoard([{ t: b.sign === 'ГАРАЖИ' ? '🚗 ГАРАЖИ' : '🔧 ' + b.sign, s: 62, c: '#ffe14d' }], '#333a40', '#fff', 11, 1.8, 1);
        break;
    }
  },

  /* ---------- динамические объекты ---------- */
  buildDynamic() {
    const sc = this.scene;
    // бананы-снаряды
    const ban = new THREE.TorusGeometry(0.28, 0.07, 5, 10, 2.3);
    this.bulletsIM = new THREE.InstancedMesh(ban, lam('#f5cf2f'), 80);
    this.bulletsIM.count = 0; this.bulletsIM.frustumCulled = false; sc.add(this.bulletsIM);
    // кожура
    const pg = new GB();
    for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + 0.3; pg.box(Math.cos(a) * 0.22, 0.03, Math.sin(a) * 0.22, 0.42, 0.04, 0.16, '#e8c22c', a); }
    pg.box(0, 0.06, 0, 0.14, 0.1, 0.14, '#8a6a1c');
    this.peelsIM = new THREE.InstancedMesh(pg.geometry(), VCMAT, 60);
    this.peelsIM.count = 0; this.peelsIM.frustumCulled = false; sc.add(this.peelsIM);
    // следы шин
    const sg = new THREE.PlaneGeometry(0.32, 0.32); sg.rotateX(-Math.PI / 2);
    this.skidIM = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.45, depthWrite: false }), 320);
    this.skidIM.count = 0; this.skidIM.frustumCulled = false; sc.add(this.skidIM);
    // частицы
    const mkPts = (n, size) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
      const p = new THREE.Points(g, new THREE.PointsMaterial({ size, map: softDotTex(), vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true }));
      p.frustumCulled = false; sc.add(p);
      return p;
    };
    this.puffs = mkPts(260, 2.2);
    this.bits = mkPts(260, 0.4);
    // цель задания: столб света и стрелка над героем
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending }));
    beam.position.y = 30; beam.visible = false;
    this.beam = beam; sc.add(beam);
    const ag = new THREE.ConeGeometry(0.34, 1.0, 4); ag.rotateZ(-Math.PI / 2);
    this.arrow = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: 0xffd23a }));
    this.arrow.visible = false; sc.add(this.arrow);
    // сирены
    this.sirenR = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    this.sirenB = new THREE.MeshBasicMaterial({ color: 0x2a7bff });
    this.sirenOff = lam('#333333');
    this.player = makePlayerModel();
    this.player.visible = false;
    sc.add(this.player);
  },

  own(e, create) {
    let m = e._m;
    if (!m) { m = e._m = create(); this.scene.add(m); this.reg.add(m); }
    m.userData.f = this.frameNo;
    return m;
  },

  getCarGeo(c) {
    const key = c.type + '|' + c.color + '|' + (c.dead ? 1 : 0);
    return this.carGeo[key] || (this.carGeo[key] = carGB(c.type, c.dead ? '#2a2a2a' : c.color, c.dead).geometry());
  },
  getSofaGeo(color) { return this.sofaGeo[color] || (this.sofaGeo[color] = sofaGB(color).geometry()); },

  /* ---------- синхронизация с логикой ---------- */
  sync(dt) {
    this.frameNo++;
    const t = G.time, play = G.mode === 'play', p = G.player;
    const _v = this._v;

    // герой
    const pm = this.player;
    pm.visible = !!(play && p && !p.car);
    if (pm.visible) poseHero(pm, p, t);

    // машины
    for (const c of G.cars) {
      const m = this.own(c, () => new THREE.Mesh(this.getCarGeo(c), VCMAT));
      const key = c.type + '|' + c.color + '|' + (c.dead ? 1 : 0);
      if (m.userData.key !== key) { m.userData.key = key; m.geometry = this.getCarGeo(c); }
      m.position.set(c.x * U, gY(c.x, c.y), c.y * U);
      m.rotation.set(0, -c.a, c.slipT > 0 ? Math.sin(t * 30) * 0.03 : 0);
      // машины вплотную к камере прячем, чтобы не загораживали обзор
      const cdx = m.position.x - this.camera.position.x, cdz = m.position.z - this.camera.position.z;
      m.visible = c === (p && p.car) || cdx * cdx + cdz * cdz > 9;
    }
    // диваны с гориллами
    const sirenOn = Math.floor(t * 6) % 2 === 0;
    for (const s of G.sofas) {
      const m = this.own(s, () => makeSofaModel(this, s));
      m.position.set(s.x * U, gY(s.x, s.y) + Math.abs(Math.sin(s.t * 9)) * 0.06 * Math.min(1, s.v / 100), s.y * U);
      m.rotation.set(0, -s.a, 0);
      poseGorilla(m.userData.gor, s, t);
      m.userData.s1.material = s.calm ? this.sirenOff : sirenOn ? this.sirenR : this.sirenB;
      m.userData.s2.material = s.calm ? this.sirenOff : sirenOn ? this.sirenB : this.sirenR;
      const sc = s.leaving ? clamp(s.alpha + 0.3, 0.01, 1) : 1;
      m.scale.set(sc, sc, sc);
    }
    // пешеходы
    for (const q of G.peds) {
      const m = this.own(q, () => makePedModel(q));
      m.position.set(q.x * U, gY(q.x, q.y), q.y * U);
      posePed(m, q, t);
    }
    // подбираемое
    for (const k of G.pickups) {
      const m = this.own(k, () => makePickupModel(k.type));
      m.visible = k.active;
      if (k.active) { m.position.set(k.x * U, gY(k.x, k.y) + 0.7 + Math.sin(t * 3 + k.x) * 0.15, k.y * U); m.rotation.y = t * 1.5 + k.y; }
    }
    for (const m of this.reg) if (m.userData.f !== this.frameNo) { this.scene.remove(m); this.reg.delete(m); }

    // бананы
    const bm = this.bulletsIM;
    bm.count = Math.min(G.bullets.length, 80);
    for (let i = 0; i < bm.count; i++) {
      const b = G.bullets[i];
      this._e.set(0, -Math.atan2(b.vy, b.vx), b.rot);
      this._q.setFromEuler(this._e);
      this._m.compose(_v.set(b.x * U, 1.15, b.y * U), this._q, this._s.set(1, 1, 1));
      bm.setMatrixAt(i, this._m);
    }
    bm.instanceMatrix.needsUpdate = true;
    const pe = this.peelsIM;
    pe.count = Math.min(G.peels.length, 60);
    for (let i = 0; i < pe.count; i++) {
      const o = G.peels[i];
      this._q.setFromAxisAngle(_v.set(0, 1, 0), o.a);
      this._m.compose(_v.set(o.x * U, gY(o.x, o.y) + 0.01, o.y * U), this._q, this._s.set(1, 1, 1));
      pe.setMatrixAt(i, this._m);
    }
    pe.instanceMatrix.needsUpdate = true;
    const sk = this.skidIM;
    sk.count = Math.min(G.skids.length, 320);
    this._q.identity();
    for (let i = 0; i < sk.count; i++) {
      const o = G.skids[G.skids.length - 1 - i];
      this._m.compose(_v.set(o.x * U, gY(o.x, o.y) + 0.015, o.y * U), this._q, this._s.set(1, 1, 1));
      sk.setMatrixAt(i, this._m);
    }
    sk.instanceMatrix.needsUpdate = true;

    // частицы
    this.fillPoints();

    // маркеры
    const tgt = play ? Mission.target() : null;
    for (const mk of this.markers) {
      const m = mk.m;
      const closed = m.type === 'beer' && m.closedT > 0;
      if (closed !== mk.closed) {
        mk.closed = closed;
        mk.icon.material = closed ? mk.lockMat : mk.baseMat;
        mk.ring.material.color.set(closed ? '#8a8a8a' : MARK_STYLE[m.type].col);
        mk.disc.material.color.set(closed ? '#8a8a8a' : MARK_STYLE[m.type].col);
      }
      const isT = tgt === m;
      const s = (isT ? 1.4 : 1) * (1 + Math.sin(t * 4 + m.x) * 0.06);
      mk.ring.scale.set(s, s, s); mk.disc.scale.set(s, s, s);
      mk.icon.position.y = 2.3 + Math.sin(t * 2.5 + m.y) * 0.2;
      mk.icon.visible = !(play && p && dist2(p.x, p.y, m.x, m.y) < 40 * 40);
    }
    // столб света и стрелка
    this.beam.visible = !!tgt && !G.over;
    if (tgt) {
      this.beam.position.x = tgt.x * U; this.beam.position.z = tgt.y * U;
      this.beam.material.opacity = 0.16 + Math.sin(t * 4) * 0.05;
    }
    const pp = play && p ? playerPos() : null;
    const camNear = pp && Math.hypot(pp.x * U - this.camera.position.x, pp.y * U - this.camera.position.z) < 4.5;
    this.arrow.visible = !!(tgt && pp && !G.over && !camNear && dist2(pp.x, pp.y, tgt.x, tgt.y) > 140 * 140);
    if (this.arrow.visible) {
      const a = Math.atan2(tgt.y - pp.y, tgt.x - pp.x);
      this.arrow.position.set(pp.x * U + Math.cos(a) * 0.4, (p.car ? 2.6 : 2.55) + Math.sin(t * 4) * 0.12, pp.y * U + Math.sin(a) * 0.4);
      this.arrow.rotation.set(0, -a, 0);
    }
  },

  fillPoints() {
    const pa = this.puffs.geometry.attributes, ba = this.bits.geometry.attributes;
    let np = 0, nb = 0;
    const PC = { smoke: [0.35, 0.35, 0.36], fire: [1, 0.55, 0.15], foam: [1, 0.96, 0.8] };
    for (const q of G.parts) {
      const age = q.max - q.life, a = clamp(q.life / q.max, 0, 1);
      if (q.type === 'smoke' || q.type === 'fire' || (q.type === 'foam' && q.size > 5)) {
        if (np >= 260) continue;
        const h = q.type === 'smoke' ? 1 + age * 2.6 : q.type === 'fire' ? 0.6 + age * 2 : 1 + age * 1.5;
        pa.position.setXYZ(np, q.x * U, h, q.y * U);
        let c = PC[q.type];
        if (q.type === 'foam' && q.color && q.color !== '#fff') { _c.set(q.color); c = [_c.r, _c.g, _c.b]; }
        pa.color.setXYZW(np, c[0], c[1], c[2], (q.type === 'smoke' ? 0.55 : 0.85) * a);
        np++;
      } else if (q.type === 'bits' || q.type === 'spark' || q.type === 'foam') {
        if (nb >= 260) continue;
        const h = Math.max(0.1, 1.1 + age * 4 - age * age * 12);
        ba.position.setXYZ(nb, q.x * U, h, q.y * U);
        _c.set(q.type === 'foam' ? '#fff3c4' : q.color || '#ffd27a');
        ba.color.setXYZW(nb, _c.r, _c.g, _c.b, a);
        nb++;
      }
    }
    pa.position.needsUpdate = pa.color.needsUpdate = true;
    ba.position.needsUpdate = ba.color.needsUpdate = true;
    this.puffs.geometry.setDrawRange(0, np);
    this.bits.geometry.setDrawRange(0, nb);
  },

  /* ---------- камера ---------- */
  camera3(dt) {
    const cam = this.camera, p = G.player;
    let tx, ty, dist, height, look = 1.3, ahead = 0;
    if (G.mode !== 'play' || !p) {
      const t = G.time;
      tx = G.cam.x; ty = G.cam.y;
      this.yaw = t * 0.07;
      dist = 34; height = 26; look = 0;
      this.place(tx, ty, dist, height, look, 0, dt, 1.5);
      return;
    }
    const pp = playerPos();
    tx = pp.x; ty = pp.y;
    this.camDrag -= dt;
    if (p.car) {
      const c = p.car, sp = c.speed;
      if (this.camDrag <= 0 && sp > 25) this.yaw = approachAngle(this.yaw, c.a, (1.2 + Math.min(2.2, sp / 120)) * dt);
      dist = 11 + clamp(Math.abs(sp) / 320, 0, 1) * 4; height = 5.2 + clamp(Math.abs(sp) / 320, 0, 1) * 1.5; ahead = 3;
    } else {
      if (this.camDrag <= 0 && p.moving) {
        const d = angDiff(this.yaw, p.a);
        if (Math.abs(d) < 1.15) this.yaw = approachAngle(this.yaw, p.a, 0.9 * dt);
      }
      dist = 8.5; height = 6.2;
    }
    this.place(tx, ty, dist, height, look, ahead, dt, p.car ? 6 : 8);
  },

  place(tx, ty, dist, height, look, ahead, dt, follow) {
    const cam = this.camera;
    const fx = Math.cos(this.yaw), fy = Math.sin(this.yaw);
    // не залезать в дома: укорачиваем дистанцию
    let d = dist;
    if (G.mode === 'play') {
      const steps = 14;
      for (let i = 1; i <= steps; i++) {
        const f = (i / steps) * dist / U;
        if (solidAt(tx - fx * f, ty - fy * f)) { d = Math.max(2.5, (i - 1.5) / steps * dist); break; }
      }
    }
    const hh = height * (0.55 + 0.45 * d / dist) + (dist - d) * 0.35;
    const want = this._v.set(tx * U - fx * d, gY(tx, ty) + hh, ty * U - fy * d);
    const k = Math.min(1, dt * follow);
    if (this.snap) { this.camPos.copy(want); this.snap = false; } else this.camPos.lerp(want, k);
    let sx = 0, sy = 0;
    if (G.shake) { sx = rr(-1, 1) * G.shake * 0.02; sy = rr(-1, 1) * G.shake * 0.02; }
    cam.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
    this.lookAt.set(tx * U + fx * ahead, gY(tx, ty) + look, ty * U + fy * ahead);
    if (G.drunk > 0 && G.mode === 'play') {
      const w = G.drunk;
      this.lookAt.x += Math.sin(G.time * 1.1) * 0.25 * w;
      this.lookAt.z += Math.cos(G.time * 0.8) * 0.25 * w;
    }
    cam.lookAt(this.lookAt);
    if (G.drunk > 0 && G.mode === 'play') cam.rotateZ(Math.sin(G.time * 0.9) * 0.035 * G.drunk);
    this.sky.position.copy(cam.position);
  },

  /** Видно ли точку на экране (для появления машин/людей «за кадром») */
  visible(x, y, m) {
    if (!this.ready) return false;
    const cam = this.camera;
    const dx = x * U - cam.position.x, dz = y * U - cam.position.z;
    if (dx * dx + dz * dz > 58 * 58) return false;
    this._v.set(x * U, 1, y * U).project(cam);
    const k = 1.05 + (m || 0) * 0.004;
    return this._v.z < 1 && Math.abs(this._v.x) < k && Math.abs(this._v.y) < k;
  },
  /** Мировая точка → экран (CSS px) */
  toScreen(x, y, alt, out) {
    const v = this._v.set(x * U, alt, y * U).project(this.camera);
    out.x = (v.x + 1) / 2 * W; out.y = (1 - v.y) / 2 * H; out.ok = v.z < 1 && v.z > -1;
    out.d = Math.hypot(x * U - this.camera.position.x, y * U - this.camera.position.z);
    return out;
  },

  render() { this.renderer.render(this.scene, this.camera); },
};

/* ===== Модели ===== */
function carGB(type, color, dead) {
  const t = CAR_TYPES[type], L = t.L * U, Wd = t.W * U, g = new GB();
  const glass = dead ? '#151515' : '#2b3a48', blk = '#141414', chrome = '#b9bcc0', light = dead ? '#333' : '#fff6c8', tail = dead ? '#333' : '#c62828';
  const wheels = (r, xs) => { for (const x of xs) for (const z of [-1, 1]) g.cylZ(x, r, z * (Wd / 2 - 0.1), r, 0.24, blk, 8); };
  if (type === 'gazel') {
    const cabL = L * 0.3;
    g.box(L / 2 - cabL / 2, 0.95, 0, cabL, 1.1, Wd, color);
    g.box(L / 2 - cabL * 0.35, 1.25, 0, cabL * 0.55, 0.55, Wd * 0.94, glass);
    g.box(L / 2 - cabL / 2, 1.58, 0, cabL * 0.9, 0.1, Wd * 0.96, color);
    g.box(-cabL / 2, 1.45, 0, L - cabL, 2.1, Wd * 1.04, dead ? '#2a2a2a' : '#ecebe6');
    g.box(-cabL / 2, 1.1, 0, L - cabL + 0.01, 0.35, Wd * 1.05, dead ? '#222' : '#1b5fa8');
    g.box(L / 2 + 0.03, 0.5, 0, 0.08, 0.2, Wd * 0.96, blk);
    wheels(0.36, [L * 0.3, -L * 0.3]);
  } else {
    const low = type === 'bumer' ? 0.06 : 0, tall = type === 'niva' ? 0.12 : 0;
    g.box(0, 0.66 - low, 0, L, 0.6 - low, Wd, color);
    const cabL = type === 'bumer' ? 0.45 : 0.52;
    g.box(-L * 0.06, 1.17 - low + tall / 2, 0, L * cabL, 0.42 + tall, Wd * 0.86, glass);
    g.box(-L * 0.06, 1.41 - low + tall, 0, L * (cabL - 0.03), 0.07, Wd * 0.9, color);
    g.box(-L * 0.06, 1.17 - low + tall / 2, 0, L * cabL * 0.18, 0.43 + tall, Wd * 0.88, color);
    g.box(L / 2 + 0.03, 0.47, 0, 0.08, 0.16, Wd * 0.98, type === 'bumer' ? '#222' : chrome);
    g.box(-L / 2 - 0.03, 0.47, 0, 0.08, 0.16, Wd * 0.98, type === 'bumer' ? '#222' : chrome);
    if (type === 'niva') g.cylZ(-L / 2 - 0.12, 0.9, 0, 0.3, 0.2, blk, 8);
    wheels(type === 'niva' ? 0.36 : 0.31, [L * 0.33, -L * 0.33]);
    if (type === 'zhiga' && !dead) g.box(L * 0.2, 0.97, 0, L * 0.18, 0.02, Wd * 0.12, '#dddddd');
  }
  for (const z of [-1, 1]) {
    g.box(L / 2 + 0.01, 0.72, z * Wd * 0.33, 0.06, 0.16, 0.3, light);
    g.box(-L / 2 - 0.01, 0.72, z * Wd * 0.33, 0.06, 0.16, 0.3, tail);
    g.box(L * 0.14, 1.0, z * (Wd / 2 + 0.06), 0.1, 0.08, 0.12, blk);
  }
  return g;
}

function sofaGB(color) {
  const g = new GB();
  const dk = '#' + new THREE.Color(color).multiplyScalar(0.72).getHexString();
  const lt = '#' + new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.18).getHexString();
  for (const x of [-0.45, 0.45]) for (const z of [-1.1, 1.1]) g.cylZ(x, 0.13, z, 0.13, 0.12, '#111', 8);
  g.box(0, 0.38, 0, 1.15, 0.32, 2.55, dk);
  g.box(0.1, 0.62, -0.6, 0.9, 0.2, 1.15, lt); g.box(0.1, 0.62, 0.6, 0.9, 0.2, 1.15, lt);
  g.box(-0.47, 0.92, 0, 0.26, 0.92, 2.55, color);
  g.box(-0.36, 0.86, -0.6, 0.12, 0.5, 1.12, lt); g.box(-0.36, 0.86, 0.6, 0.12, 0.5, 1.12, lt);
  g.box(0, 0.78, -1.2, 1.15, 0.5, 0.24, color); g.box(0, 0.78, 1.2, 1.15, 0.5, 0.24, color);
  return g;
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYL = new THREE.CylinderGeometry(1, 1, 1, 12);
function part(geo, mat, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  return m;
}
/** Сустав: группа-шарнир, геометрия свисает вниз от точки крепления */
function joint(gb, px, py, pz) {
  const j = new THREE.Group(); j.position.set(px, py, pz);
  j.add(gb.mesh());
  return j;
}
const GeoCache = {};
function cachedGeo(key, build) { return GeoCache[key] || (GeoCache[key] = build().geometry()); }

function bananaMesh(r, tube) {
  const g = new THREE.TorusGeometry(r, tube, 6, 12, 2.2);
  return new THREE.Mesh(g, lam('#f5cf2f'));
}

/* Герой: чёрная шапка-бини в рубчик, чёрный пуховик с белыми полосками на рукавах, джинсы, лицо с фото */
function makePlayerModel() {
  const g = new THREE.Group();
  const body = new GB();
  body.box(0, 1.22, 0, 0.36, 0.68, 0.56, '#17181b');
  for (let i = 0; i < 4; i++) body.box(0.182, 0.98 + i * 0.15, 0, 0.01, 0.025, 0.54, '#2c2e33');
  body.box(-0.2, 1.48, 0, 0.12, 0.2, 0.42, '#101113');
  body.box(0, 0.91, 0, 0.37, 0.05, 0.57, '#f2f2f2');
  body.box(0.17, 1.5, 0, 0.05, 0.08, 0.22, '#101113');
  body.box(0.182, 1.25, 0, 0.012, 0.5, 0.025, '#2a2a2a');
  body.box(0.183, 1.12, -0.06, 0.01, 0.05, 0.11, '#e8e8e8');
  // шапка
  body.ball(-0.01, 1.88, 0, 0.178, 0.2, 0.178, '#121214', 12, 6);
  body.cylY(-0.01, 1.89, 0, 0.18, 0.1, '#16161a', 14);
  for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; body.box(Math.cos(a) * 0.178 - 0.01, 1.97, Math.sin(a) * 0.178, 0.014, 0.17, 0.014, '#2a2a2e', a); }
  body.box(0.165, 1.9, -0.07, 0.012, 0.04, 0.04, '#9a9a9a');
  g.add(body.mesh());
  const legGB = (z) => { const b = new GB(); b.box(0, -0.43, 0, 0.2, 0.86, 0.18, '#3f5f8a'); b.box(0.06, -0.86, 0, 0.32, 0.1, 0.2, '#f2f2f2'); return b; };
  const legL = joint(legGB(), 0, 0.9, -0.12), legR = joint(legGB(), 0, 0.9, 0.12);
  g.add(legL, legR);
  const armGB = (s) => {
    const b = new GB();
    b.box(0, -0.3, 0, 0.15, 0.6, 0.15, '#17181b');
    b.box(0, -0.3, s * 0.078, 0.03, 0.56, 0.012, '#f2f2f2');
    b.box(0.045, -0.3, s * 0.078, 0.02, 0.56, 0.012, '#f2f2f2');
    b.box(0, -0.64, 0, 0.11, 0.11, 0.11, '#e2b79c');
    return b;
  };
  const armL = joint(armGB(-1), 0, 1.5, -0.36), armR = joint(armGB(1), 0, 1.5, 0.36);
  g.add(armL, armR);
  // голова с лицом
  const faceTex = new THREE.Texture(); const img = new Image();
  img.onload = () => { faceTex.image = img; faceTex.needsUpdate = true; };
  img.src = window.FACE_HEAD_SRC;
  const skin = lam('#e2b79c');
  const head = new THREE.Mesh(UNIT_BOX, [new THREE.MeshLambertMaterial({ map: faceTex }), skin, skin, skin, skin, skin]);
  head.position.set(0, 1.72, 0); head.scale.set(0.27, 0.32, 0.27);
  g.add(head);
  // банан-пушка
  const gun = new THREE.Group();
  const ban = bananaMesh(0.3, 0.065);
  ban.rotation.set(0, 0, -Math.PI / 2 - 1.1); ban.position.set(0.18, 0.36, 0);
  const gh = new GB(); gh.box(0.43, 0.13, 0, 0.06, 0.07, 0.07, '#4a3214'); gh.box(0, -0.04, 0, 0.1, 0.2, 0.08, '#5a3a1a');
  gun.add(ban, gh.mesh());
  gun.position.set(0.6, 1.3, 0);
  g.add(gun);
  const bg = new GB();
  bg.cylY(0, 0, 0, 0.06, 0.24, '#6b3a12', 8); bg.cylY(0, 0.17, 0, 0.025, 0.12, '#6b3a12', 6); bg.cylY(0, 0.02, 0, 0.063, 0.1, '#e9c46a', 8);
  const bottle = new THREE.Group(); bottle.add(bg.mesh()); bottle.visible = false;
  g.add(bottle);
  g.userData = { legL, legR, armL, armR, gun, bottle, head };
  return g;
}

function poseHero(m, p, t) {
  const u = m.userData;
  m.position.set(p.x * U, gY(p.x, p.y), p.y * U);
  const w = p.moving ? Math.sin(p.walkT) : 0;
  u.legL.rotation.z = w * 0.7; u.legR.rotation.z = -w * 0.7;
  const drinking = p.holding === 'beer';
  u.armL.rotation.set(-0.15, 0, 1.35); u.armR.rotation.set(0.15, 0, 1.35);
  u.gun.visible = !drinking; u.bottle.visible = drinking;
  if (drinking) {
    u.armR.rotation.set(-0.3, 0, 2.5);
    u.bottle.position.set(0.3, 1.78, 0.18); u.bottle.rotation.set(0, 0, 2.1);
  }
  let lie = 0;
  if (p.downT > 0 || p.sleepT > 0) lie = -Math.PI / 2;
  m.rotation.set(0, -p.a, lie);
  if (lie) m.position.y += 0.25;
  m.position.y += p.moving ? Math.abs(Math.sin(p.walkT)) * 0.06 : 0;
}

function gorillaGB(boss) {
  const b = new GB(), dark = '#2a2626', face = '#6e5c53';
  b.ball(-0.08, 1.12, 0, 0.42, 0.52, 0.52, dark, 10, 7);
  if (boss) b.ball(-0.3, 1.15, 0, 0.2, 0.38, 0.36, '#a8a8a8', 8, 5);
  b.ball(0.12, 1.72, 0, 0.27, 0.27, 0.27, dark, 10, 7);
  b.ball(0.32, 1.66, 0, 0.13, 0.12, 0.16, face, 8, 5);
  b.box(0.34, 1.79, -0.08, 0.03, 0.05, 0.05, '#ffffff'); b.box(0.34, 1.79, 0.08, 0.03, 0.05, 0.05, '#ffffff');
  b.box(0.355, 1.79, -0.08, 0.01, 0.025, 0.025, '#111'); b.box(0.355, 1.79, 0.08, 0.01, 0.025, 0.025, '#111');
  b.box(0.32, 0.72, -0.2, 0.55, 0.22, 0.22, dark); b.box(0.32, 0.72, 0.2, 0.55, 0.22, 0.22, dark);
  if (boss) {
    b.cylY(0.1, 1.98, 0, 0.2, 0.18, '#f1c40f', 10);
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; b.box(0.1 + Math.cos(a) * 0.17, 2.13, Math.sin(a) * 0.17, 0.06, 0.14, 0.06, '#f1c40f', a); }
  } else {
    b.cylY(0.1, 1.95, 0, 0.24, 0.13, '#1d3b7a', 12);
    b.box(0.3, 1.9, 0, 0.18, 0.03, 0.3, '#111');
    b.box(0.335, 1.97, 0, 0.02, 0.06, 0.06, '#ffd23a');
  }
  return b;
}

function makeSofaModel(R, s) {
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(R.getSofaGeo(s.color), VCMAT));
  const s1 = part(UNIT_BOX, R.sirenR, -0.47, 1.45, -0.35, 0.22, 0.16, 0.3);
  const s2 = part(UNIT_BOX, R.sirenB, -0.47, 1.45, 0.35, 0.22, 0.16, 0.3);
  grp.add(s1, s2);
  const gor = new THREE.Group();
  gor.add(new THREE.Mesh(cachedGeo('gor' + (s.boss ? 1 : 0), () => gorillaGB(s.boss)), VCMAT));
  const armGB = () => { const b = new GB(); b.box(0, -0.37, 0, 0.2, 0.75, 0.2, '#2a2626'); b.box(0, -0.76, 0, 0.17, 0.1, 0.17, '#4a3e3a'); return b; };
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(0, 1.42, -0.45); armR.position.set(0, 1.42, 0.45);
  armL.add(new THREE.Mesh(cachedGeo('garm', armGB), VCMAT)); armR.add(new THREE.Mesh(cachedGeo('garm', armGB), VCMAT));
  const ban = bananaMesh(0.22, 0.05);
  ban.position.set(0.5, 1.6, 0); ban.rotation.set(Math.PI / 2, 0, 0); ban.visible = false;
  gor.add(armL, armR, ban);
  gor.userData = { armL, armR, ban };
  if (s.boss) gor.scale.set(1.2, 1.2, 1.2);
  grp.add(gor);
  grp.userData = { gor, s1, s2 };
  return grp;
}
function poseGorilla(gor, s, t) {
  const u = gor.userData;
  u.ban.visible = s.calm;
  if (s.grabT > 0) {
    u.armL.rotation.set(0, 0, 1.6 + Math.sin(t * 20) * 0.15); u.armR.rotation.set(0, 0, 1.6 - Math.sin(t * 20) * 0.15);
  } else if (s.calm) {
    u.armL.rotation.set(0.5, 0, 2.2); u.armR.rotation.set(-0.5, 0, 2.2);
    u.ban.position.y = 1.6 + Math.sin(t * 5) * 0.05;
  } else {
    const k = s.angry ? Math.sin(t * 10) * 0.25 : 0;
    u.armL.rotation.set(0.5, 0, 0.6 + k); u.armR.rotation.set(-0.5, 0, 0.6 - k);
  }
  gor.rotation.y = s.calm ? Math.sin(t * 2) * 0.15 : 0;
  gor.position.y = s.stunT > 0 ? Math.sin(t * 30) * 0.03 : 0;
}

function makePedModel(q) {
  const g = new THREE.Group();
  const babka = q.kind === 'babka', kid = q.kind === 'shkolnik';
  const h = babka ? 0.9 : kid ? 0.82 : 1;
  const key = 'ped|' + q.kind + q.c1 + q.skin + q.hair + q.c2;
  const geo = cachedGeo(key, () => {
    const b = new GB(), bw = babka ? 0.62 : 0.5;
    b.box(0, 1.18 * h, 0, 0.3, 0.68 * h, bw, q.c1);
    if (babka || q.kind === 'devushka') b.box(0, 0.78 * h, 0, 0.34, 0.32 * h, bw + 0.04, q.c1);
    for (const z of [-1, 1]) { b.box(0.08, 1.2 * h, z * (bw / 2 + 0.07), 0.12, 0.56 * h, 0.12, q.c1); b.box(0.08, 0.88 * h, z * (bw / 2 + 0.07), 0.1, 0.1, 0.1, q.skin); }
    b.box(0, 1.68 * h, 0, 0.24, 0.27, 0.24, q.skin);
    if (babka) { b.box(-0.02, 1.78 * h, 0, 0.28, 0.16, 0.28, q.hair); b.box(-0.1, 1.66 * h, 0, 0.1, 0.24, 0.28, q.hair); b.box(0.05, 0.85 * h, 0.4, 0.25, 0.22, 0.1, q.c2); }
    else b.box(-0.03, 1.8 * h, 0, 0.27, 0.08, 0.27, q.hair), b.box(-0.12, 1.7 * h, 0, 0.06, 0.18, 0.26, q.hair);
    b.box(0.125, 1.7 * h, -0.05, 0.01, 0.03, 0.03, '#222'); b.box(0.125, 1.7 * h, 0.05, 0.01, 0.03, 0.03, '#222');
    return b;
  });
  g.add(new THREE.Mesh(geo, VCMAT));
  const legGeo = cachedGeo('leg|' + q.legs + h, () => { const b = new GB(); b.box(0, -0.85 * h / 2, 0, 0.16, 0.85 * h, 0.16, q.legs); b.box(0.04, -0.85 * h + 0.04, 0, 0.24, 0.08, 0.17, '#2a2a2a'); return b; });
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(0, 0.85 * h, -0.1); legR.position.set(0, 0.85 * h, 0.1);
  legL.add(new THREE.Mesh(legGeo, VCMAT)); legR.add(new THREE.Mesh(legGeo, VCMAT));
  g.add(legL, legR);
  let beer = null;
  if (q.static) {
    const bb = new GB(); bb.cylY(0.22, 1.25 * h, 0.35, 0.05, 0.22, '#6b3a12', 8);
    beer = bb.mesh(); beer.visible = false; g.add(beer);
  }
  g.userData = { legL, legR, beer };
  return g;
}
function posePed(m, q, t) {
  const u = m.userData;
  const w = q.state !== 'down' && q.speed > 5 && !q.static ? Math.sin(q.walkT) : 0;
  u.legL.rotation.z = w * 0.6; u.legR.rotation.z = -w * 0.6;
  if (u.beer) u.beer.visible = !!q.beer;
  if (q.state === 'down') { m.rotation.set(0, -q.a, Math.PI / 2); m.position.y += 0.2; }
  else m.rotation.set(0, -q.a, q.static ? Math.sin(t * 2 + q.x) * 0.04 : 0);
}

function makePickupModel(type) {
  const g = new THREE.Group();
  const b = new GB();
  if (type === 'banana') {
    g.add(new THREE.Mesh(cachedGeo('bunchStem', () => { const t = new GB(); t.box(0.27, 0.15, 0, 0.1, 0.12, 0.25, '#5a4012'); return t; }), VCMAT));
    for (let i = -1; i <= 1; i++) {
      const m = bananaMesh(0.3, 0.075);
      m.rotation.set(0, i * 0.5, 0.4); m.position.set(0, 0, i * 0.1);
      g.add(m);
    }
  } else {
    g.add(new THREE.Mesh(cachedGeo('crate', () => {
      b.box(0, 0, 0, 0.75, 0.32, 0.5, '#c0392b');
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { b.cylY(-0.22 + i * 0.22, 0.28, -0.11 + j * 0.22, 0.06, 0.3, '#6b3a12', 6); b.cylY(-0.22 + i * 0.22, 0.48, -0.11 + j * 0.22, 0.025, 0.12, '#6b3a12', 5); }
      return b;
    }), VCMAT));
  }
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.75, 16), new THREE.MeshBasicMaterial({ color: type === 'banana' ? 0xffe066 : 0xffaa44, transparent: true, opacity: 0.3, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = -0.55;
  g.add(glow);
  return g;
}
