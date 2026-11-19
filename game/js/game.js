'use strict';
/* ===== Главный цикл, камера, отрисовка, HUD, задания, экраны ===== */

const cv = document.getElementById('cv');
const hudcv = document.getElementById('hudcv');
const ctx = hudcv.getContext('2d');
let W = 0, H = 0, DPR = 1;
const FACE = new Image();
FACE.src = window.FACE_SRC;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  hudcv.width = Math.round(W * DPR); hudcv.height = Math.round(H * DPR);
  hudcv.style.width = W + 'px'; hudcv.style.height = H + 'px';
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  R3.resize(W, H, window.devicePixelRatio || 1);
}

const markerOf = (type) => World.markers.find((m) => m.type === type);

/* ===== Задания ===== */
const Mission = {
  idx: 0, free: 0, cur: null, data: null, timer: 0, done: false, boss: null, pending: null,
  list: [
    { type: 'haveBeer', n: 1, text: '{name}, это пацаны с района. Без пива никак! Купи или отожми бутылку в любом пивном 🍺', reward: { money: 50, score: 500 } },
    { type: 'drink', n: 1, text: 'Ну чё, открывай! Жми кнопку 🍺 и выпей за район. Пиво лечит, но шатает.', reward: { money: 0, score: 300 } },
    { type: 'deliverBeer', n: 3, text: 'Мы на остановке у твоего дома, сохнем. Неси 3 пива!', reward: { money: 150, score: 1000 } },
    { type: 'robShop', shop: 'Хмельной Двор', text: 'В «Хмельном Дворе» пиво по 300 рублей. Беспредел! Ограбь их — подойди к двери и жми ГРАБИТЬ.', reward: { money: 100, score: 1500 } },
    { type: 'calm', n: 3, text: 'Гориллы на диванах выехали по твою душу! Успокой троих бананами 🍌 Промах оставляет кожуру — на ней диваны заносит!', reward: { money: 200, score: 1500 } },
    { type: 'deliverCar', text: 'Нужна тачка для дела. Угони любую (кнопка 🚗) и пригони к гаражам на юго-западе.', reward: { money: 300, score: 2000 } },
    { type: 'robMulti', n: 3, time: 240, text: 'ПИВНОЙ МАРАФОН! Ограбь 3 разных пивных за 4 минуты!', reward: { money: 500, score: 3000 } },
    { type: 'boss', text: 'ШУХЕР! Сама ГЛАВНАЯ ГОРИЛЛА выехала на чёрном кожаном диване. Ей нужно 12 бананов, чтобы успокоиться!', reward: { money: 1000, score: 5000 } },
  ],

  reset() { this.idx = 0; this.free = 0; this.cur = null; this.pending = null; this.boss = null; this.done = false; },

  start(i) {
    this.idx = i; this.pending = null;
    if (i < this.list.length) this.cur = Object.assign({}, this.list[i]);
    else { this.cur = this.genFree(); this.free++; }
    this.data = { count: 0, robbed: {}, warned: false };
    this.timer = this.cur.time || 0; this.done = false; this.boss = null;
    const m = this.cur;
    if (m.type === 'calm' && G.stars < 2) { G.stars = 2; G.lostT = 0; G.spawnSofaT = 1; UI.flashStars(); }
    if (m.type === 'boss') { G.stars = Math.max(G.stars, 3); G.lostT = 0; const pp = playerPos(); computeFlow(pp.x, pp.y); this.boss = spawnSofa(true); UI.flashStars(); }
    UI.pager(this.fmt(m.text));
  },
  fmt(s) { return s.replace(/\{name\}/g, G.name); },

  genFree() {
    const k = this.free, r = Math.random(), shop = pick(World.shops);
    if (r < 0.3) return { type: 'robShop', shop: shop.name, text: `{name}, в «${shop.name}» опять задрали цены. Наведи порядок!`, reward: { money: 200 + k * 40, score: 1500 + k * 250 } };
    if (r < 0.55) { const n = 3 + Math.min(5, k); return { type: 'calm', n, text: `Гориллы совсем обнаглели. Успокой ${n} штук бананами!`, reward: { money: 250 + k * 40, score: 1800 + k * 250 } }; }
    if (r < 0.8) { const n = Math.min(4, 2 + Math.floor(k / 2)), tm = 100 + n * 60; return { type: 'robMulti', n, time: tm, text: `Марафон! ${n} разных пивных за ${Math.round(tm / 60)} мин!`, reward: { money: 300 + k * 60, score: 2500 + k * 300 } }; }
    const n = 3 + Math.min(6, k);
    return { type: 'deliverBeer', n, text: `Пацаны на остановке снова сохнут. Неси ${n} пива!`, reward: { money: 150 + k * 40, score: 1200 + k * 200 } };
  },

  event(type, obj) {
    const m = this.cur;
    if (!m || this.done || G.mode !== 'play') return;
    if (type === 'drink' && m.type === 'drink' && ++this.data.count >= m.n) this.complete();
    if (type === 'rob') {
      if (m.type === 'robShop' && obj.name === m.shop) this.complete();
      if (m.type === 'robMulti') {
        this.data.robbed[obj.name] = 1;
        const k = Object.keys(this.data.robbed).length;
        if (k >= m.n) this.complete(); else UI.toast(`🍺 Ограблено ${k}/${m.n}. Следующий!`);
      }
    }
    if (type === 'calm') {
      if (m.type === 'calm' && ++this.data.count >= m.n) this.complete();
      if (m.type === 'boss' && obj.boss) this.complete();
    }
  },

  update(dt) {
    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.t <= 0) {
        const n = this.pending.idx, legend = this.pending.legend;
        this.pending = null;
        if (legend) { UI.big('ТЫ — ЛЕГЕНДА РАЙОНА!', 'Все сюжетные задания пройдены. Дальше — свободная игра и новые заказы от пацанов.', '#ffd23a', 4.5); this.pending = { t: 4.8, idx: n }; }
        else this.start(n);
      }
      return;
    }
    const m = this.cur;
    if (!m || this.done) return;
    const p = G.player;
    if (this.timer > 0 && !G.over) { this.timer -= dt; if (this.timer <= 0) { this.fail('Время вышло!'); return; } }
    switch (m.type) {
      case 'haveBeer': if (G.beer >= m.n) this.complete(); break;
      case 'deliverBeer': {
        const bs = markerOf('busstop');
        if (!p.car && dist2(p.x, p.y, bs.x, bs.y) < 64 * 64) {
          if (G.beer >= m.n) {
            G.beer -= m.n;
            for (const q of G.peds) if (q.static) { q.beer = true; addText(q.x, q.y - 24, pick(['УРА!', 'Красава!', 'Вот это брат!']), '#ffe14d', 15, 1.6); }
            this.complete();
          } else if (!this.data.warned) { this.data.warned = true; UI.toast(`Пацанам нужно ${m.n} 🍺, а у тебя ${G.beer}`); }
        } else this.data.warned = false;
        break;
      }
      case 'deliverCar': {
        const gm = markerOf('garage');
        if (p.car && !p.car.dead && dist2(p.car.x, p.car.y, gm.x, gm.y) < 75 * 75) this.complete();
        break;
      }
      case 'boss': {
        if (!G.over && (!this.boss || G.sofas.indexOf(this.boss) < 0)) this.boss = spawnSofa(true);
        if (G.stars < 2) G.stars = 2;
        break;
      }
    }
  },

  complete() {
    if (this.done) return;
    this.done = true;
    const r = this.cur.reward || {};
    G.money += r.money || 0;
    const sc = addScore(r.score || 0);
    Sound.play('mission'); vibrate(80);
    UI.big('ЗАДАНИЕ ВЫПОЛНЕНО!', (r.money ? '+$' + r.money + '   ' : '') + '+' + fmtNum(sc) + ' очков', '#7CFC6A', 2.6);
    const next = this.idx + 1;
    this.pending = { t: 2.9, idx: next, legend: next === this.list.length };
    this.idx = next;
    if (this.cur.type === 'boss') G.stars = Math.min(G.stars, 1);
    saveGame();
  },

  fail(reason) {
    if (this.done) return;
    this.done = true;
    UI.big('ЗАДАНИЕ ПРОВАЛЕНО', reason + ' Попробуй ещё раз.', '#ff5a5a', 2.6);
    this.pending = { t: 3.6, idx: this.idx };
  },

  onBusted(type) {
    const m = this.cur;
    if (!m || this.done) return;
    if (m.type === 'robMulti' || m.type === 'boss') this.fail(type === 'busted' ? 'Тебя приняли.' : 'Ты вырубился.');
  },

  target() {
    const m = this.cur;
    if (!m || this.done) return null;
    const p = G.player, pp = playerPos();
    const nearestShop = (skip) => {
      let best = null, bd = Infinity;
      for (const s of World.shops) {
        if (s.closedT > 0 || (skip && skip[s.name])) continue;
        const d = dist2(pp.x, pp.y, s.x, s.y);
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    };
    switch (m.type) {
      case 'haveBeer': return nearestShop();
      case 'deliverBeer': return G.beer >= m.n ? markerOf('busstop') : nearestShop();
      case 'robShop': return World.shops.find((s) => s.name === m.shop);
      case 'robMulti': return nearestShop(this.data.robbed);
      case 'calm': {
        let best = null, bd = Infinity;
        for (const s of G.sofas) { if (s.calm || s.leaving) continue; const d = dist2(pp.x, pp.y, s.x, s.y); if (d < bd) { bd = d; best = s; } }
        return best;
      }
      case 'deliverCar': {
        if (p.car) return markerOf('garage');
        let best = null, bd = Infinity;
        for (const c of G.cars) { if (c.dead) continue; const d = dist2(pp.x, pp.y, c.x, c.y); if (d < bd) { bd = d; best = c; } }
        return best;
      }
      case 'boss': return this.boss;
    }
    return null;
  },

  objective() {
    const m = this.cur;
    if (!m || this.done) return '';
    const tm = this.timer > 0 ? '  ⏱ ' + Math.floor(this.timer / 60) + ':' + String(Math.floor(this.timer % 60)).padStart(2, '0') : '';
    switch (m.type) {
      case 'haveBeer': return '🍺 Достань пиво: купи или ограбь пивной';
      case 'drink': return '🍺 Выпей пиво — жми кнопку 🍺';
      case 'deliverBeer': return `🚏 Неси пиво на остановку: ${Math.min(G.beer, m.n)}/${m.n} 🍺`;
      case 'robShop': return `💰 Ограбь «${m.shop}»`;
      case 'robMulti': return `💰 Ограблено ${Object.keys(this.data.robbed).length}/${m.n}${tm}`;
      case 'calm': return `🦍 Успокой горилл бананами: ${this.data.count}/${m.n}`;
      case 'deliverCar': return G.player.car ? '🚗 Гони тачку к гаражам' : '🚗 Угони любую машину (кнопка 🚗)';
      case 'boss': return `👑 ГЛАВНАЯ ГОРИЛЛА: ${this.boss ? this.boss.hits : 0}/12 🍌`;
    }
    return '';
  },
};

