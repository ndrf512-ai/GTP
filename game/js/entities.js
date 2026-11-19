'use strict';
/* ===== Состояние игры и сущности: герой, машины, гориллы на диванах, пешеходы ===== */

const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];

const CAR_TYPES = {
  zhiga: { name: 'Жигули', L: 42, W: 21, max: 300, acc: 230, turn: 2.7, hp: 100, colors: ['#e8e4d8', '#c94a3a', '#7d1f2b', '#3d6e9e', '#d9c27a', '#4f7a4a', '#8a8f96', '#e07b2a'] },
  niva: { name: 'Нива', L: 38, W: 22, max: 280, acc: 250, turn: 2.9, hp: 130, colors: ['#2f5e3a', '#a8b0a0', '#d8d2b8', '#3b4a7a'] },
  gazel: { name: 'Газель', L: 54, W: 24, max: 250, acc: 170, turn: 2.2, hp: 170, colors: ['#2a64b0', '#e6e6e0', '#b03030'] },
  bumer: { name: 'Бумер', L: 46, W: 22, max: 390, acc: 320, turn: 2.9, hp: 90, colors: ['#15161a', '#1d2129'] },
};
const SOFA_COLORS = ['#8c2f2f', '#3f5a8c', '#5e7d3a', '#8a6a3c', '#7a3f7a', '#b0563a'];

const PED_KINDS = [
  { kind: 'babka', c1: ['#6b4b3a', '#4a5b6b', '#7a3a4a', '#c9b9a0'], hair: ['#c0392b', '#8e44ad', '#2c6e49', '#d35400'], legs: '#3b3b3b', c2: '#1f3b6b' },
  { kind: 'muzhik', c1: ['#3a4a5a', '#4b5320', '#2f2f2f', '#5a4636'], hair: ['#3b2a1a', '#111111', '#6b6b6b'], legs: '#2f3f5a' },
  { kind: 'shkolnik', c1: ['#c0392b', '#2980b9', '#27ae60', '#f39c12'], hair: ['#3b2a1a', '#d9b36b', '#111111'], legs: '#2f3f5a' },
  { kind: 'devushka', c1: ['#e8e8e8', '#d98bb0', '#8e9eb5', '#c9a36b'], hair: ['#d9b36b', '#3b2a1a', '#a0522d', '#111111'], legs: '#2a2a2a' },
];
const SKINS = ['#e8c4a8', '#e2b79c', '#d6a888', '#f0d0b8'];

const PED_LINES = [
  'Опять гориллы на диванах катаются...', 'Молодой человек, шапку поправь!', 'Пиво есть?', 'Куда катится район...',
  'Говорят, в «Бочке» пиво свежее', 'Банан будешь?', 'Мне бы до пенсии дожить', 'Автобус опять не пришёл',
  'Ты чё такой серьёзный?', 'Осень, листья, красота', 'Дядя Витя тачки перекрашивает!', 'В зоопарке горилл не хватает...',
];
const HIT_LINES = ['ОЙ!', 'Хулиган!', 'Ай-ай!', 'Смотри куда едешь!', 'Ну ты чё?!', 'Безобразие!'];

const G = {
  mode: 'title', paused: false, time: 0, name: 'Братан',
  player: null, cars: [], sofas: [], peds: [], bullets: [], peels: [], pickups: [], parts: [], texts: [], skids: [],
  stars: 0, lostT: 0, spawnSofaT: 0, money: 100, score: 0, beer: 0, bananas: 30, drunk: 0, drunkT: 0,
  cam: { x: 0, y: 0, zoom: 1, rot: 0 }, view: { x0: 0, y0: 0, x1: 0, y1: 0 }, shake: 0,
  focus: { x: 0, y: 0 }, flowT: 0, popT: 0, over: null, rob: null, ctx: null,
  homeT: 0, homeLatch: false, sprayT: 0, sprayLatch: false, rampCd: 0, hicT: 0,
  stats: { robbed: 0, calmed: 0, drunk: 0 },
};

/* ----- вспомогательные ----- */
function addPart(type, x, y, o) {
  if (G.parts.length > 420) G.parts.shift();
  const p = Object.assign({ type, x, y, vx: 0, vy: 0, life: 1, max: 1, size: 4, rot: 0, vr: 0, color: '#fff' }, o || {});
  p.max = p.life;
  G.parts.push(p);
}
function addText(x, y, text, color, size, life) {
  if (G.texts.length > 40) G.texts.shift();
  G.texts.push({ x, y, text, color: color || '#fff', size: size || 16, life: life || 1.4, max: life || 1.4 });
}
function scoreMult() { return 1 + 0.25 * G.drunk; }
function addScore(n, x, y) {
  const v = Math.round(n * scoreMult());
  G.score += v;
  if (x !== undefined) addText(x, y - 26, '+' + v, '#9fff7a', 15, 1.2);
  return v;
}
function playerPos() { const p = G.player; return p.car ? p.car : p; }
function inView(x, y, m) { return R3.visible(x, y, m); }
/** Экранное направление (джойстик) → направление в мире относительно камеры */
function camRel(x, y) { const fx = Math.cos(R3.yaw), fy = Math.sin(R3.yaw); return { x: fx * -y - fy * x, y: fy * -y + fx * x }; }
function nearSound(x, y, name) { if (dist2(x, y, G.cam.x, G.cam.y) < 700 * 700) Sound.play(name); }

/* ----- игрок ----- */
function makePlayer(x, y) {
  return { x, y, a: -Math.PI / 2, vx: 0, vy: 0, r: 11, hp: 100, car: null, walkT: 0, moving: false, holding: 'gun', drinkT: 0, downT: 0, sleepT: 0, fireCd: 0, drunk: 0, hurtT: 0 };
}

function damagePlayer(n, why) {
  const p = G.player;
  if (G.over || G.mode !== 'play') return;
  n *= 1 - 0.06 * G.drunk;
  p.hp -= n; p.hurtT = 0.3;
  vibrate(40);
  if (p.hp <= 0) { p.hp = 0; gameOver('wasted', why || 'Здоровье кончилось'); }
}

