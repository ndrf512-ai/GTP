'use strict';
/* ===== Базовые утилиты, ввод, звук, сохранения ===== */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
const rr = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rr(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function approachAngle(a, target, maxStep) { return a + clamp(angDiff(a, target), -maxStep, maxStep); }
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f < 1) { r *= f; g *= f; b *= f; } else { const k = f - 1; r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
}
function fmtNum(n) { return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

function vibrate(ms) {
  try {
    if (window.AndroidBridge && window.AndroidBridge.vibrate) window.AndroidBridge.vibrate(ms);
    else if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) { /* без вибрации */ }
}

const Store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* приватный режим */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* */ } },
};

/* ===== Ввод: виртуальный джойстик, кнопки, клавиатура ===== */
const Input = {
  joy: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0, mag: 0 },
  keys: {},
  fireHeld: false,
  queue: [],          // разовые действия: 'car','drink','ctx1','ctx2','pause'
  usedKeyboard: false,
  camId: null, camLX: 0, camDX: 0,
  JOY_R: 62,

  init(touchEl) {
    const j = this.joy;
    touchEl.addEventListener('pointerdown', (e) => {
      Sound.init();
      if (e.clientX > window.innerWidth * 0.45) {
        // правая часть экрана — поворот камеры
        if (this.camId === null) { this.camId = e.pointerId; this.camLX = e.clientX; try { touchEl.setPointerCapture(e.pointerId); } catch (er) { /* */ } }
        e.preventDefault();
        return;
      }
      if (j.active) return;
      j.active = true; j.id = e.pointerId;
      j.ox = e.clientX; j.oy = e.clientY; j.x = e.clientX; j.y = e.clientY;
      this._updJoy();
      try { touchEl.setPointerCapture(e.pointerId); } catch (er) { /* */ }
      e.preventDefault();
    });
    touchEl.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.camId) { this.camDX += e.clientX - this.camLX; this.camLX = e.clientX; e.preventDefault(); return; }
      if (!j.active || e.pointerId !== j.id) return;
      j.x = e.clientX; j.y = e.clientY;
      this._updJoy();
      e.preventDefault();
    });
    const end = (e) => {
      if (e.pointerId === this.camId) { this.camId = null; return; }
      if (e.pointerId !== j.id) return;
      j.active = false; j.id = null; j.dx = 0; j.dy = 0; j.mag = 0;
    };
    touchEl.addEventListener('pointerup', end);
    touchEl.addEventListener('pointercancel', end);
    touchEl.addEventListener('lostpointercapture', end);

    window.addEventListener('keydown', (e) => {
      Sound.init();
      this.usedKeyboard = true;
      const k = e.key.toLowerCase();
      if (!this.keys[k]) {
        if (k === 'e' || k === 'f' || k === 'enter' || k === 'у' || k === 'а') this.queue.push('car');
        if (k === 'q' || k === 'й') this.queue.push('drink');
        if (k === 'r' || k === 'к') this.queue.push('ctx1');
        if (k === 'b' || k === 'и') this.queue.push('ctx2');
        if (k === 'escape' || k === 'p' || k === 'з') this.queue.push('pause');
        if (k === 'm' || k === 'ь') this.queue.push('map');
      }
      this.keys[k] = true;
      if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.fireHeld = false; });
  },

  _updJoy() {
    const j = this.joy;
    let dx = j.x - j.ox, dy = j.y - j.oy;
    const d = Math.hypot(dx, dy);
    const R = this.JOY_R;
    if (d > R) { // база джойстика «едет» за пальцем
      j.ox += (dx / d) * (d - R); j.oy += (dy / d) * (d - R);
      dx = j.x - j.ox; dy = j.y - j.oy;
    }
    const m = Math.min(1, Math.hypot(dx, dy) / R);
    j.mag = m < 0.12 ? 0 : m;
    const dd = Math.hypot(dx, dy) || 1;
    j.dx = dx / dd; j.dy = dy / dd;
  },

  bindHold(el, onDown, onUp) {
    el.addEventListener('pointerdown', (e) => {
      Sound.init();
      e.preventDefault(); e.stopPropagation();
      try { el.setPointerCapture(e.pointerId); } catch (er) { /* */ }
      el.classList.add('down');
      onDown();
    });
    const up = (e) => { el.classList.remove('down'); if (onUp) onUp(e); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  },

  /** Вектор движения пешком: {x,y,mag} */
  moveVec() {
    const k = this.keys;
    let x = 0, y = 0;
    if (k['a'] || k['arrowleft'] || k['ф']) x -= 1;
    if (k['d'] || k['arrowright'] || k['в']) x += 1;
    if (k['w'] || k['arrowup'] || k['ц']) y -= 1;
    if (k['s'] || k['arrowdown'] || k['ы']) y += 1;
    if (x || y) { const d = Math.hypot(x, y); return { x: x / d, y: y / d, mag: 1, kb: true }; }
    const j = this.joy;
    return { x: j.dx, y: j.dy, mag: j.mag, kb: false };
  },
  keyDrive() {
    const k = this.keys;
    const up = k['w'] || k['arrowup'] || k['ц'], dn = k['s'] || k['arrowdown'] || k['ы'];
    const lf = k['a'] || k['arrowleft'] || k['ф'], rt = k['d'] || k['arrowright'] || k['в'];
    if (!(up || dn || lf || rt)) return null;
    return { throttle: (up ? 1 : 0) - (dn ? 1 : 0), steer: (rt ? 1 : 0) - (lf ? 1 : 0) };
  },
  fire() { return this.fireHeld || this.keys[' '] || this.keys['j'] || this.keys['о']; },
  take() { const q = this.queue; this.queue = []; return q; },
};