/* ===== Сохранение ===== */
function saveGame() {
  Store.set('pr_save', { mission: Mission.idx, free: Mission.free, money: G.money, score: G.score, beer: G.beer, bananas: G.bananas, name: G.name });
  const best = Store.get('pr_best', 0);
  if (G.score > best) Store.set('pr_best', G.score);
}

/* ===== Действия ===== */
function startRobbery(m) {
  if (G.rob || m.closedT > 0) return;
  G.rob = { shop: m, t: 0, dur: 2.6, shoutT: 0 };
  Sound.play('alarm'); vibrate(60);
  addText(m.x, m.y - 40, 'Продавщица: «Ой, мамочки!»', '#fff', 14, 1.8);
}
function completeRobbery(m) {
  const pp = playerPos();
  const beer = ri(4, 6), cash = ri(150, 350);
  G.beer = Math.min(12, G.beer + beer);
  G.money += cash;
  addScore(500, pp.x, pp.y);
  m.closedT = 80;
  G.stats.robbed++;
  Sound.play('cash');
  for (let i = 0; i < 12; i++) addPart('money', m.x, m.y, { vx: rr(-120, 120), vy: rr(-140, 40), life: 1, size: 14 });
  addText(pp.x, pp.y - 50, `+${beer} 🍺  +$${cash}`, '#9fff7a', 18, 1.8);
  raiseWanted(G.stars >= 3 ? 1 : 2, 'Ограбление пивного!');
  Mission.event('rob', m);
  Mission.event('gotBeer');
}
function buyBeer(m) {
  if (m.closedT > 0) return;
  if (G.beer >= 12) { UI.toast('Больше 12 бутылок не унести!'); return; }
  if (G.money < 40) { UI.toast('💸 Нужно $40. Денег нет... но можно ограбить!'); Sound.play('empty'); return; }
  G.money -= 40; G.beer++;
  Sound.play('cash');
  addText(m.x, m.y - 30, '+1 🍺  −$40', '#ffd56b', 15, 1.2);
  Mission.event('gotBeer');
}
function buyBananas(m) {
  if (G.bananas >= 99) { UI.toast('Бананов и так полно!'); return; }
  if (G.money < 30) { UI.toast('💸 Нужно $30 на бананы'); Sound.play('empty'); return; }
  G.money -= 30; G.bananas = Math.min(99, G.bananas + 15);
  Sound.play('cash');
  addText(m.x, m.y - 30, '+15 🍌  −$30', '#ffe14d', 15, 1.2);
}
function restAtHome() {
  const p = G.player;
  const near = G.sofas.some((s) => !s.calm && !s.leaving && dist2(s.x, s.y, p.x, p.y) < 380 * 380);
  if (near) { UI.toast('🦍 Гориллы на хвосте — домой их не приводи!'); return; }
  p.hp = 100; G.stars = 0; G.lostT = 0;
  saveGame();
  Sound.play('pickup');
  UI.toast('🏠 Дома хорошо: здоровье полное, розыск сброшен. Игра сохранена.');
}
function respray() {
  const c = G.player.car;
  if (G.stars === 0 && c.hp >= c.t.hp) { UI.toast('🔧 Дядя Витя: «Тачка и так огонь!»'); return; }
  if (G.money < 100) { UI.toast('🔧 Денег нет, но вы держитесь. Нужно $100'); Sound.play('empty'); return; }
  G.money -= 100;
  const cols = c.t.colors.filter((x) => x !== c.color);
  c.color = cols.length ? pick(cols) : pick(CAR_TYPES.zhiga.colors);
  c.hp = c.t.hp; G.stars = 0; G.lostT = 0;
  Sound.play('cash');
  for (let i = 0; i < 16; i++) addPart('foam', c.x, c.y, { vx: rr(-80, 80), vy: rr(-80, 80), life: 0.8, size: 5, color: c.color });
  UI.toast('🔧 Дядя Витя перекрасил тачку! Гориллы тебя не узнают.');
}