function updatePlayerFoot(dt) {
  const p = G.player;
  p.moving = false;
  if (p.downT > 0) { p.downT -= dt; p.vx *= Math.exp(-5 * dt); p.vy *= Math.exp(-5 * dt); }
  else if (p.sleepT > 0) {
    p.sleepT -= dt; p.vx = p.vy = 0;
    if (Math.random() < dt * 2) addPart('zzz', p.x + 8, p.y - 14, { vy: -20, vx: 8, life: 1.5 });
  } else if (!G.over) {
    const mv = Input.moveVec();
    const wv = camRel(mv.x, mv.y);
    let mx = wv.x, my = wv.y, mag = mv.mag;
    if (mag > 0 && G.drunk > 0) {
      const sway = (Math.sin(G.time * 1.7) * 0.35 + Math.sin(G.time * 0.63) * 0.2) * (G.drunk / 5);
      const c = Math.cos(sway), s = Math.sin(sway);
      const nx = mx * c - my * s; my = mx * s + my * c; mx = nx;
    }
    const sp = 118 * (p.drinkT > 0 ? 0.45 : 1) * (G.rob ? 0.3 : 1);
    const tx = mx * sp * mag, ty = my * sp * mag;
    const k = Math.min(1, dt * 12);
    p.vx += (tx - p.vx) * k; p.vy += (ty - p.vy) * k;
    if (mag > 0.05) { p.a = approachAngle(p.a, Math.atan2(my, mx), 14 * dt); p.moving = true; p.walkT += dt * (6 + 8 * mag); }
  }
  p.x += p.vx * dt; p.y += p.vy * dt;
  collideCircle(p, p.r);
  // огонь
  p.fireCd -= dt;
  if (!G.over && p.downT <= 0 && p.sleepT <= 0 && p.drinkT <= 0 && Input.fire() && p.fireCd <= 0) {
    const tgt = autoAim(p.x, p.y, p.a, 470, 0.75);
    if (tgt) p.a = Math.atan2(tgt.y - p.y, tgt.x - p.x);
    fireBanana(p.x + Math.cos(p.a) * 22, p.y + Math.sin(p.a) * 22, p.a, p.vx, p.vy);
    p.fireCd = 0.24;
  }
}

function autoAim(x, y, a, range, cone) {
  let best = null, bd = range * range;
  for (const s of G.sofas) {
    if (s.calm || s.leaving) continue;
    const d2 = dist2(x, y, s.x, s.y);
    if (d2 > bd) continue;
    const ad = Math.abs(angDiff(a, Math.atan2(s.y - y, s.x - x)));
    if (ad > cone && d2 > 140 * 140) continue;
    best = s; bd = d2;
  }
  return best;
}

function fireBanana(x, y, a, vx, vy) {
  if (G.bananas <= 0) {
    if (G.player.fireCd > -0.3) return;
    Sound.play('empty'); addText(G.player.x, G.player.y - 30, 'Бананы кончились!', '#ffb347', 14, 1);
    G.player.fireCd = 0.6; UI.toast('🍌 Бананы кончились! Ищи связки бананов или ларёк «ФРУКТЫ»');
    return;
  }
  G.bananas--;
  const spread = (Math.random() - 0.5) * 0.06 * (1 + G.drunk);
  const sp = 560;
  G.bullets.push({ x, y, vx: Math.cos(a + spread) * sp + vx * 0.4, vy: Math.sin(a + spread) * sp + vy * 0.4, life: 0.78, rot: 0 });
  Sound.play('shoot');
}

function drinkBeer() {
  const p = G.player;
  if (G.beer <= 0) { UI.toast('🍺 Пива нет. Купи или ограбь пивной!'); Sound.play('empty'); return; }
  if (p.drinkT > 0 || p.sleepT > 0 || G.over) return;
  p.drinkT = 1.3; p.holding = 'beer';
  Sound.play('drink');
  addText(playerPos().x, playerPos().y - 30, 'БУЛЬ-БУЛЬ', '#ffd56b', 15, 1.1);
}
function finishDrink() {
  const p = G.player, pp = playerPos();
  p.holding = 'gun';
  G.beer--; G.stats.drunk++;
  p.hp = Math.min(100, p.hp + 22);
  addScore(25, pp.x, pp.y);
  setTimeout(() => Sound.play('burp'), 120);
  addText(pp.x, pp.y - 44, 'ЫЫЫЫК!', '#ffe14d', 18, 1.2);
  for (let i = 0; i < 8; i++) addPart('foam', pp.x, pp.y, { vx: rr(-60, 60), vy: rr(-80, 10), life: 0.7, size: rr(3, 6) });
  if (G.drunk >= 5) {
    p.sleepT = 4.5; G.drunk = 3;
    addText(pp.x, pp.y - 60, 'ПЕРЕБРАЛ... Zzz', '#ff8c8c', 18, 2);
    UI.toast('😵 Перебрал! Герой уснул прямо тут...');
    if (p.car) exitCar();
  } else {
    G.drunk++;
    if (G.drunk >= 3) UI.toast('🍺 Угар ×' + scoreMult().toFixed(2) + ' — очки больше, но шатает!');
  }
  G.drunkT = 0;
  Mission.event('drink');
}

/* ----- машины ----- */
function makeCar(typeKey, x, y, a, color) {
  const t = CAR_TYPES[typeKey];
  return {
    type: typeKey, t, L: t.L, W: t.W, x, y, a, vx: 0, vy: 0, speed: 0, color: color || pick(t.colors),
    hp: t.hp, driver: null, dead: false, deadT: 0, slipT: 0, spin: 0, braking: false, persistent: false,
    ai: null, honkT: 0, smokeT: 0, mass: (t.L * t.W) / 100,
  };
}
function randomCarType() {
  const r = Math.random();
  return r < 0.6 ? 'zhiga' : r < 0.78 ? 'niva' : r < 0.92 ? 'gazel' : 'bumer';
}

function laneOK(d, tx, ty) {
  if (tileAt(tx, ty) !== ROAD) return false;
  switch (d) {
    case 0: return isHRoad(ty) && ty % P === 1;
    case 2: return isHRoad(ty) && ty % P === 0;
    case 1: return isVRoad(tx) && tx % P === 0;
    case 3: return isVRoad(tx) && tx % P === 1;
  }
  return false;
}

function aiNext(c) {
  const ai = c.ai, cur = ai.dir;
  const inIx = isHRoad(ai.ty) && isVRoad(ai.tx);
  const ix = Math.floor(ai.tx / P) * 100 + Math.floor(ai.ty / P);
  const opts = [];
  const cand = [cur, (cur + 1) % 4, (cur + 3) % 4];
  for (let i = 0; i < 3; i++) {
    const d = cand[i];
    if (i > 0 && inIx && ai.turnIx === ix) continue;
    const nx = ai.tx + DX[d], ny = ai.ty + DY[d];
    if (laneOK(d, ai.tx, ai.ty) && laneOK(d, nx, ny)) opts.push({ d, w: i === 0 ? 3 : 1.3, nx, ny, turn: i > 0 });
  }
  if (!opts.length) {
    const d = (cur + 2) % 4;
    for (const sd of [(cur + 1) % 4, (cur + 3) % 4]) {
      const sx = ai.tx + DX[sd], sy = ai.ty + DY[sd];
      if (laneOK(d, sx, sy)) { ai.dir = d; ai.tx = sx; ai.ty = sy; return; }
    }
    ai.dir = d; ai.tx += DX[d]; ai.ty += DY[d];
    return;
  }
  let sum = 0; for (const o of opts) sum += o.w;
  let r = Math.random() * sum, ch = opts[0];
  for (const o of opts) { r -= o.w; if (r <= 0) { ch = o; break; } }
  if (ch.turn) ai.turnIx = ix;
  ai.dir = ch.d; ai.tx = ch.nx; ai.ty = ch.ny;
}