/* ===== Звук: всё синтезируется WebAudio, без файлов ===== */
const Sound = {
  ctx: null, master: null, sfx: null, music: null, noiseBuf: null,
  on: Store.get('pr_sound', true), musicOn: Store.get('pr_music', true),
  engine: null, siren: null, radio: null,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = this.on ? 0.9 : 0; this.master.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.55; this.sfx.connect(this.master);
      this.music = c.createGain(); this.music.gain.value = this.musicOn ? 0.32 : 0; this.music.connect(this.master);
      const len = c.sampleRate;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },
  setOn(v) { this.on = v; Store.set('pr_sound', v); if (this.master) this.master.gain.value = v ? 0.9 : 0; },
  setMusic(v) { this.musicOn = v; Store.set('pr_music', v); if (this.music) this.music.gain.value = v ? 0.32 : 0; },

  tone(freq, dur, type, vol, slideTo, delay, dest) {
    const c = this.ctx; if (!c || !this.on) return;
    const t = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol, freq, delay, q, dest) {
    const c = this.ctx; if (!c || !this.on) return;
    const t = c.currentTime + (delay || 0);
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 1000; f.Q.value = q || 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfx);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  },

  play(name) {
    if (!this.ctx || !this.on) return;
    switch (name) {
      case 'shoot': this.tone(700, 0.12, 'square', 0.12, 260); this.noise(0.05, 0.08, 2500); break;
      case 'empty': this.tone(180, 0.06, 'square', 0.08); break;
      case 'hitGorilla': this.tone(320, 0.12, 'sine', 0.25, 520); this.tone(520, 0.14, 'sine', 0.22, 300, 0.12); break;
      case 'calm':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.18, null, i * 0.08));
        this.tone(260, 0.3, 'sine', 0.2, 380, 0.05); break;
      case 'splat': this.noise(0.12, 0.2, 600, 0, 1.2); break;
      case 'drink':
        for (let i = 0; i < 4; i++) { this.noise(0.08, 0.25, 420 + i * 40, i * 0.17, 3); this.tone(160 + i * 10, 0.08, 'sine', 0.18, 120, i * 0.17); }
        break;
      case 'burp': this.tone(95, 0.45, 'sawtooth', 0.22, 70); this.tone(110, 0.4, 'square', 0.06, 80, 0.03); break;
      case 'hic': this.tone(600, 0.06, 'sine', 0.2, 900); break;
      case 'cash': this.tone(1318, 0.08, 'square', 0.1); this.tone(1760, 0.18, 'square', 0.1, null, 0.07); break;
      case 'alarm': for (let i = 0; i < 6; i++) this.tone(i % 2 ? 980 : 1240, 0.12, 'square', 0.1, null, i * 0.12); break;
      case 'door': this.noise(0.1, 0.35, 300, 0, 1); this.tone(90, 0.1, 'sine', 0.3, 60); break;
      case 'crash': this.noise(0.35, 0.5, 400, 0, 0.5); this.tone(80, 0.3, 'sawtooth', 0.2, 40); break;
      case 'bump': this.noise(0.12, 0.25, 250, 0, 0.7); break;
      case 'oy': this.tone(420, 0.18, 'triangle', 0.18, 300); break;
      case 'honk': this.tone(392, 0.25, 'square', 0.07); this.tone(494, 0.25, 'square', 0.06); break;
      case 'skid': this.noise(0.3, 0.15, 1800, 0, 4); break;
      case 'pickup': this.tone(880, 0.07, 'square', 0.1); this.tone(1320, 0.1, 'square', 0.1, null, 0.06); break;
      case 'pager': this.tone(2000, 0.07, 'square', 0.08); this.tone(2000, 0.07, 'square', 0.08, null, 0.12); break;
      case 'busted': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.25, 'square', 0.14, null, i * 0.22)); break;
      case 'wasted': this.tone(300, 1.2, 'sawtooth', 0.15, 60); break;
      case 'mission': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'square', 0.12, null, i * 0.11)); break;
      case 'star': this.tone(880, 0.1, 'triangle', 0.15, 660); break;
      case 'boom': this.noise(0.8, 0.6, 180, 0, 0.4); this.tone(60, 0.6, 'sine', 0.4, 30); break;
      case 'ooh': this.tone(260, 0.16, 'sine', 0.2, 340); this.tone(340, 0.18, 'sine', 0.2, 260, 0.16); break;
      case 'click': this.tone(1200, 0.03, 'square', 0.06); break;
    }
  },

  /* Мотор машины */
  engineSet(active, speed) {
    const c = this.ctx; if (!c) return;
    if (active && !this.engine) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
      const g = c.createGain(); g.gain.value = 0;
      o.connect(f); f.connect(g); g.connect(this.sfx); o.start();
      this.engine = { o, g, f };
    }
    if (!this.engine) return;
    const t = c.currentTime;
    this.engine.o.frequency.setTargetAtTime(40 + Math.abs(speed) * 0.32, t, 0.05);
    this.engine.g.gain.setTargetAtTime(active && this.on ? 0.06 + Math.min(Math.abs(speed), 350) / 350 * 0.05 : 0, t, 0.08);
  },

  /* Сирена горилл: «У-А, У-А» */
  sirenSet(vol) {
    const c = this.ctx; if (!c) return;
    if (!this.siren && vol > 0) {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 700;
      const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 2.2;
      const lg = c.createGain(); lg.gain.value = 160;
      lfo.connect(lg); lg.connect(o.frequency);
      const g = c.createGain(); g.gain.value = 0;
      o.connect(g); g.connect(this.sfx); o.start(); lfo.start();
      this.siren = { o, g };
    }
    if (this.siren) this.siren.g.gain.setTargetAtTime(this.on ? vol * 0.07 : 0, c.currentTime, 0.1);
  },

  /* «Радио БАНАН FM» — чиптюн в машине */
  radioOn: false, _step: 0, _next: 0, _timer: null,
  radioSet(on) {
    if (!this.ctx) return;
    if (on === this.radioOn) return;
    this.radioOn = on;
    if (on) {
      this._next = this.ctx.currentTime + 0.1;
      this._timer = setInterval(() => this._sched(), 60);
    } else {
      clearInterval(this._timer); this._timer = null;
    }
  },
  _sched() {
    const c = this.ctx; if (!c) return;
    const spb = 60 / 128 / 2; // восьмые при 128 BPM
    const bass = [45, 45, 57, 45, 45, 57, 45, 55, 41, 41, 53, 41, 43, 43, 55, 43];
    const lead = [69, 0, 72, 0, 76, 74, 72, 0, 69, 0, 67, 69, 0, 64, 67, 0,
      65, 0, 69, 0, 72, 0, 71, 69, 67, 0, 71, 0, 74, 72, 71, 0];
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    while (this._next < c.currentTime + 0.25) {
      const s = this._step, t = this._next - c.currentTime;
      const bar = Math.floor(s / 16) % 4;
      const b = bass[(s % 8) + (bar % 2) * 8];
      this.tone(mtof(b), spb * 0.9, 'triangle', 0.35, null, t, this.music);
      const l = lead[s % 32];
      if (l && bar < 3) this.tone(mtof(l), spb * 0.8, 'square', 0.09, null, t, this.music);
      if (s % 4 === 0) this.tone(150, 0.12, 'sine', 0.5, 45, t, this.music);
      if (s % 4 === 2) this.noise(0.08, 0.18, 2200, t, 1, this.music);
      if (s % 2 === 1) this.noise(0.03, 0.08, 8000, t, 1, this.music);
      this._step++;
      this._next += spb;
    }
  },
  stopAll() { this.engineSet(false, 0); this.sirenSet(0); this.radioSet(false); },
};