function gameOver(type, msg) {
  if (G.over || G.mode !== 'play') return;
  G.over = { type, t: 0 };
  G.rob = null;
  vibrate(300);
  if (type === 'busted') { Sound.play('busted'); UI.big('ПРИНЯЛИ!', msg + '<br>Штраф 30% денег, пиво конфисковано.', '#4da3ff', 3.3); }
  else { Sound.play('wasted'); UI.big('ВЫРУБИЛСЯ', msg + '<br>Очнулся в травмпункте. −$100', '#ff5a5a', 3.3); }
  Mission.onBusted(type);
}

function respawn() {
  const type = G.over.type;
  G.over = null;
  const p = G.player;
  if (p.car) exitCar(true);
  const m = markerOf(type === 'busted' ? 'zoo' : 'hospital');
  p.x = m.x; p.y = m.y; p.vx = p.vy = 0;
  p.hp = 100; p.downT = 0; p.sleepT = 0; p.drinkT = 0; p.holding = 'gun';
  G.drunk = 0; G.stars = 0; G.lostT = 0;
  G.sofas.length = 0; G.bullets.length = 0;
  if (type === 'busted') { G.money = Math.floor(G.money * 0.7); G.beer = 0; }
  else G.money = Math.max(0, G.money - 100);
  G.bananas = Math.max(G.bananas, 15);
  G.cam.x = p.x; G.cam.y = p.y;
  p.a = Math.PI / 2; R3.yaw = -Math.PI / 2; R3.snap = true; R3.camDrag = 0;
  Sound.stopAll();
  UI.toast(type === 'busted' ? '🦍 Отпустили из зоопарка. Больше не попадайся!' : '🏥 Травмпункт. Доктор сказал: «Меньше пива, больше бананов»');
}

/* ===== Обновление ===== */
function handleActions() {
  for (const a of Input.take()) {
    if (a === 'pause') { if (G.mode === 'play') UI.togglePause(); continue; }
    if (a === 'map') { if (G.mode === 'play') UI.toggleMap(); continue; }
    if (G.mode !== 'play' || G.paused || G.over) continue;
    const p = G.player;
    if (a === 'car') { if (p.car) exitCar(); else if (p.downT <= 0 && p.sleepT <= 0) enterCar(); }
    else if (a === 'drink') drinkBeer();
    else if (a === 'ctx1' && G.ctx && G.ctx.c1 && G.ctx.c1.act) G.ctx.c1.act();
    else if (a === 'ctx2' && G.ctx && G.ctx.c2 && G.ctx.c2.act) G.ctx.c2.act();
  }
}

function updateContext(dt) {
  const p = G.player;
  for (const m of World.shops) if (m.closedT > 0) m.closedT -= dt;
  if (G.rob) {
    const r = G.rob;
    if (p.car || G.over || dist2(p.x, p.y, r.shop.x, r.shop.y) > 75 * 75) { G.rob = null; UI.toast('Ограбление сорвалось!'); }
    else {
      r.t += dt; r.shoutT -= dt;
      if (r.shoutT <= 0) { r.shoutT = 0.9; addText(p.x, p.y - 34, pick(['Гони пиво!', 'Кассу открыла!', 'Быстрее, мать!', 'Это ограбление!']), '#ffe14d', 14, 0.9); }
      if (r.t >= r.dur) { G.rob = null; completeRobbery(r.shop); }
    }
  }
  let c1 = null, c2 = null;
  if (!p.car && !G.over) {
    for (const m of World.markers) {
      if (dist2(p.x, p.y, m.x, m.y) > 46 * 46) continue;
      if (m.type === 'beer') {
        if (m.closedT > 0) c1 = { label: '🔒 ЗАКРЫТО ' + Math.ceil(m.closedT) + 'с', act: null };
        else {
          if (!G.rob) c1 = { label: '💰 ГРАБИТЬ', act: () => startRobbery(m), hot: true };
          c2 = { label: 'КУПИТЬ 🍺 $40', act: () => buyBeer(m) };
        }
      } else if (m.type === 'fruit') c2 = { label: 'КУПИТЬ 🍌×15 $30', act: () => buyBananas(m) };
    }
  }
  G.ctx = { c1, c2 };
  const home = markerOf('home');
  if (!p.car && !G.over && dist2(p.x, p.y, home.x, home.y) < 32 * 32) {
    if (!G.homeLatch) { G.homeT += dt; if (G.homeT > 1.1) { G.homeLatch = true; restAtHome(); } }
  } else { G.homeT = 0; G.homeLatch = false; }
  const rs = markerOf('respray');
  if (p.car && !G.over && dist2(p.car.x, p.car.y, rs.x, rs.y) < 60 * 60 && Math.abs(p.car.speed) < 140) {
    if (!G.sprayLatch) { G.sprayT += dt; if (G.sprayT > 0.9) { G.sprayLatch = true; respray(); } }
  } else { G.sprayT = 0; G.sprayLatch = false; }
}