function aiBlocked(c) {
  const fx = Math.cos(c.a), fy = Math.sin(c.a);
  const lx = c.x + fx * (c.L * 0.5 + 20), ly = c.y + fy * (c.L * 0.5 + 20);
  const p = G.player;
  if (!p.car && dist2(lx, ly, p.x, p.y) < 26 * 26) return 'player';
  for (const o of G.cars) {
    if (o === c) continue;
    if (Math.abs(o.x - lx) > 50 || Math.abs(o.y - ly) > 50) continue;
    if (dist2(lx, ly, o.x, o.y) < (o.L * 0.5 + 6) * (o.L * 0.5 + 6)) return o.driver === 'player' ? 'player' : 'car';
  }
  for (const s of G.sofas) if (dist2(lx, ly, s.x, s.y) < 30 * 30) return 'sofa';
  for (const q of G.peds) if (q.state !== 'down' && dist2(lx, ly, q.x, q.y) < 18 * 18) return 'ped';
  return null;
}

function updateCarAI(c, dt) {
  const ai = c.ai;
  const tx = tc(ai.tx), ty = tc(ai.ty);
  const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
  const fx = Math.cos(c.a), fy = Math.sin(c.a);
  if (d < 16 || (d < 50 && dx * fx + dy * fy < 0)) aiNext(c);
  const des = Math.atan2(tc(ai.ty) - c.y, tc(ai.tx) - c.x);
  const ad = angDiff(c.a, des);
  let steer = clamp(ad * 2.6, -1, 1);
  let target = ai.cruise;
  if (Math.abs(ad) > 0.35) target = 75;
  const bl = aiBlocked(c);
  if (bl) {
    target = 0;
    ai.blocked += dt;
    if (bl === 'player' && ai.blocked > 1.2 && c.honkT <= 0) {
      c.honkT = 2.5; nearSound(c.x, c.y, 'honk'); addText(c.x, c.y - 24, pick(['БИИП!', 'Э, дорогу!', 'Чё встал?!']), '#fff', 13, 1);
    }
    if (ai.blocked > 6 && bl !== 'player') { ai.blocked = 0; ai.dir = (ai.dir + 1) % 4; }
  } else ai.blocked = 0;
  c.honkT -= dt;
  const vf = c.speed;
  let thr = 0;
  if (vf < target - 8) thr = 0.8; else if (vf > target + 15) thr = -0.6;
  carPhysics(c, thr, steer, dt);
  // если сбился с полосы (после ДТП) — подруливаем к ближайшей полосе
  if (Math.abs(angDiff(c.a, des)) > 2.6 && d > 90) {
    ai.stuck += dt;
    if (ai.stuck > 3) { ai.stuck = 0; resyncAI(c); }
  } else ai.stuck = Math.max(0, ai.stuck - dt);
}

function resyncAI(c) {
  const tx = Math.floor(c.x / T), ty = Math.floor(c.y / T);
  for (let r = 0; r < 3; r++) for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    for (let d = 0; d < 4; d++) {
      if (laneOK(d, tx + x, ty + y) && Math.abs(angDiff(c.a, d * Math.PI / 2)) < 1.6) {
        c.ai.dir = d; c.ai.tx = tx + x + DX[d]; c.ai.ty = ty + y + DY[d];
        if (!laneOK(d, c.ai.tx, c.ai.ty)) { c.ai.tx = tx + x; c.ai.ty = ty + y; }
        return;
      }
    }
  }
}

function carPhysics(c, throttle, steer, dt) {
  const fx = Math.cos(c.a), fy = Math.sin(c.a), rx = -fy, ry = fx;
  let vf = c.vx * fx + c.vy * fy, vl = c.vx * rx + c.vy * ry;
  const t = c.t;
  c.braking = false;
  if (c.dead) throttle = 0;
  if (throttle > 0) vf += throttle * t.acc * dt * (vf < 0 ? 2.2 : 1);
  else if (throttle < 0) {
    if (vf > 5) { vf += throttle * t.acc * 1.9 * dt; c.braking = true; }
    else vf += throttle * t.acc * 0.55 * dt;
  } else { const dec = Math.min(Math.abs(vf), (c.dead ? 300 : 95) * dt); vf -= Math.sign(vf) * dec; }
  vf -= vf * 0.22 * dt;
  const hpF = c.hp < c.t.hp * 0.3 ? 0.7 : 1;
  vf = clamp(vf, -t.max * 0.35, t.max * hpF);
  const grip = c.slipT > 0 ? 0.5 : 7.5;
  const latBefore = Math.abs(vl);
  vl *= Math.exp(-grip * dt);
  if (c.slipT > 0) { c.slipT -= dt; c.a += c.spin * dt; c.spin *= Math.exp(-1.3 * dt); }
  else {
    const sf = clamp(Math.abs(vf) / 80, 0, 1);
    c.a += steer * t.turn * sf * Math.sign(vf) * dt;
  }
  c.vx = fx * vf + rx * vl; c.vy = fy * vf + ry * vl;
  c.x += c.vx * dt; c.y += c.vy * dt;
  c.speed = vf;
  if ((latBefore > 70 || c.slipT > 0) && inView(c.x, c.y, 50)) {
    for (const s of [1, -1]) G.skids.push({ x: c.x - fx * c.L * 0.35 + rx * c.W * 0.4 * s, y: c.y - fy * c.L * 0.35 + ry * c.W * 0.4 * s, life: 4 });
    if (G.skids.length > 300) G.skids.splice(0, 2);
  }
  vehicleWalls(c);
}

function vehicleWalls(c) {
  const fx = Math.cos(c.a), fy = Math.sin(c.a), off = c.L / 2 - c.W / 2, r = c.W / 2;
  let hit = null;
  for (const s of [1, -1]) {
    const ox = c.x + fx * off * s, oy = c.y + fy * off * s;
    const o = { x: ox, y: oy };
    const h = collideCircle(o, r);
    if (h) { c.x += o.x - ox; c.y += o.y - oy; hit = h; }
  }
  if (!hit) return;
  const vn = c.vx * hit.nx + c.vy * hit.ny;
  if (vn < 0) {
    c.vx -= 1.4 * vn * hit.nx; c.vy -= 1.4 * vn * hit.ny;
    const imp = -vn;
    if (imp > 90) {
      damageVehicle(c, (imp - 90) * 0.13);
      nearSound(c.x, c.y, imp > 200 ? 'crash' : 'bump');
      if (c.driver === 'player') { G.shake = Math.min(12, imp / 25); vibrate(Math.min(120, imp / 3)); }
      for (let i = 0; i < 4; i++) addPart('spark', c.x - hit.nx * 10, c.y - hit.ny * 10, { vx: rr(-90, 90), vy: rr(-90, 90), life: 0.35, color: '#ffd27a', size: 2 });
    }
  }
}