function updateWanted(dt) {
  const pp = playerPos();
  let active = 0, nearest = Infinity, seen = false;
  for (const s of G.sofas) {
    if (s.calm || s.leaving) continue;
    active++;
    const d = dist(s.x, s.y, pp.x, pp.y);
    if (d < nearest) nearest = d;
    if (d < 260 || (d < 560 && lineOfSight(s.x, s.y, pp.x, pp.y))) seen = true;
  }
  const want = [0, 1, 2, 3, 5, 7][G.stars];
  const bossAlive = Mission.boss && !Mission.boss.calm && G.sofas.indexOf(Mission.boss) >= 0;
  if (active - (bossAlive ? 1 : 0) < want && !G.over) {
    G.spawnSofaT -= dt;
    if (G.spawnSofaT <= 0) { spawnSofa(false); G.spawnSofaT = Math.max(0.8, 2.6 - G.stars * 0.35); }
  }
  if (G.stars > 0 && !G.over) {
    if (seen) G.lostT = 0;
    else {
      G.lostT += dt;
      if (G.lostT > 8 + G.stars * 1.6 && !(Mission.cur && Mission.cur.type === 'boss' && !Mission.done)) {
        G.stars--; G.lostT = 0; Sound.play('star');
        UI.toast(G.stars ? '😮‍💨 Гориллы отстают... Розыск: ' + '★'.repeat(G.stars) : '😎 Оторвался! Розыск снят.');
      }
    }
  }
  Sound.sirenSet(G.mode === 'play' && active ? clamp(1 - nearest / 750, 0, 1) : 0);
}

function updateDrunk(dt) {
  const p = G.player;
  p.drunk = G.drunk;
  if (G.drunk > 0) {
    G.drunkT += dt;
    if (G.drunkT > 32) { G.drunkT = 0; G.drunk--; if (!G.drunk) UI.toast('Протрезвел. Угар закончился.'); }
    G.hicT -= dt;
    if (G.drunk >= 2 && G.hicT <= 0) {
      G.hicT = rr(4, 10) / G.drunk;
      const pp = playerPos();
      addText(pp.x, pp.y - 30, 'ИК!', '#ffe14d', 16, 0.9);
      Sound.play('hic');
      if (!p.car) { p.vx += rr(-90, 90); p.vy += rr(-90, 90); }
    }
  }
}

function updateCamera(dt) {
  const pp = playerPos();
  G.cam.x = pp.x; G.cam.y = pp.y;
  G.shake = Math.max(0, G.shake - dt * 25);
  if (Input.camDX) { R3.yaw += Input.camDX * 0.008; R3.camDrag = 2.5; Input.camDX = 0; }
  const k = Input.keys;
  if (k['z'] || k['я']) { R3.yaw -= 2.2 * dt; R3.camDrag = 2.5; }
  if (k['x'] || k['ч']) { R3.yaw += 2.2 * dt; R3.camDrag = 2.5; }
}

function updateAttract(dt) {
  const t = G.time;
  const cx = WORLD_PX / 2 + Math.cos(t * 0.045) * 1100, cy = WORLD_PX / 2 + Math.sin(t * 0.06) * 900;
  G.cam.x += (cx - G.cam.x) * Math.min(1, dt * 2); G.cam.y += (cy - G.cam.y) * Math.min(1, dt * 2);
  G.focus.x = G.cam.x; G.focus.y = G.cam.y;
  for (const c of G.cars) if (c.driver === 'ai') updateCarAI(c, dt); else if (Math.abs(c.speed) > 1) carPhysics(c, 0, 0, dt);
  for (const q of G.peds) updatePed(q, dt);
  collideBodies();
  managePopulation(dt);
  updateParts(dt);
}

function update(dt) {
  G.time += dt;
  handleActions();
  if (G.mode === 'title') { updateAttract(dt); return; }
  const sdt = G.over ? dt * 0.35 : dt;
  const p = G.player;
  if (p.drinkT > 0) { p.drinkT -= sdt; if (p.drinkT <= 0) finishDrink(); }
  if (p.hurtT > 0) p.hurtT -= dt;
  if (p.car) updatePlayerCar(sdt); else { updatePlayerFoot(sdt); Sound.engineSet(false, 0); }
  const pp = playerPos();
  for (const c of G.cars) {
    if (c === p.car) continue;
    if (Math.abs(c.x - pp.x) > 1700 || Math.abs(c.y - pp.y) > 1700) continue;
    if (c.driver === 'ai' && !c.dead) updateCarAI(c, sdt);
    else if (Math.abs(c.vx) + Math.abs(c.vy) > 0.5 || c.slipT > 0) carPhysics(c, 0, 0, sdt);
    if (c.dead) { c.deadT += sdt; if (c.deadT < 12 && Math.random() < sdt * 8) addPart('smoke', c.x, c.y, { vx: rr(-10, 10), vy: rr(-30, -10), life: 1.4, size: rr(6, 10) }); }
    else if (c.hp < c.t.hp * 0.35 && Math.random() < sdt * 5 && inView(c.x, c.y, 40)) addPart('smoke', c.x, c.y, { vx: rr(-10, 10), vy: rr(-25, -5), life: 1, size: 6 });
  }
  G.flowT -= sdt;
  if (G.flowT <= 0 && (G.sofas.length || G.stars)) { computeFlow(pp.x, pp.y); G.flowT = 0.35; }
  for (let i = G.sofas.length - 1; i >= 0; i--) {
    const s = G.sofas[i];
    updateSofa(s, sdt);
    if (s.leaving && ((s.alpha <= -0.3 && !inView(s.x, s.y, 0)) || s.alpha <= -3 || dist2(s.x, s.y, pp.x, pp.y) > 1400 * 1400)) G.sofas.splice(i, 1);
  }
  for (const q of G.peds) updatePed(q, sdt);
  updateBullets(sdt); updatePeels(sdt); updatePickups(sdt);
  collideBodies(); pedVehicleHits();
  if (!p.car) {
    for (const q of G.peds) {
      if (q.state === 'down') continue;
      const d2 = dist2(p.x, p.y, q.x, q.y);
      if (d2 < 19 * 19 && d2 > 0.01) { const d = Math.sqrt(d2), push = (19 - d) / 2; q.x -= (p.x - q.x) / d * push; q.y -= (p.y - q.y) / d * push; p.x += (p.x - q.x) / d * push; p.y += (p.y - q.y) / d * push; }
    }
  }
  updateWanted(sdt);
  G.focus.x = pp.x; G.focus.y = pp.y;
  managePopulation(sdt);
  updateContext(sdt);
  Mission.update(dt);
  updateDrunk(sdt);
  updateParts(sdt);
  updateCamera(dt);
  G.rampCd -= dt;
  if (G.starFlash > 0) G.starFlash -= dt;
  if (G.over) { G.over.t += dt; if (G.over.t > 3.4) respawn(); }
}

/* ===== Отрисовка: 3D-сцена + 2D-слой поверх ===== */
const MARK_STYLE = {
  beer: { col: '#ffd23a', icon: '🍺' }, fruit: { col: '#7ed957', icon: '🍌', label: 'ФРУКТЫ' },
  home: { col: '#5ab4ff', icon: '🏠', label: 'ДОМ: отдых и сохранение' }, respray: { col: '#ff9f40', icon: '🔧', label: 'ПЕРЕКРАСКА $100 (сброс розыска)' },
  garage: { col: '#c8c8c8', icon: '🚗', label: 'ГАРАЖИ' }, busstop: { col: '#5ab4ff', icon: '🚏', label: 'ОСТАНОВКА' },
  hospital: { col: '#ff6b6b', icon: '🏥', label: 'ТРАВМПУНКТ' }, zoo: { col: '#8bc34a', icon: '🦍', label: 'ЗООПАРК (участок горилл)' },
};
const _sp = { x: 0, y: 0, ok: false, d: 0 };

function outlined(c, txt, x, y, font, col, lw) {
  c.font = font; c.lineWidth = lw || 4; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.strokeText(txt, x, y);
  c.fillStyle = col; c.fillText(txt, x, y);
}

function render(dt) {
  R3.camera3(dt);
  R3.sync(dt);
  R3.render();
  const c = ctx;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.clearRect(0, 0, W, H);
  if (G.mode !== 'play') return;
  drawWorldOverlay(c);
  drawHUD(c);
}