function damageVehicle(c, n) {
  if (c.dead) return;
  c.hp -= n;
  if (c.hp <= 0) {
    c.hp = 0; c.dead = true; c.deadT = 0;
    nearSound(c.x, c.y, 'boom');
    G.shake = Math.max(G.shake, 10);
    for (let i = 0; i < 26; i++) addPart(i % 3 ? 'smoke' : 'fire', c.x, c.y, { vx: rr(-120, 120), vy: rr(-120, 120), life: rr(0.6, 1.4), size: rr(8, 16) });
    addText(c.x, c.y - 20, 'БАБАХ!', '#ff8a3a', 22, 1.3);
    const p = G.player;
    if (p.car === c) { exitCar(true); damagePlayer(25, 'Тачка взорвалась'); p.downT = 1; }
    for (const q of G.peds) if (q.state !== 'down' && dist2(q.x, q.y, c.x, c.y) < 70 * 70) knockPed(q, q.x - c.x, q.y - c.y, 160);
    for (const s of G.sofas) if (dist2(s.x, s.y, c.x, c.y) < 80 * 80) { s.stunT = 1.5; s.slipT = 1; s.spin = 6; }
    if (!p.car && dist2(p.x, p.y, c.x, c.y) < 60 * 60) { damagePlayer(20, 'Рядом взорвалась тачка'); p.downT = 0.8; }
  }
}

function enterCar() {
  const p = G.player;
  let best = null, bd = 56 * 56;
  for (const c of G.cars) {
    if (c.dead) continue;
    const d2 = dist2(p.x, p.y, c.x, c.y);
    if (d2 < bd) { bd = d2; best = c; }
  }
  if (!best) { UI.toast('🚗 Подойди ближе к машине'); return; }
  if (best.driver === 'ai') {
    const q = makePed(best.x - Math.sin(best.a) * 26, best.y + Math.cos(best.a) * 26);
    q.state = 'flee'; q.t = 2.5; q.a = Math.atan2(q.y - best.y, q.x - best.x);
    G.peds.push(q);
    addText(q.x, q.y - 20, pick(['Э! Моя тачка!', 'Караул! Угнали!', 'Ну ты наглый!']), '#fff', 14, 1.6);
    if (G.stars === 0 && Math.random() < 0.3) raiseWanted(1, 'Угон заметили!');
  }
  best.driver = 'player'; best.ai = null; best.persistent = true;
  p.car = best; p.drinkT = Math.min(p.drinkT, 0.01);
  R3.camDrag = 0;
  Sound.play('door');
  Sound.radioSet(Sound.musicOn);
  if (Sound.musicOn) UI.toast('📻 Радио «БАНАН FM»');
  Mission.event('enterCar');
}

function exitCar(force) {
  const p = G.player, c = p.car;
  if (!c) return;
  if (!force && Math.abs(c.speed) > 140) { UI.toast('Притормози, чтобы выйти!'); return; }
  const fx = Math.cos(c.a), fy = Math.sin(c.a);
  const spots = [[-fy * 30, fx * 30], [fy * 30, -fx * 30], [-fx * (c.L / 2 + 16), -fy * (c.L / 2 + 16)], [fx * (c.L / 2 + 16), fy * (c.L / 2 + 16)]];
  let ex = c.x + spots[0][0], ey = c.y + spots[0][1];
  for (const s of spots) {
    const x = c.x + s[0], y = c.y + s[1];
    if (!solidAt(x, y) && !solidAt(x + 8, y) && !solidAt(x - 8, y) && !solidAt(x, y + 8) && !solidAt(x, y - 8)) { ex = x; ey = y; break; }
  }
  p.x = ex; p.y = ey; p.vx = c.vx * 0.3; p.vy = c.vy * 0.3; p.a = c.a;
  c.driver = null; p.car = null;
  collideCircle(p, p.r);
  Sound.play('door');
  Sound.radioSet(false);
  Sound.engineSet(false, 0);
}

function updatePlayerCar(dt) {
  const p = G.player, c = p.car;
  p.x = c.x; p.y = c.y;
  let thr = 0, steer = 0;
  if (!G.over && p.sleepT <= 0) {
    const kd = Input.keyDrive();
    if (kd) { thr = kd.throttle; steer = kd.steer; }
    else {
      const j = Input.joy;
      if (j.mag > 0) {
        const wv = camRel(j.dx, j.dy);
        let ta = Math.atan2(wv.y, wv.x);
        if (G.drunk > 0) ta += (Math.sin(G.time * 1.7) * 0.3 + Math.sin(G.time * 0.6) * 0.2) * (G.drunk / 5);
        const d = angDiff(c.a, ta);
        if (Math.abs(d) < 2.0) {
          steer = clamp(d * 2.4, -1, 1);
          thr = j.mag * (Math.abs(d) > 1.2 ? 0.55 : 1);
        } else if (c.speed > 40) { thr = -1; }
        else {
          thr = -j.mag;
          const dd = angDiff(c.a, ta + Math.PI);
          steer = -clamp(dd * 2.2, -1, 1);
        }
      }
    }
  }
  carPhysics(c, thr, steer, dt);
  p.x = c.x; p.y = c.y;
  Sound.engineSet(true, c.speed);
  // стрельба из окна — автонаведение во все стороны
  p.fireCd -= dt;
  if (!G.over && p.drinkT <= 0 && Input.fire() && p.fireCd <= 0) {
    const tgt = autoAim(c.x, c.y, c.a, 430, Math.PI);
    const a = tgt ? Math.atan2(tgt.y - c.y, tgt.x - c.x) : c.a;
    fireBanana(c.x + Math.cos(a) * (c.L / 2 + 6), c.y + Math.sin(a) * (c.L / 2 + 6), a, c.vx, c.vy);
    p.fireCd = 0.28;
  }
  if (c.hp < c.t.hp * 0.35 && Math.random() < dt * 12) addPart('smoke', c.x + Math.cos(c.a) * c.L * 0.4, c.y + Math.sin(c.a) * c.L * 0.4, { vx: rr(-15, 15), vy: rr(-30, -10), life: 1, size: rr(5, 9) });
}

/* ----- пешеходы ----- */
function makePed(x, y) {
  const k = pick(PED_KINDS);
  return {
    x, y, a: rr(0, TAU), kind: k.kind, c1: pick(k.c1), c2: k.c2 || '#333', hair: pick(k.hair), legs: k.legs, skin: pick(SKINS),
    state: 'walk', t: 0, tx: Math.floor(x / T), ty: Math.floor(y / T), dir: Math.floor(Math.random() * 4),
    ox: rr(-12, 12), oy: rr(-12, 12), speed: 0, walkT: rr(0, 6), vx: 0, vy: 0, talkT: rr(2, 8), crossing: false, static: false,
  };
}
function pedWalkable(tx, ty) { const v = tileAt(tx, ty); return v !== BLD && v !== ROAD; }

function pedNext(q) {
  const cur = q.dir;
  if (q.crossing) { q.crossing = false; }
  // переход дороги по прямой
  const ax = q.tx + DX[cur], ay = q.ty + DY[cur];
  if (tileAt(ax, ay) === ROAD && Math.random() < 0.18) {
    const bx = q.tx + DX[cur] * 3, by = q.ty + DY[cur] * 3;
    if (pedWalkable(bx, by) && tileAt(q.tx + DX[cur] * 2, q.ty + DY[cur] * 2) === ROAD) {
      q.tx = bx; q.ty = by; q.crossing = true; return;
    }
  }
  const opts = [];
  let sum = 0;
  for (let d = 0; d < 4; d++) {
    const nx = q.tx + DX[d], ny = q.ty + DY[d];
    if (!pedWalkable(nx, ny)) continue;
    const w = d === cur ? 5 : d === (cur + 2) % 4 ? 0.25 : 1.4;
    opts.push({ d, nx, ny, w }); sum += w;
  }
  if (!opts.length) return;
  let r = Math.random() * sum;
  for (const o of opts) { r -= o.w; if (r <= 0) { q.dir = o.d; q.tx = o.nx; q.ty = o.ny; return; } }
}

function knockPed(q, dx, dy, force) {
  if (q.state === 'down') return;
  const d = Math.hypot(dx, dy) || 1;
  q.vx = (dx / d) * force; q.vy = (dy / d) * force;
  q.state = 'down'; q.t = 3.2; q.a = Math.atan2(dy, dx);
  nearSound(q.x, q.y, 'oy');
  addText(q.x, q.y - 22, pick(HIT_LINES), '#fff', 14, 1.3);
}

function updatePed(q, dt) {
  if (q.static) {
    q.talkT -= dt;
    if (q.talkT <= 0) { q.talkT = rr(6, 12); if (inView(q.x, q.y, 0)) addText(q.x, q.y - 22, pick(['Где пиво?!', 'Сохнем...', 'Братан, ну ты где?', 'Ждём!']), '#ffe9a8', 12, 2); }
    return;
  }
  if (q.state === 'down') {
    q.t -= dt;
    q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= Math.exp(-4 * dt); q.vy *= Math.exp(-4 * dt);
    collideCircle(q, 8);
    if (q.t <= 0) { q.state = 'walk'; q.tx = Math.floor(q.x / T); q.ty = Math.floor(q.y / T); if (!pedWalkable(q.tx, q.ty)) q.state = 'flee', q.t = 1; }
    return;
  }
  // испуг от машин и горилл
  if (q.state !== 'flee') {
    for (const c of G.cars) {
      if (Math.abs(c.speed) < 110) continue;
      if (dist2(c.x, c.y, q.x, q.y) < 90 * 90) { q.state = 'flee'; q.t = 1.4; q.a = Math.atan2(q.y - c.y, q.x - c.x); if (Math.random() < 0.3) addText(q.x, q.y - 20, 'А-А-А!', '#fff', 12, 0.9); break; }
    }
    for (const s of G.sofas) {
      if (s.calm || s.leaving) continue;
      if (dist2(s.x, s.y, q.x, q.y) < 80 * 80) { q.state = 'flee'; q.t = 1.6; q.a = Math.atan2(q.y - s.y, q.x - s.x); break; }
    }
  }
  if (q.state === 'flee') {
    q.t -= dt;
    q.speed = 125;
    q.vx = Math.cos(q.a) * q.speed; q.vy = Math.sin(q.a) * q.speed;
    q.x += q.vx * dt; q.y += q.vy * dt;
    if (collideCircle(q, 8)) q.a += rr(1, 2.5);
    q.walkT += dt * 14;
    if (q.t <= 0) {
      q.state = 'walk'; q.tx = Math.floor(q.x / T); q.ty = Math.floor(q.y / T);
      if (!pedWalkable(q.tx, q.ty)) { for (let d = 0; d < 4; d++) if (pedWalkable(q.tx + DX[d], q.ty + DY[d])) { q.tx += DX[d]; q.ty += DY[d]; break; } }
    }
    return;
  }
  // обычная прогулка
  const gx = tc(q.tx) + q.ox, gy = tc(q.ty) + q.oy;
  const dx = gx - q.x, dy = gy - q.y, d = Math.hypot(dx, dy);
  if (d < 4) pedNext(q);
  else {
    const sp = q.kind === 'babka' ? 34 : q.kind === 'shkolnik' ? 62 : 48;
    const s2 = q.crossing ? sp * 1.4 : sp;
    q.a = approachAngle(q.a, Math.atan2(dy, dx), 8 * dt);
    q.vx = (dx / d) * s2; q.vy = (dy / d) * s2;
    q.x += q.vx * dt; q.y += q.vy * dt; q.speed = s2;
    q.walkT += dt * 9;
    if (collideCircle(q, 8)) pedNext(q);
  }
  // болтовня рядом с героем
  q.talkT -= dt;
  if (q.talkT <= 0) {
    q.talkT = rr(5, 12);
    const p = playerPos();
    if (dist2(p.x, p.y, q.x, q.y) < 110 * 110 && !G.player.car) addText(q.x, q.y - 22, pick(PED_LINES), '#ffffff', 12, 2.2);
  }
}

/* ----- гориллы на диванах ----- */
function spawnSofa(boss) {
  const pp = playerPos();
  for (let tries = 0; tries < 80; tries++) {
    const a = rr(0, TAU), d = rr(11, 19) * T;
    const x = pp.x + Math.cos(a) * d, y = pp.y + Math.sin(a) * d;
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (tileAt(tx, ty) !== ROAD && tries < 50) continue;
    if (solidTile(tx, ty)) continue;
    const fd = flowAt(tx, ty);
    if (fd > 40 || fd < 8) continue;
    if (inView(tc(tx), tc(ty), 30) && tries < 70) continue;
    const s = {
      isSofa: true, x: tc(tx), y: tc(ty), a: Math.atan2(pp.y - y, pp.x - x), v: 0, r: boss ? 20 : 17,
      color: boss ? '#1b1b1d' : pick(SOFA_COLORS), boss: !!boss, hits: 0,
      need: boss ? 12 : G.stars >= 4 ? 2 : 1, calm: false, calmT: 0, grabT: 0, slipT: 0, spin: 0, kx: 0, ky: 0,
      turn: boss ? 3.6 : 3.2, acc: boss ? 330 : 260, maxV: boss ? 285 : 160 + G.stars * 22,
      stunT: 0, lastX: tc(tx), lastY: tc(ty), progT: 0, unstickT: 0, alpha: 1, leaving: false, t: rr(0, 5), angry: G.stars >= 3, heartT: 0, mass: boss ? 12 : 7,
    };
    G.sofas.push(s);
    return s;
  }
  return null;
}