function drawWorldOverlay(c) {
  const p = G.player, pp = playerPos();
  c.textAlign = 'center'; c.textBaseline = 'middle';
  // подписи маркеров рядом
  for (const m of World.markers) {
    const md = dist2(pp.x, pp.y, m.x, m.y);
    if (md > 330 * 330 || md < 40 * 40) continue;
    R3.toScreen(m.x, m.y, 3.5, _sp);
    if (!_sp.ok) continue;
    const st = MARK_STYLE[m.type], closed = m.type === 'beer' && m.closedT > 0;
    const label = m.type === 'beer' ? (closed ? 'ЗАКРЫТО ' + Math.ceil(m.closedT) + 'с' : '«' + m.name + '»') : st.label;
    outlined(c, label, _sp.x, _sp.y, '900 13px sans-serif', closed ? '#bbbbbb' : st.col, 3.5);
  }
  // иконки-частицы: сердечки, Zzz, деньги
  for (const q of G.parts) {
    if (q.type !== 'heart' && q.type !== 'zzz' && q.type !== 'money') continue;
    const age = q.max - q.life;
    R3.toScreen(q.x, q.y, 2.2 + age * 1.6, _sp);
    if (!_sp.ok || _sp.d > 60) continue;
    c.globalAlpha = clamp(q.life / q.max * 1.5, 0, 1);
    const sz = Math.round(clamp(260 / _sp.d, 10, 26));
    if (q.type === 'heart') outlined(c, '♥', _sp.x, _sp.y, `900 ${sz}px sans-serif`, '#ff5c8a', 3);
    else if (q.type === 'zzz') outlined(c, 'z', _sp.x, _sp.y, `900 ${sz}px sans-serif`, '#d0e4ff', 3);
    else outlined(c, '$', _sp.x, _sp.y, `900 ${sz}px sans-serif`, '#6ee26a', 3);
  }
  c.globalAlpha = 1;
  // звёздочки над сбитыми
  for (const q of G.peds) {
    if (q.state !== 'down') continue;
    R3.toScreen(q.x, q.y, 0.9, _sp);
    if (!_sp.ok || _sp.d > 45) continue;
    for (let i = 0; i < 3; i++) { const a = G.time * 5 + i * 2.1; outlined(c, '✦', _sp.x + Math.cos(a) * 14, _sp.y + Math.sin(a) * 5 - 8, '900 12px sans-serif', '#ffe14d', 2); }
  }
  // всплывающие надписи
  for (const t of G.texts) {
    const age = t.max - t.life;
    R3.toScreen(t.x, t.y, 2.6 + age * 1.2, _sp);
    if (!_sp.ok || _sp.d > 70) continue;
    c.globalAlpha = clamp(t.life / t.max * 2, 0, 1);
    const sz = Math.round(t.size * clamp(18 / Math.max(6, _sp.d), 0.7, 1.35));
    outlined(c, t.text, _sp.x, _sp.y, `900 ${sz}px sans-serif`, t.color, 4);
  }
  c.globalAlpha = 1;
  // расстояние до цели под стрелкой
  const tgt = Mission.target();
  if (tgt && R3.arrow.visible) {
    const d = dist(pp.x, pp.y, tgt.x, tgt.y), a = Math.atan2(tgt.y - pp.y, tgt.x - pp.x);
    R3.toScreen(pp.x + Math.cos(a) * 30, pp.y + Math.sin(a) * 30, 2.0, _sp);
    if (_sp.ok) outlined(c, Math.round(d * U) + ' м', _sp.x, _sp.y + 8, '900 13px sans-serif', '#ffd23a', 3.5);
  }
  // круги прогресса: ограбление, дом, перекраска
  const ring = (frac, col) => {
    R3.toScreen(p.x, p.y, 1.0, _sp);
    if (!_sp.ok) return;
    c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.arc(_sp.x, _sp.y, 34, 0, TAU); c.stroke();
    c.strokeStyle = col; c.beginPath(); c.arc(_sp.x, _sp.y, 34, -Math.PI / 2, -Math.PI / 2 + TAU * frac); c.stroke();
  };
  if (G.rob) ring(G.rob.t / G.rob.dur, '#ffd23a');
  else if (G.homeT > 0 && !G.homeLatch) ring(G.homeT / 1.1, '#5ab4ff');
  else if (G.sprayT > 0 && !G.sprayLatch && p.car) ring(G.sprayT / 0.9, '#ff9f40');
  // угар: тёплая виньетка
  if (G.drunk > 0) {
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(255,170,60,0)'); g.addColorStop(1, `rgba(255,140,40,${0.07 * G.drunk})`);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  if (p.hurtT > 0) { c.fillStyle = `rgba(255,0,0,${p.hurtT * 0.5})`; c.fillRect(0, 0, W, H); }
}

/* ===== HUD ===== */
function drawHUD(c) {
  const p = G.player;
  const L = 14 + UI.safeL, x = L + 34, y = 42;
  // портрет героя
  c.save();
  c.beginPath(); c.arc(x, y, 31, 0, TAU); c.fillStyle = '#111'; c.fill();
  c.beginPath(); c.arc(x, y, 28, 0, TAU); c.clip();
  if (G.drunk >= 3) { c.translate(x, y); c.rotate(Math.sin(G.time * 2) * 0.12); c.translate(-x, -y); }
  if (FACE.complete && FACE.naturalWidth) c.drawImage(FACE, x - 29, y - 29, 58, 58);
  if (p.hurtT > 0 || G.over) { c.fillStyle = G.over ? 'rgba(40,40,40,0.55)' : 'rgba(255,0,0,0.35)'; c.fillRect(x - 30, y - 30, 60, 60); }
  if (G.drunk > 0) { c.fillStyle = `rgba(255,90,60,${0.05 * G.drunk})`; c.fillRect(x - 30, y - 30, 60, 60); }
  c.restore();
  c.lineWidth = 5;
  c.strokeStyle = 'rgba(0,0,0,0.55)'; c.beginPath(); c.arc(x, y, 32, 0, TAU); c.stroke();
  const hp = clamp(p.hp / 100, 0, 1);
  c.strokeStyle = hp > 0.6 ? '#5ee36a' : hp > 0.3 ? '#ffd23a' : '#ff4d4d';
  c.beginPath(); c.arc(x, y, 32, -Math.PI / 2, -Math.PI / 2 + TAU * hp); c.stroke();
  if (p.sleepT > 0) { c.font = '900 16px sans-serif'; c.fillStyle = '#d0e4ff'; c.textAlign = 'center'; c.fillText('Zzz', x + 26, y - 26); }

  // деньги, очки
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  const tx = x + 44;
  const out = (txt, X, Y, font, col) => { c.font = font; c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.strokeText(txt, X, Y); c.fillStyle = col; c.fillText(txt, X, Y); };
  out('$' + fmtNum(G.money), tx, 30, '900 22px sans-serif', '#7CFC6A');
  out(fmtNum(G.score) + ' очков', tx, 51, '800 14px sans-serif', '#ffffff');
  let ly = 69;
  if (G.drunk > 0) { out('УГАР ×' + scoreMult().toFixed(2) + ' ' + '🍺'.repeat(G.drunk), tx, ly, '800 12px sans-serif', '#ffb347'); ly += 17; }
  if (p.car) {
    const cc = p.car;
    out(cc.t.name, tx, ly, '800 12px sans-serif', '#dfe6ee');
    const bw = 70, f = clamp(cc.hp / cc.t.hp, 0, 1);
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(tx + 56, ly - 9, bw, 8);
    c.fillStyle = f > 0.5 ? '#5ee36a' : f > 0.25 ? '#ffd23a' : '#ff4d4d'; c.fillRect(tx + 57, ly - 8, (bw - 2) * f, 6);
  }

  // звёзды розыска
  const n = 5, sz = 13, gap = 29;
  const sxr = W - 14 - UI.safeR - 54;
  const flashing = G.starFlash > 0;
  const decaying = G.stars > 0 && G.lostT > 3;
  for (let i = 0; i < n; i++) {
    const cx = sxr - (n - 1 - i) * gap, cy = 28;
    const on = i < G.stars;
    let col = 'rgba(255,255,255,0.18)';
    if (on) {
      col = '#ffd23a';
      if (flashing || (G.sofas.length && Math.floor(G.time * 4) % 2 === 0)) col = Math.floor(G.time * 8) % 2 ? '#4da3ff' : '#ff4d4d';
      if (decaying && Math.floor(G.time * 3) % 2) col = 'rgba(255,210,58,0.35)';
    }
    starPath(c, cx, cy, sz, sz * 0.45);
    c.fillStyle = col; c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.stroke();
  }
  if (G.stars > 0) { c.font = '16px sans-serif'; c.textAlign = 'right'; c.fillText('🦍', sxr - (n - 1) * gap - 18, 34); }

  // джойстик
  const j = Input.joy;
  if (j.active) {
    c.fillStyle = 'rgba(255,255,255,0.10)'; c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2;
    c.beginPath(); c.arc(j.ox, j.oy, Input.JOY_R, 0, TAU); c.fill(); c.stroke();
    const kx = j.ox + j.dx * j.mag * Input.JOY_R, ky = j.oy + j.dy * j.mag * Input.JOY_R;
    c.fillStyle = 'rgba(255,255,255,0.4)'; c.beginPath(); c.arc(kx, ky, 26, 0, TAU); c.fill();
  } else if (!Input.usedKeyboard && G.time - G.startTime < 25) {
    const hx = 30 + UI.safeL + 70, hy = H - 90;
    c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 2; c.setLineDash([6, 6]);
    c.beginPath(); c.arc(hx, hy, 56, 0, TAU); c.stroke(); c.setLineDash([]);
    c.font = '800 12px sans-serif'; c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillText('ДЖОЙСТИК', hx, hy - 4); c.fillText('(тяни пальцем)', hx, hy + 12);
    c.fillText('⟷ тяни здесь — поворот камеры', W * 0.62, H * 0.45);
  }
}

function starPath(c, x, y, R, r) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? r : R;
    c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  c.closePath();
}