function sofaPhysics(s, desired, target, dt) {
  if (s.slipT > 0) { s.slipT -= dt; s.a += s.spin * dt; s.v *= Math.exp(-1.6 * dt); }
  else if (desired !== null) {
    s.a = approachAngle(s.a, desired, s.turn * dt);
    const d = Math.abs(angDiff(s.a, desired));
    const ts = target * (d > 1.3 ? 0.3 : d > 0.6 ? 0.7 : 1);
    s.v = s.v < ts ? Math.min(ts, s.v + s.acc * dt) : Math.max(ts, s.v - s.acc * 1.6 * dt);
  } else s.v *= Math.exp(-3 * dt);
  s.x += (Math.cos(s.a) * s.v + s.kx) * dt;
  s.y += (Math.sin(s.a) * s.v + s.ky) * dt;
  const k = Math.exp(-4 * dt); s.kx *= k; s.ky *= k;
  const h = collideCircle(s, s.r);
  if (h) s.v *= 0.92;
}

function updateSofa(s, dt) {
  s.t += dt;
  const p = G.player, pp = playerPos();
  if (s.leaving) {
    s.alpha -= dt * 0.5;
    sofaPhysics(s, Math.atan2(s.y - pp.y, s.x - pp.x), 140, dt);
    return;
  }
  if (s.calm) {
    s.calmT -= dt;
    sofaPhysics(s, null, 0, dt);
    s.heartT -= dt;
    if (s.heartT <= 0) { s.heartT = 0.45; addPart('heart', s.x + rr(-8, 8), s.y - 14, { vy: -28, vx: rr(-10, 10), life: 1.2, size: 7 }); }
    if (s.calmT <= 0) s.leaving = true;
    return;
  }
  if (G.stars === 0 && !s.boss) { s.leaving = true; return; }

  const d = dist(s.x, s.y, pp.x, pp.y);
  let desired;
  if (d < 7 * T && lineOfSight(s.x, s.y, pp.x, pp.y)) desired = Math.atan2(pp.y - s.y, pp.x - s.x);
  else { const n = flowNext(s.x, s.y); desired = Math.atan2(n.y - s.y, n.x - s.x); }
  let speed = s.maxV;
  if (!p.car && d < 70) speed = Math.max(70, d * 2.2);
  if (s.stunT > 0) { s.stunT -= dt; speed *= 0.25; }
  if (s.unstickT > 0) {
    s.unstickT -= dt;
    desired = s.a + 2.2; speed = 90;
  }
  sofaPhysics(s, desired, speed, dt);

  // застрял? — сдаём назад и объезжаем
  s.progT += dt;
  if (s.progT > 1.2) {
    if (dist2(s.x, s.y, s.lastX, s.lastY) < 22 * 22 && d > 60) s.unstickT = 0.7;
    s.progT = 0; s.lastX = s.x; s.lastY = s.y;
  }

  // хватает героя
  if (G.over || G.mode !== 'play') return;
  if (!p.car) {
    if (d < s.r + p.r + 7) {
      if (s.grabT === 0) addText(s.x, s.y - 26, 'ХВАТЬ!', '#ff5a5a', 18, 0.9);
      s.grabT += dt;
      if (s.grabT > 0.6) gameOver('busted', s.boss ? 'Тебя скрутила сама Главная Горилла!' : 'Тебя повязала горилла на диване!');
    } else s.grabT = Math.max(0, s.grabT - dt * 2);
  } else {
    if (d < s.r + p.car.L / 2 + 8 && Math.abs(p.car.speed) < 35) {
      s.grabT += dt;
      if (s.grabT > 1.4) gameOver('busted', 'Горилла вытащила тебя из машины!');
    } else s.grabT = Math.max(0, s.grabT - dt * 2);
  }
}

function hitSofa(s) {
  s.hits++;
  s.stunT = 0.6;
  Sound.play('hitGorilla');
  for (let i = 0; i < 6; i++) addPart('bits', s.x, s.y, { vx: rr(-80, 80), vy: rr(-80, 80), life: 0.5, size: 3, color: '#f7d43a' });
  if (s.hits >= s.need) calmSofa(s);
  else addText(s.x, s.y - 28, 'ОМ-НОМ ' + s.hits + '/' + s.need, '#ffe14d', 15, 1);
}

function calmSofa(s) {
  s.calm = true; s.calmT = 9; s.grabT = 0; s.heartT = 0;
  Sound.play('calm');
  vibrate(30);
  G.stats.calmed++;
  addScore(100 * Math.max(1, G.stars) * (s.boss ? 10 : 1), s.x, s.y);
  addText(s.x, s.y - 46, s.boss ? 'ГЛАВНАЯ ГОРИЛЛА ДОВОЛЬНА!' : pick(['УСПОКОИЛАСЬ 💛', 'ДОВОЛЬНАЯ!', 'У-У-А-А ♥']), '#ffe14d', s.boss ? 22 : 17, 1.8);
  Mission.event('calm', s);
}

function raiseWanted(n, msg) {
  const before = G.stars;
  G.stars = clamp(G.stars + n, 0, 5);
  G.lostT = 0;
  if (G.stars > before) {
    Sound.play('alarm');
    UI.flashStars();
    if (msg) UI.toast('🦍 ' + msg + ' Розыск: ' + '★'.repeat(G.stars));
    if (before === 0) G.spawnSofaT = 1.2;
  }
}

/* ----- бананы-снаряды, кожура, подбор ----- */
function updateBullets(dt) {
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    b.life -= dt; b.rot += dt * 18;
    let dead = false;
    const steps = 2;
    for (let s = 0; s < steps && !dead; s++) {
      b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
      if (solidAt(b.x, b.y)) {
        dead = true; nearSound(b.x, b.y, 'splat');
        for (let k = 0; k < 5; k++) addPart('bits', b.x - b.vx * 0.01, b.y - b.vy * 0.01, { vx: rr(-70, 70), vy: rr(-70, 70), life: 0.4, size: 3, color: '#f7d43a' });
        break;
      }
      for (const so of G.sofas) {
        if (so.calm || so.leaving) continue;
        if (dist2(b.x, b.y, so.x, so.y) < (so.r + 6) * (so.r + 6)) { hitSofa(so); dead = true; break; }
      }
      if (dead) break;
      for (const q of G.peds) {
        if (q.state === 'down' || q.static) continue;
        if (dist2(b.x, b.y, q.x, q.y) < 11 * 11) {
          knockPed(q, b.vx, b.vy, 60); q.t = 1.5; dead = true;
          addText(q.x, q.y - 30, pick(['ЭЙ! Бананом?!', 'Ай!', 'Фу, банан!']), '#fff', 13, 1);
          break;
        }
      }
      if (dead) break;
      for (const c of G.cars) {
        if (c.driver === 'player') continue;
        if (dist2(b.x, b.y, c.x, c.y) < (c.W * 0.7) * (c.W * 0.7)) { dead = true; nearSound(b.x, b.y, 'splat'); break; }
      }
    }
    if (!dead && b.life <= 0) {
      dead = true;
      if (!solidAt(b.x, b.y)) {
        G.peels.push({ x: b.x, y: b.y, a: rr(0, TAU), life: 30 });
        if (G.peels.length > 45) G.peels.shift();
      }
    }
    if (dead) G.bullets.splice(i, 1);
  }
}