/* ===== DOM-интерфейс ===== */
const UI = {
  safeL: 0, safeR: 0, toastT: 0, pagerT: 0, bigT: 0, lastC1: null, lastC2: null,
  $(id) { return document.getElementById(id); },

  init() {
    const $ = this.$.bind(this);
    Input.bindHold($('bFire'), () => { Input.fireHeld = true; }, () => { Input.fireHeld = false; });
    Input.bindHold($('bCar'), () => Input.queue.push('car'));
    Input.bindHold($('bDrink'), () => Input.queue.push('drink'));
    Input.bindHold($('bCtx1'), () => Input.queue.push('ctx1'));
    Input.bindHold($('bCtx2'), () => Input.queue.push('ctx2'));
    Input.bindHold($('bPause'), () => this.togglePause());
    $('pager').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.pagerT = 0; });

    const click = (id, fn) => $(id).addEventListener('click', (e) => { Sound.init(); Sound.play('click'); fn(e); });
    let newArmed = false;
    click('tNew', () => {
      if (Store.get('pr_save', null) && !newArmed) {
        newArmed = true; $('tNew').textContent = '⚠ ТОЧНО? Сохранение сотрётся';
        setTimeout(() => { newArmed = false; $('tNew').textContent = '▶ НОВАЯ ИГРА'; }, 3500);
        return;
      }
      newArmed = false; $('tNew').textContent = '▶ НОВАЯ ИГРА';
      Store.del('pr_save'); startGame(false);
    });
    document.querySelectorAll('.faceimgBg').forEach((e) => { e.style.backgroundImage = 'url(' + window.FACE_SRC + ')'; });
    click('tCont', () => startGame(true));
    click('tHow', () => this.show('how'));
    click('howBack', () => this.hide('how'));
    click('pResume', () => this.togglePause());
    click('pMap', () => this.toggleMap());
    click('pSound', () => { Sound.setOn(!Sound.on); this.syncPause(); });
    click('pMusic', () => { Sound.setMusic(!Sound.musicOn); if (!Sound.musicOn) Sound.radioSet(false); else if (G.player && G.player.car) Sound.radioSet(true); this.syncPause(); });
    click('pHow', () => this.show('how'));
    click('pQuit', () => { saveGame(); toTitle(); });
    $('map').addEventListener('click', () => this.toggleMap());
    const nm = $('heroName');
    nm.value = Store.get('pr_name', 'Братан');
    nm.addEventListener('input', () => { Store.set('pr_name', nm.value.trim() || 'Братан'); });
    this.readSafe();
  },

  readSafe() {
    const s = getComputedStyle(this.$('safeProbe'));
    this.safeL = parseFloat(s.paddingLeft) || 0;
    this.safeR = parseFloat(s.paddingRight) || 0;
    document.documentElement.style.setProperty('--sar', this.safeR + 'px');
  },

  show(id) { this.$(id).classList.remove('hidden'); },
  hide(id) { this.$(id).classList.add('hidden'); },
  isShown(id) { return !this.$(id).classList.contains('hidden'); },

  toast(msg) {
    const el = this.$('toast');
    el.textContent = msg; el.classList.add('on');
    this.toastT = 2.8;
  },
  pager(msg) {
    this.$('pagerText').textContent = msg;
    this.$('pager').classList.add('on');
    this.pagerT = 8;
    Sound.play('pager'); vibrate(50);
  },
  big(title, sub, color, time) {
    const el = this.$('big');
    this.$('bigT').textContent = title;
    this.$('bigT').style.color = color || '#ffd23a';
    this.$('bigS').innerHTML = sub || '';
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    this.bigT = time || 2.5;
  },
  flashStars() { G.starFlash = 1.5; },

  togglePause() {
    if (G.mode !== 'play') return;
    if (this.isShown('map')) { this.hide('map'); }
    G.paused = !G.paused;
    if (G.paused) { this.syncPause(); this.show('pause'); Sound.stopAll(); Input.fireHeld = false; }
    else { this.hide('pause'); this.hide('how'); if (G.player.car) Sound.radioSet(Sound.musicOn); }
  },
  syncPause() {
    this.$('pSound').textContent = 'Звук: ' + (Sound.on ? 'ВКЛ' : 'ВЫКЛ');
    this.$('pMusic').textContent = 'Радио в машине: ' + (Sound.musicOn ? 'ВКЛ' : 'ВЫКЛ');
    this.$('pStats').textContent = `Ограблено пивных: ${G.stats.robbed} · Успокоено горилл: ${G.stats.calmed} · Выпито: ${G.stats.drunk}`;
  },
  toggleMap() {
    if (G.mode !== 'play') return;
    if (this.isShown('map')) { this.hide('map'); if (!this.isShown('pause')) G.paused = false; return; }
    G.paused = true; Sound.stopAll();
    this.show('map'); drawMap();
  },

  update(dt) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.$('toast').classList.remove('on'); }
    if (this.pagerT > 0) { this.pagerT -= dt; if (this.pagerT <= 0) this.$('pager').classList.remove('on'); }
    if (this.bigT > 0) { this.bigT -= dt; if (this.bigT <= 0) this.$('big').classList.remove('on'); }
    if (G.mode !== 'play') return;
    const p = G.player;
    this.$('nBan').textContent = G.bananas;
    this.$('nBeer').textContent = G.beer;
    this.$('bDrink').classList.toggle('dim', G.beer <= 0);
    this.$('bFire').classList.toggle('dim', G.bananas <= 0);
    let nearCar = !!p.car;
    if (!nearCar) for (const c of G.cars) if (!c.dead && dist2(p.x, p.y, c.x, c.y) < 56 * 56) { nearCar = true; break; }
    this.$('bCar').classList.toggle('dim', !nearCar);
    this.$('bCar').classList.toggle('in', !!p.car);
    const c1 = G.ctx && G.ctx.c1, c2 = G.ctx && G.ctx.c2;
    const l1 = c1 ? c1.label : null, l2 = c2 ? c2.label : null;
    if (l1 !== this.lastC1) { this.lastC1 = l1; const b = this.$('bCtx1'); b.textContent = l1 || ''; b.classList.toggle('hidden', !l1); b.classList.toggle('hot', !!(c1 && c1.hot)); }
    if (l2 !== this.lastC2) { this.lastC2 = l2; const b = this.$('bCtx2'); b.textContent = l2 || ''; b.classList.toggle('hidden', !l2); }
    const obj = Mission.objective();
    const oe = this.$('objective');
    if (oe.textContent !== obj) oe.textContent = obj;
    oe.classList.toggle('hidden', !obj || this.pagerT > 0);
  },
};