function updatePeels(dt) {
  for (let i = G.peels.length - 1; i >= 0; i--) {
    const pe = G.peels[i];
    pe.life -= dt;
    let used = pe.life <= 0;
    if (!used) {
      for (const c of G.cars) {
        if (Math.abs(c.speed) < 60 || c.slipT > 0) continue;
        if (dist2(c.x, c.y, pe.x, pe.y) < 20 * 20) {
          c.slipT = 1.0; c.spin = (Math.random() < 0.5 ? -1 : 1) * rr(4.5, 7.5); used = true;
          nearSound(c.x, c.y, 'skid'); addText(c.x, c.y - 24, 'ВЖУХ!', '#ffe14d', 15, 1);
          break;
        }
      }
    }
    if (!used) {
      for (const s of G.sofas) {
        if (s.v < 50 || s.slipT > 0) continue;
        if (dist2(s.x, s.y, pe.x, pe.y) < 20 * 20) {
          s.slipT = 1.5; s.spin = (Math.random() < 0.5 ? -1 : 1) * rr(6, 9); used = true;
          nearSound(s.x, s.y, 'skid'); addText(s.x, s.y - 26, 'ОПА! ДИВАН ЗАНЕСЛО!', '#ffe14d', 14, 1.2);
          addScore(20, s.x, s.y);
          break;
        }
      }
    }
    if (!used) {
      for (const q of G.peds) {
        if (q.state !== 'walk' || q.static) continue;
        if (dist2(q.x, q.y, pe.x, pe.y) < 10 * 10) { knockPed(q, Math.cos(q.a), Math.sin(q.a), 40); q.t = 1.4; used = true; break; }
      }
    }
    if (used) G.peels.splice(i, 1);
  }
}

function initPickups() {
  G.pickups = [];
  const R = mulberry32(555);
  let n = 0;
  while (n < 34) {
    const tx = Math.floor(R() * N), ty = Math.floor(R() * N);
    const v = tileAt(tx, ty);
    if (v !== SIDE && v !== PATH && v !== GRASS) continue;
    G.pickups.push({ x: tc(tx), y: tc(ty), type: R() < 0.72 ? 'banana' : 'beer', active: true, t: 0 });
    n++;
  }
}

function updatePickups(dt) {
  const pp = playerPos();
  for (const k of G.pickups) {
    if (!k.active) { k.t -= dt; if (k.t <= 0 && !inView(k.x, k.y, 0)) k.active = true; continue; }
    if (G.mode !== 'play' || G.over) continue;
    if (dist2(pp.x, pp.y, k.x, k.y) < 28 * 28) {
      if (k.type === 'banana') {
        if (G.bananas >= 99) continue;
        G.bananas = Math.min(99, G.bananas + 12);
        addText(k.x, k.y - 20, '+12 🍌', '#ffe14d', 16, 1.2);
      } else {
        if (G.beer >= 12) continue;
        G.beer = Math.min(12, G.beer + 2);
        addText(k.x, k.y - 20, '+2 🍺', '#ffd56b', 16, 1.2);
        Mission.event('gotBeer');
      }
      Sound.play('pickup');
      k.active = false; k.t = 50;
    }
  }
}

/* ----- столкновения тел ----- */
function bodyCircles(o, out) {
  out.length = 0;
  if (o.isSofa) { out.push(o.x, o.y, o.r); return out; }
  const fx = Math.cos(o.a), fy = Math.sin(o.a), off = o.L / 2 - o.W / 2, r = o.W / 2;
  out.push(o.x + fx * off, o.y + fy * off, r, o.x - fx * off, o.y - fy * off, r);
  return out;
}
const _ca = [], _cb = [];
function bodyVel(o) { return o.isSofa ? [Math.cos(o.a) * o.v + o.kx, Math.sin(o.a) * o.v + o.ky] : [o.vx, o.vy]; }
function applyImpulse(o, ix, iy) {
  if (o.isSofa) { o.kx += ix; o.ky += iy; o.v *= 0.8; }
  else { o.vx += ix; o.vy += iy; }
}

function collideBodies() {
  const list = [];
  const pp = playerPos();
  for (const c of G.cars) if (Math.abs(c.x - pp.x) < 1400 && Math.abs(c.y - pp.y) < 1400) list.push(c);
  for (const s of G.sofas) if (!s.leaving) list.push(s);
  for (let i = 0; i < list.length; i++) {
    const A = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const B = list[j];
      if (Math.abs(A.x - B.x) > 64 || Math.abs(A.y - B.y) > 64) continue;
      bodyCircles(A, _ca); bodyCircles(B, _cb);
      for (let a = 0; a < _ca.length; a += 3) for (let b = 0; b < _cb.length; b += 3) {
        const dx = _ca[a] - _cb[b], dy = _ca[a + 1] - _cb[b + 1];
        const rs = _ca[a + 2] + _cb[b + 2];
        const d2 = dx * dx + dy * dy;
        if (d2 >= rs * rs || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = rs - d;
        const ma = A.mass, mb = B.mass, sm = ma + mb;
        A.x += nx * pen * (mb / sm); A.y += ny * pen * (mb / sm);
        B.x -= nx * pen * (ma / sm); B.y -= ny * pen * (ma / sm);
        const va = bodyVel(A), vb = bodyVel(B);
        const vrel = (va[0] - vb[0]) * nx + (va[1] - vb[1]) * ny;
        if (vrel < 0) {
          const jimp = (-(1.35) * vrel) / (1 / ma + 1 / mb);
          applyImpulse(A, (jimp / ma) * nx, (jimp / ma) * ny);
          applyImpulse(B, (-jimp / mb) * nx, (-jimp / mb) * ny);
          const imp = -vrel;
          if (imp > 70) onBodyImpact(A, B, imp);
        }
      }
    }
  }
}

function onBodyImpact(A, B, imp) {
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  nearSound(mx, my, imp > 180 ? 'crash' : 'bump');
  for (const o of [A, B]) {
    if (!o.isSofa) damageVehicle(o, (imp - 70) * 0.09);
    if (o.driver === 'ai' && o.ai) o.ai.blocked = 0;
  }
  const pc = G.player.car;
  if (pc && (A === pc || B === pc)) {
    G.shake = Math.min(12, imp / 25); vibrate(Math.min(100, imp / 3));
    const other = A === pc ? B : A;
    if (other.isSofa && !other.calm) {
      other.stunT = 0.6;
      if (imp > 120 && G.rampCd <= 0 && G.stars < 4) { G.rampCd = 6; raiseWanted(1, 'Таранил диван с гориллой!'); }
    }
    if (other.isSofa && !other.calm && imp > 50) damageVehicle(pc, 4);
  }
}

function pedVehicleHits() {
  const p = G.player;
  for (const c of G.cars) {
    const sp = Math.abs(c.speed);
    if (sp < 30) continue;
    const fx = Math.cos(c.a), fy = Math.sin(c.a);
    const check = (o, r) => {
      const dx = o.x - c.x, dy = o.y - c.y;
      if (Math.abs(dx) > 50 || Math.abs(dy) > 50) return false;
      const along = dx * fx + dy * fy, side = -dx * fy + dy * fx;
      return Math.abs(along) < c.L / 2 + r && Math.abs(side) < c.W / 2 + r;
    };
    for (const q of G.peds) {
      if (q.state === 'down' || !check(q, 6)) continue;
      if (sp > 55) {
        knockPed(q, c.vx + rr(-40, 40), c.vy + rr(-40, 40), sp * 0.8);
        if (c.driver === 'player') {
          c.vx *= 0.85; c.vy *= 0.85;
          if (Math.random() < 0.35 && G.stars < 2) raiseWanted(1, 'Сбил прохожего!');
        }
      } else {
        const side = -(q.x - c.x) * fy + (q.y - c.y) * fx;
        q.x += -fy * Math.sign(side) * 3; q.y += fx * Math.sign(side) * 3;
      }
    }
    if (!p.car && G.mode === 'play' && check(p, 8) && !G.over) {
      if (sp > 90 && p.downT <= 0) {
        damagePlayer(sp * 0.07, 'Сбила машина');
        p.downT = 0.9; p.vx = c.vx * 0.8; p.vy = c.vy * 0.8;
        addText(p.x, p.y - 26, 'АЙ!', '#ff7a7a', 16, 1);
        nearSound(p.x, p.y, 'bump');
        if (c.driver === 'ai') { c.vx *= 0.5; c.vy *= 0.5; }
      } else {
        const side = -(p.x - c.x) * fy + (p.y - c.y) * fx;
        p.x += -fy * Math.sign(side || 1) * 4; p.y += fx * Math.sign(side || 1) * 4;
      }
    }
  }
  // диваны расталкивают пешеходов
  for (const s of G.sofas) {
    for (const q of G.peds) {
      if (q.state === 'down') continue;
      if (dist2(s.x, s.y, q.x, q.y) < (s.r + 7) * (s.r + 7) && s.v > 60) knockPed(q, q.x - s.x, q.y - s.y, 120);
    }
  }
}

/* ----- население вокруг героя ----- */
function spawnTraffic(fx, fy) {
  for (let tries = 0; tries < 25; tries++) {
    const a = rr(0, TAU), d = rr(10, 19) * T;
    const tx = Math.floor((fx + Math.cos(a) * d) / T), ty = Math.floor((fy + Math.sin(a) * d) / T);
    if (tileAt(tx, ty) !== ROAD) continue;
    const hr = isHRoad(ty), vr = isVRoad(tx);
    if (hr && vr) continue;
    const dir = hr ? (ty % P === 1 ? 0 : 2) : (tx % P === 1 ? 3 : 1);
    const x = tc(tx), y = tc(ty);
    if (inView(x, y, 60)) continue;
    let free = true;
    for (const c of G.cars) if (dist2(c.x, c.y, x, y) < 80 * 80) { free = false; break; }
    if (!free) continue;
    const c = makeCar(randomCarType(), x, y, dir * Math.PI / 2);
    c.driver = 'ai';
    c.ai = { dir, tx: tx + DX[dir], ty: ty + DY[dir], cruise: rr(105, 165), blocked: 0, stuck: 0, turnIx: -1 };
    c.vx = Math.cos(c.a) * 60; c.vy = Math.sin(c.a) * 60;
    G.cars.push(c);
    return;
  }
}

function spawnPed(fx, fy) {
  for (let tries = 0; tries < 25; tries++) {
    const a = rr(0, TAU), d = rr(8, 16) * T;
    const tx = Math.floor((fx + Math.cos(a) * d) / T), ty = Math.floor((fy + Math.sin(a) * d) / T);
    const v = tileAt(tx, ty);
    if (!(v === SIDE || (v !== ROAD && v !== BLD && Math.random() < 0.35))) continue;
    const x = tc(tx) + rr(-10, 10), y = tc(ty) + rr(-10, 10);
    if (inView(x, y, 30)) continue;
    G.peds.push(makePed(x, y));
    return;
  }
}

function spawnParked() {
  for (const s of World.parkSpots) {
    if (Math.random() > 0.42) continue;
    // ставим машину мордой к свободному выезду
    let a = s.a + (Math.random() < 0.5 ? 0 : Math.PI);
    if (solidAt(s.x + Math.cos(a) * T, s.y + Math.sin(a) * T)) a += Math.PI;
    const c = makeCar(Math.random() < 0.75 ? 'zhiga' : Math.random() < 0.6 ? 'niva' : 'bumer', s.x, s.y, a);
    c.persistent = true;
    G.cars.push(c);
  }
}

function managePopulation(dt) {
  G.popT -= dt;
  if (G.popT > 0) return;
  G.popT = 0.25;
  const f = G.focus;
  const farCar = 26 * T, farPed = 22 * T;
  for (let i = G.cars.length - 1; i >= 0; i--) {
    const c = G.cars[i];
    if (c.driver === 'player') continue;
    const d2 = dist2(c.x, c.y, f.x, f.y);
    if (!c.persistent && d2 > farCar * farCar) G.cars.splice(i, 1);
    else if (c.dead && c.deadT > 25 && !inView(c.x, c.y, 50)) G.cars.splice(i, 1);
  }
  for (let i = G.peds.length - 1; i >= 0; i--) {
    const q = G.peds[i];
    if (q.static) continue;
    if (dist2(q.x, q.y, f.x, f.y) > farPed * farPed) G.peds.splice(i, 1);
  }
  let traffic = 0;
  for (const c of G.cars) if (c.driver === 'ai' && dist2(c.x, c.y, f.x, f.y) < farCar * farCar) traffic++;
  if (traffic < 15) spawnTraffic(f.x, f.y);
  let peds = 0;
  for (const q of G.peds) if (!q.static) peds++;
  if (peds < 24) spawnPed(f.x, f.y);
}

/* ----- частицы ----- */
function updateParts(dt) {
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i];
    p.life -= dt;
    if (p.life <= 0) { G.parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    if (p.type === 'smoke' || p.type === 'fire') { p.vx *= Math.exp(-2 * dt); p.vy *= Math.exp(-2 * dt); p.size += dt * 10; }
    else if (p.type === 'bits' || p.type === 'spark' || p.type === 'foam' || p.type === 'money') { p.vx *= Math.exp(-3 * dt); p.vy *= Math.exp(-3 * dt); }
  }
  for (let i = G.texts.length - 1; i >= 0; i--) {
    const t = G.texts[i];
    t.life -= dt; t.y -= dt * 22;
    if (t.life <= 0) G.texts.splice(i, 1);
  }
  for (let i = G.skids.length - 1; i >= 0; i--) { G.skids[i].life -= dt; if (G.skids[i].life <= 0) G.skids.splice(i, 1); }
}