function drawMap() {
  const mc = UI.$('mapcv');
  const size = Math.min(window.innerWidth - 40, window.innerHeight - 70);
  const d = Math.min(DPR, 2);
  mc.width = size * d; mc.height = size * d; mc.style.width = size + 'px'; mc.style.height = size + 'px';
  const g = mc.getContext('2d');
  g.setTransform(d, 0, 0, d, 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(World.overview, 0, 0, size, size);
  const k = size / WORLD_PX;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const m of World.markers) {
    const st = MARK_STYLE[m.type];
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(m.x * k, m.y * k, 9, 0, TAU); g.fill();
    g.font = '12px sans-serif'; g.fillText(st.icon, m.x * k, m.y * k + 1);
  }
  const tgt = Mission.target();
  if (tgt) { g.strokeStyle = '#ffd23a'; g.lineWidth = 3; g.beginPath(); g.arc(tgt.x * k, tgt.y * k, 13, 0, TAU); g.stroke(); }
  for (const s of G.sofas) if (!s.calm) { g.fillStyle = '#4da3ff'; g.beginPath(); g.arc(s.x * k, s.y * k, 4, 0, TAU); g.fill(); }
  const pp = playerPos();
  g.fillStyle = '#ff3b3b'; g.strokeStyle = '#fff'; g.lineWidth = 2;
  g.beginPath(); g.arc(pp.x * k, pp.y * k, 6, 0, TAU); g.fill(); g.stroke();
}

/* ===== Экраны ===== */
function startGame(cont) {
  const save = cont ? Store.get('pr_save', null) : null;
  G.name = (UI.$('heroName').value || '').trim() || 'Братан';
  Store.set('pr_name', G.name);
  G.mode = 'play'; G.paused = false; G.over = null; G.rob = null; G.ctx = null;
  G.stars = 0; G.lostT = 0; G.drunk = 0; G.drunkT = 0; G.starFlash = 0;
  G.sofas = []; G.bullets = []; G.peels = []; G.parts = []; G.texts = []; G.skids = [];
  G.money = save ? save.money : 100; G.score = save ? save.score : 0;
  G.beer = save ? save.beer : 0; G.bananas = save ? save.bananas : 30;
  G.stats = { robbed: 0, calmed: 0, drunk: 0 };
  for (const s of World.shops) s.closedT = 0;
  const home = markerOf('home');
  G.player = makePlayer(home.x, home.y);
  G.cars = []; spawnParked();
  // тачка у подъезда
  const spot = World.parkSpots.filter((s) => Math.abs(s.y - home.y) < 2 * T && Math.abs(s.x - home.x) < 3 * T)[0];
  if (spot && !G.cars.some((c) => dist2(c.x, c.y, spot.x, spot.y) < 20 * 20)) { const c = makeCar('zhiga', spot.x, spot.y, spot.a, '#e8e4d8'); c.persistent = true; G.cars.push(c); }
  G.peds = [];
  const bs = markerOf('busstop');
  [[-8, -34], [10, -12], [-6, 22]].forEach((o, i) => {
    const q = makePed(bs.x + o[0], bs.y + o[1]);
    q.static = true; q.state = 'idle'; q.a = Math.PI + (i - 1) * 0.4; q.kind = i === 1 ? 'shkolnik' : 'muzhik'; q.talkT = 3 + i * 2;
    G.peds.push(q);
  });
  initPickups();
  // герой стоит лицом к камере — видно лицо; камера смотрит на дом
  G.player.a = Math.PI / 2;
  R3.yaw = -Math.PI / 2; R3.snap = true; R3.camDrag = 0;
  G.cam.x = home.x; G.cam.y = home.y;
  G.startTime = G.time;
  G.homeLatch = true; G.homeT = 0;
  Mission.reset();
  if (save) Mission.free = save.free || 0;
  UI.hide('title'); UI.hide('how'); UI.hide('pause'); UI.hide('map');
  UI.show('hud');
  UI.lastC1 = UI.lastC2 = undefined;
  Mission.start(save ? save.mission : 0);
  if (!save) UI.toast('Привет, ' + G.name + '! Джойстик слева, кнопки справа. Удачи на районе!');
}

function toTitle() {
  G.mode = 'title'; G.paused = false; G.over = null;
  G.sofas = [];
  Sound.stopAll();
  UI.hide('pause'); UI.hide('map'); UI.hide('hud'); UI.hide('how');
  UI.$('toast').classList.remove('on'); UI.$('pager').classList.remove('on'); UI.$('big').classList.remove('on');
  UI.show('title');
  refreshTitle();
}

function refreshTitle() {
  const save = Store.get('pr_save', null);
  UI.$('tCont').classList.toggle('hidden', !save);
  UI.$('best').textContent = fmtNum(Math.max(Store.get('pr_best', 0), G.mode === 'play' ? G.score : 0));
}

/* Android: «назад» и сворачивание */
window.onAndroidBack = function () {
  if (UI.isShown('how')) { UI.hide('how'); return true; }
  if (G.mode === 'play') {
    if (UI.isShown('map')) { UI.toggleMap(); return true; }
    UI.togglePause();
    return true;
  }
  return false;
};
window.onAndroidPause = function () {
  if (G.mode === 'play' && !G.paused) UI.togglePause();
  Sound.stopAll();
  if (G.mode === 'play') saveGame();
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) window.onAndroidPause();
});

/* ===== Запуск ===== */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05;
  if (dt <= 0) return;
  if (!G.paused) update(dt);
  UI.update(dt);
  render(G.paused ? 0 : dt);
}

function boot() {
  genWorld();
  R3.init(cv);
  resize();
  window.addEventListener('resize', () => { resize(); UI.readSafe(); });
  Input.init(document.getElementById('touch'));
  UI.init();
  G.player = makePlayer(WORLD_PX / 2, WORLD_PX / 2);
  G.cam.x = WORLD_PX / 2; G.cam.y = WORLD_PX / 2;
  spawnParked();
  for (let i = 0; i < 40; i++) managePopulation(1);
  refreshTitle();
  requestAnimationFrame((t) => { last = t; frame(t); });
}
boot();
