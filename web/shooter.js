/* Roguelike Shooter: "Neon Dungeon Blaster". 6 rooms of waves, pick upgrades, beat the boss. */
(function (root) {
  "use strict";
  const W = 960, H = 600, WALL = 26, STEP = 1 / 60, ROOMS = 7;
  const UPGRADES = [
    { id: "double", name: "Double Shot", desc: "+1 bullet per shot", color: "#ffd166", apply: (p) => { p.shots++; } },
    { id: "rapid", name: "Rapid Fire", desc: "Shoot 30% faster", color: "#ff7b54", apply: (p) => { p.rate *= 0.7; } },
    { id: "power", name: "Power Shot", desc: "+50% damage", color: "#ff5fb7", apply: (p) => { p.dmg *= 1.5; } },
    { id: "pierce", name: "Piercing", desc: "Bullets go through +1 enemy", color: "#7fd8ff", apply: (p) => { p.pierce++; } },
    { id: "boots", name: "Swift Boots", desc: "Move 18% faster", color: "#7dff9b", apply: (p) => { p.speed *= 1.18; } },
    { id: "heart", name: "Heart Container", desc: "+1 max heart, full heal", color: "#ff6b6b", apply: (p) => { p.maxHp++; p.hp = p.maxHp; } },
    { id: "big", name: "Big Bullets", desc: "Bigger bullets, +20% damage", color: "#c792ff", apply: (p) => { p.size += 3; p.dmg *= 1.2; } },
    { id: "bounce", name: "Ricochet", desc: "Bullets bounce off walls", color: "#9be7ff", apply: (p) => { p.bounce++; } },
    { id: "orbit", name: "Orbit Buddy", desc: "A spinning orb guards you", color: "#ffe066", apply: (p) => { p.orbs++; } },
    { id: "dash", name: "Turbo Dash", desc: "Dash recharges 2x faster", color: "#4ae0ff", apply: (p) => { p.dashCd *= 0.5; } },
  ];
  const FOES = {
    blob: { hp: 3, spd: 95, r: 14, color: "#7bea6a", score: 10 },
    mini: { hp: 1.5, spd: 140, r: 9, color: "#b6f7a8", score: 5 },
    spitter: { hp: 4, spd: 70, r: 15, color: "#ff8fd8", score: 15 },
    dasher: { hp: 5, spd: 80, r: 15, color: "#ffb347", score: 20 },
    splitter: { hp: 7, spd: 70, r: 19, color: "#5fd3c9", score: 25 },
    boss: { hp: 260, spd: 60, r: 46, color: "#b56cff", score: 500 },
  };
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const G = {
    id: "shooter", title: "Neon Blaster", tag: "Roguelike shooter · 6 rooms + boss", color: "#ff5fb7",
    init(api) { this.api = api; this.best = api.load("shooter.best", 0); this.keys = {}; this.mx = W / 2; this.my = H / 2; this.mdown = false; this.autoAim = false; this.reset(); },
    reset(sd) {
      seed = sd || ((Date.now() % 2147483000) + 1);
      this.p = { x: 120, y: H / 2, r: 14, hp: 5, maxHp: 5, speed: 230, rate: 0.24, dmg: 1, shots: 1, pierce: 0, size: 5, bounce: 0, orbs: 0, dashCd: 1.2,
        cd: 0, inv: 0, dashT: 0, dashReady: 0, dx: 1, dy: 0, ang: 0, vx: 0, vy: 0 };
      Object.assign(this, { room: 1, mode: "intro", foes: [], bullets: [], ebullets: [], parts: [], pickups: [], texts: [], spawns: [], waves: [], wave: 0,
        choices: [], picked: [], score: 0, kills: 0, time: 0, shake: 0, flash: 0, obstacles: [], acc: 0, boss: null, god: false });
      this.makeRoom(); this.api.setStatus("WASD move · mouse or arrow keys aim & shoot · Space dash · T auto-aim");
      this.panel();
    },
    enter() { this.panel(); },
    leave() { this.keys = {}; this.mdown = false; },
    makeRoom() {
      const n = this.room; this.obstacles = []; this.foes = []; this.bullets = []; this.ebullets = []; this.pickups = []; this.spawns = [];
      this.hue = [250, 200, 160, 20, 300, 120, 275][n - 1];
      const layouts = [
        [],
        [[300, 150, 60, 60], [600, 390, 60, 60]],
        [[440, 120, 80, 40], [440, 440, 80, 40], [250, 280, 40, 40], [670, 280, 40, 40]],
        [[220, 140, 40, 120], [700, 340, 40, 120], [460, 270, 40, 60]],
        [[330, 200, 50, 50], [580, 200, 50, 50], [330, 350, 50, 50], [580, 350, 50, 50]],
        [[260, 100, 440, 30], [260, 470, 440, 30], [465, 270, 30, 60]],
        [[200, 120, 40, 40], [720, 120, 40, 40], [200, 440, 40, 40], [720, 440, 40, 40]],
      ];
      this.obstacles = (layouts[n - 1] || []).map(([x, y, w, h]) => ({ x, y, w, h }));
      if (n === ROOMS) { this.waves = [["boss"]]; }
      else {
        const pool = ["blob", "blob", "spitter", "dasher", "splitter"].slice(0, Math.min(5, n + 1));
        const nw = n >= 4 ? 3 : 2; this.waves = [];
        for (let w = 0; w < nw; w++) { const cnt = 3 + n + w * 2, list = []; for (let i = 0; i < cnt; i++) list.push(pool[Math.floor(rnd() * pool.length)]); this.waves.push(list); }
      }
      this.wave = 0; this.waveDelay = 0.8; this.doorOpen = false;
    },
    spawnWave() {
      const list = this.waves[this.wave]; if (!list) return;
      for (const type of list) {
        let x, y, tries = 0;
        do { x = WALL + 40 + rnd() * (W - 2 * WALL - 80); y = WALL + 40 + rnd() * (H - 2 * WALL - 80); tries++; }
        while (tries < 40 && (Math.hypot(x - this.p.x, y - this.p.y) < 220 || this.hitsObstacle(x, y, 24)));
        if (type === "boss") { x = W * 0.7; y = H / 2; }
        this.spawns.push({ type, x, y, t: type === "boss" ? 1.6 : 0.7 });
      }
      this.wave++;
      if (this.room === ROOMS) { this.api.sfx("boss"); this.banner = { text: "BOSS: KING GLOOP", t: 2.2 }; }
      else this.banner = { text: `ROOM ${this.room} · WAVE ${this.wave}/${this.waves.length}`, t: 1.3 };
    },
    addFoe(type, x, y) {
      const d = FOES[type], mult = 1 + (this.room - 1) * 0.12;
      const f = { type, d, x, y, r: d.r, hp: d.hp * (type === "boss" ? 1 : mult), max: 0, vx: 0, vy: 0, t: rnd() * 3, cd: 1 + rnd() * 1.5, state: "move", hitT: 0 };
      f.max = f.hp; this.foes.push(f); if (type === "boss") this.boss = f; return f;
    },
    hitsObstacle(x, y, r) { return this.obstacles.some((o) => x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.h); },
    collide(e) {
      e.x = clamp(e.x, WALL + e.r, W - WALL - e.r); e.y = clamp(e.y, WALL + e.r, H - WALL - e.r);
      for (const o of this.obstacles) {
        const cx = clamp(e.x, o.x, o.x + o.w), cy = clamp(e.y, o.y, o.y + o.h), dx = e.x - cx, dy = e.y - cy, d = Math.hypot(dx, dy);
        if (d < e.r) { if (d > 0.01) { e.x = cx + dx / d * e.r; e.y = cy + dy / d * e.r; } else { e.x = o.x - e.r; } }
      }
    },
    nearest() { let b = null, bd = 1e9; for (const f of this.foes) { const d = Math.hypot(f.x - this.p.x, f.y - this.p.y); if (d < bd) { bd = d; b = f; } } return b; },
    fire(ang) {
      const p = this.p; if (p.cd > 0) return false; p.cd = p.rate;
      const spread = 0.14;
      for (let i = 0; i < p.shots; i++) {
        const a = ang + (i - (p.shots - 1) / 2) * spread;
        this.bullets.push({ x: p.x + Math.cos(a) * 18, y: p.y + Math.sin(a) * 18, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560, r: p.size, dmg: p.dmg, pierce: p.pierce, bounce: p.bounce, life: 1.4, hit: [] });
      }
      this.api.sfx("shoot"); return true;
    },
    hurtPlayer(n) {
      const p = this.p; if (p.inv > 0 || p.dashT > 0 || this.god || this.mode === "won") return;
      p.hp -= n; p.inv = 1.0; this.shake = 0.35; this.flash = 0.25; this.api.sfx("hurt");
      if (p.hp <= 0) { p.hp = 0; this.mode = "dead"; this.api.sfx("lose"); this.saveBest(); this.api.setStatus(`Defeated in room ${this.room}. Score ${this.score}. Press R to try again.`); this.panel(); }
    },
    killFoe(f) {
      f.dead = true; this.kills++; this.score += f.d.score; this.burst(f.x, f.y, f.d.color, f.type === "boss" ? 80 : 14); this.api.sfx(f.type === "boss" ? "boom" : "pop");
      this.texts.push({ s: "+" + f.d.score, x: f.x, y: f.y - 10, t: 0.8, c: "#ffd166" });
      if (f.type === "splitter") for (let i = 0; i < 2; i++) { const m = this.addFoe("mini", f.x + (i ? 12 : -12), f.y); m.vx = (i ? 1 : -1) * 200; }
      if (f.type !== "boss" && rnd() < (this.p.hp < this.p.maxHp ? 0.09 : 0.03)) this.pickups.push({ x: f.x, y: f.y, t: 10, kind: "heart" });
      if (f.type === "boss") { this.boss = null; this.shake = 1; this.mode = "won"; this.score += this.p.hp * 100; this.saveBest(); this.api.sfx("win"); this.banner = { text: "VICTORY!", t: 999 };
        this.api.setStatus(`King Gloop defeated! Score ${this.score}. Press R to play again.`); this.panel(); }
    },
    burst(x, y, c, n) { for (let i = 0; i < n; i++) { const a = rnd() * 6.28, v = 60 + rnd() * 220; this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0.4 + rnd() * 0.4, c, s: 2 + rnd() * 4 }); } },
    saveBest() { if (this.score > this.best) { this.best = this.score; this.api.save("shooter.best", this.best); } },
    roomCleared() {
      this.score += 50 * this.room; this.api.sfx("coin");
      const pool = UPGRADES.slice(); this.choices = [];
      while (this.choices.length < 3 && pool.length) this.choices.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
      this.mode = "upgrade"; this.api.setStatus("Room clear! Pick an upgrade: click a card or press 1, 2 or 3."); this.panel();
    },
    pick(i) {
      if (this.mode !== "upgrade" || !this.choices[i]) return false;
      const u = this.choices[i]; u.apply(this.p); this.picked.push(u.name); this.api.sfx("power");
      this.mode = "door"; this.doorOpen = true; this.api.setStatus(`Got ${u.name}! Walk through the glowing door →`); this.panel(); return true;
    },
    nextRoom() {
      this.room++; this.p.x = 70; this.p.y = H / 2; this.makeRoom(); this.mode = "play"; this.api.sfx("open");
      if (this.p.hp < this.p.maxHp) this.p.hp = Math.min(this.p.maxHp, this.p.hp + 1);
      this.api.setStatus(this.room === ROOMS ? "The boss room. Dodge the purple bullet rings!" : `Room ${this.room} of ${ROOMS - 1}. Clear every wave.`); this.panel();
    },
    sim() {
      const p = this.p; this.time += STEP;
      for (const e of this.parts) { e.t -= STEP; e.x += e.vx * STEP; e.y += e.vy * STEP; e.vx *= 0.92; e.vy *= 0.92; } this.parts = this.parts.filter((e) => e.t > 0);
      for (const e of this.texts) { e.t -= STEP; e.y -= 30 * STEP; } this.texts = this.texts.filter((e) => e.t > 0);
      if (this.banner && this.banner.t < 900) { this.banner.t -= STEP; if (this.banner.t <= 0) this.banner = null; }
      this.shake = Math.max(0, this.shake - STEP); this.flash = Math.max(0, this.flash - STEP);
      if (this.mode === "intro" || this.mode === "upgrade" || this.mode === "dead" || this.mode === "won") return;
      // player move
      const k = this.keys; let mx = (k.d ? 1 : 0) - (k.a ? 1 : 0), my = (k.s ? 1 : 0) - (k.w ? 1 : 0);
      const ml = Math.hypot(mx, my); if (ml) { mx /= ml; my /= ml; p.dx = mx; p.dy = my; }
      p.dashReady = Math.max(0, p.dashReady - STEP); p.inv = Math.max(0, p.inv - STEP); p.cd -= STEP;
      if (p.dashT > 0) { p.dashT -= STEP; p.x += p.dx * 760 * STEP; p.y += p.dy * 760 * STEP; if (Math.floor(this.time * 60) % 2) this.parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, t: 0.25, c: "#4ae0ff", s: 10 }); }
      else { p.x += mx * p.speed * STEP; p.y += my * p.speed * STEP; }
      this.collide(p);
      // aim + fire
      let ax = (k.arrowright ? 1 : 0) - (k.arrowleft ? 1 : 0), ay = (k.arrowdown ? 1 : 0) - (k.arrowup ? 1 : 0);
      if (ax || ay) { p.ang = Math.atan2(ay, ax); this.fire(p.ang); }
      else if (this.autoAim) { const n = this.nearest(); if (n) { p.ang = Math.atan2(n.y - p.y, n.x - p.x); this.fire(p.ang); } }
      else { p.ang = Math.atan2(this.my - p.y, this.mx - p.x); if (this.mdown) this.fire(p.ang); }
      // waves
      if (this.mode === "play") {
        if (!this.foes.length && !this.spawns.length) {
          if (this.wave < this.waves.length) { this.waveDelay -= STEP; if (this.waveDelay <= 0) { this.spawnWave(); this.waveDelay = 1.0; } }
          else this.roomCleared();
        }
      }
      for (const s of this.spawns) { s.t -= STEP; if (s.t <= 0) { this.addFoe(s.type, s.x, s.y); this.burst(s.x, s.y, FOES[s.type].color, 10); } }
      this.spawns = this.spawns.filter((s) => s.t > 0);
      // foes
      for (const f of this.foes) {
        f.t += STEP; f.hitT -= STEP; const dx = p.x - f.x, dy = p.y - f.y, d = Math.hypot(dx, dy) || 1;
        if (f.type === "blob" || f.type === "mini" || f.type === "splitter") { f.vx += (dx / d * f.d.spd - f.vx) * 0.08; f.vy += (dy / d * f.d.spd - f.vy) * 0.08; }
        else if (f.type === "spitter") {
          const want = d > 280 ? 1 : d < 200 ? -1 : 0; f.vx += ((dx / d * want + -dy / d * 0.6) * f.d.spd - f.vx) * 0.05; f.vy += ((dy / d * want + dx / d * 0.6) * f.d.spd - f.vy) * 0.05;
          f.cd -= STEP; if (f.cd <= 0) { f.cd = 1.9; const a = Math.atan2(dy, dx); this.ebullets.push({ x: f.x, y: f.y, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, r: 7, life: 4 }); }
        } else if (f.type === "dasher") {
          f.cd -= STEP;
          if (f.state === "move") { f.vx += (dx / d * f.d.spd - f.vx) * 0.05; f.vy += (dy / d * f.d.spd - f.vy) * 0.05; if (f.cd <= 0 && d < 380) { f.state = "wind"; f.cd = 0.6; f.vx = f.vy = 0; f.aim = Math.atan2(dy, dx); } }
          else if (f.state === "wind") { if (f.cd <= 0) { f.state = "dash"; f.cd = 0.45; f.vx = Math.cos(f.aim) * 520; f.vy = Math.sin(f.aim) * 520; } }
          else if (f.state === "dash") { if (f.cd <= 0) { f.state = "move"; f.cd = 1.6 + rnd(); } }
        } else if (f.type === "boss") this.bossAI(f, dx, dy, d);
        f.x += f.vx * STEP; f.y += f.vy * STEP; this.collide(f);
        if (d < f.r + p.r - 2) this.hurtPlayer(1);
      }
      // separation
      for (let i = 0; i < this.foes.length; i++) for (let j = i + 1; j < this.foes.length; j++) {
        const a = this.foes[i], b = this.foes[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
        if (d > 0 && d < m) { const push = (m - d) / 2; if (a.type !== "boss") { a.x -= dx / d * push; a.y -= dy / d * push; } if (b.type !== "boss") { b.x += dx / d * push; b.y += dy / d * push; } }
      }
      // orbit buddies
      for (let i = 0; i < p.orbs; i++) { const a = this.time * 3 + i * Math.PI * 2 / p.orbs, ox = p.x + Math.cos(a) * 46, oy = p.y + Math.sin(a) * 46;
        for (const f of this.foes) if (!f.dead && Math.hypot(f.x - ox, f.y - oy) < f.r + 9) { if (!f.orbT || f.orbT < this.time) { f.orbT = this.time + 0.3; this.hitFoe(f, 1.2 * p.dmg); } }
        this.ebullets = this.ebullets.filter((b) => Math.hypot(b.x - ox, b.y - oy) > b.r + 9); }
      // bullets
      for (const b of this.bullets) {
        b.x += b.vx * STEP; b.y += b.vy * STEP; b.life -= STEP;
        const wallHit = b.x < WALL || b.x > W - WALL || b.y < WALL || b.y > H - WALL || this.hitsObstacle(b.x, b.y, 1);
        if (wallHit) { if (b.bounce > 0) { b.bounce--; if (b.x < WALL || b.x > W - WALL) b.vx *= -1; else if (b.y < WALL || b.y > H - WALL) b.vy *= -1; else { b.vx *= -1; b.vy *= -1; } b.x += b.vx * STEP; b.y += b.vy * STEP; } else { b.life = 0; this.burst(b.x, b.y, "#fff3", 3); } }
        for (const f of this.foes) if (!f.dead && b.life > 0 && !b.hit.includes(f) && Math.hypot(f.x - b.x, f.y - b.y) < f.r + b.r) {
          b.hit.push(f); this.hitFoe(f, b.dmg); f.vx += b.vx * 0.04; f.vy += b.vy * 0.04; if (b.pierce > 0) b.pierce--; else b.life = 0;
        }
      }
      this.bullets = this.bullets.filter((b) => b.life > 0);
      for (const b of this.ebullets) {
        b.x += b.vx * STEP; b.y += b.vy * STEP; b.life -= STEP;
        if (b.x < WALL || b.x > W - WALL || b.y < WALL || b.y > H - WALL || this.hitsObstacle(b.x, b.y, 2)) b.life = 0;
        if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + p.r - 4) { b.life = 0; this.hurtPlayer(1); }
      }
      this.ebullets = this.ebullets.filter((b) => b.life > 0);
      this.foes = this.foes.filter((f) => !f.dead);
      for (const h of this.pickups) { h.t -= STEP; if (Math.hypot(h.x - p.x, h.y - p.y) < 26) { h.t = 0; p.hp = Math.min(p.maxHp, p.hp + 1); this.api.sfx("coin"); this.texts.push({ s: "+1 ♥", x: h.x, y: h.y, t: 0.8, c: "#ff6b6b" }); } }
      this.pickups = this.pickups.filter((h) => h.t > 0);
      if (this.mode === "door" && p.x > W - WALL - p.r - 4 && Math.abs(p.y - H / 2) < 60) this.nextRoom();
    },
    hitFoe(f, dmg) {
      if (f.dead) return; f.hp -= dmg; f.hitT = 0.08; this.api.sfx("hit");
      if (f.hp <= 0) this.killFoe(f);
    },
    bossAI(f, dx, dy, d) {
      const hpk = f.hp / f.max; f.phase = hpk > 0.6 ? 1 : hpk > 0.25 ? 2 : 3; f.cd -= STEP;
      f.vx += (dx / d * f.d.spd * (f.phase === 3 ? 1.4 : 1) - f.vx) * 0.02; f.vy += (dy / d * f.d.spd - f.vy) * 0.02;
      if (f.cd <= 0) {
        const ring = (n, sp, off) => { for (let i = 0; i < n; i++) { const a = off + i * Math.PI * 2 / n; this.ebullets.push({ x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 8, life: 5, boss: true }); } };
        if (f.phase === 1) { ring(14, 170, f.t); f.cd = 1.9; }
        else if (f.phase === 2) { ring(18, 190, f.t * 1.7); if (this.foes.length < 6) for (let i = 0; i < 2; i++) this.spawns.push({ type: "blob", x: f.x + (i ? 70 : -70), y: f.y + 50, t: 0.6 }); f.cd = 1.7; }
        else { ring(10, 230, f.t); const a = Math.atan2(dy, dx); f.vx = Math.cos(a) * 380; f.vy = Math.sin(a) * 380; f.cd = 1.3; this.shake = 0.2; }
        this.api.sfx("cannon");
      }
    },
    update(dt) {
      this.acc += dt; let n = 0;
      while (this.acc >= STEP && n < 5) { this.sim(); this.acc -= STEP; n++; }
      if (n >= 5) this.acc = 0;
      this._pt = (this._pt || 0) + dt; if (this._pt > 0.3) { this._pt = 0; const el = document.getElementById("sh-live"); if (el) el.innerHTML = this.liveHtml(); }
    },
    // ---------------------------------------------------------------- panel
    liveHtml() { const p = this.p; return `<div class="stat"><span>Room</span><b>${this.room === ROOMS ? "BOSS" : this.room + " / " + (ROOMS - 1)}</b></div><div class="stat"><span>Hearts</span><b>${p.hp} / ${p.maxHp}</b></div><div class="stat"><span>Score</span><b>${this.score}</b></div><div class="stat"><span>Damage</span><b>${p.dmg.toFixed(1)} × ${p.shots}</b></div>`; },
    panel() {
      const pn = this.api.panel; if (!pn || this.api.active() !== this) return;
      pn.innerHTML = `<div id="sh-live">${this.liveHtml()}</div>
        <h3>Upgrades</h3><p class="hint">${this.picked.length ? this.picked.join(" · ") : "None yet. Clear a room to choose one."}</p>
        <div class="row"><button data-act="auto" class="${this.autoAim ? "on" : ""}">Auto-aim [T]</button><button data-act="reset">Restart [R]</button></div>
        <h3>Controls</h3><p class="hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move<br>Mouse aim + hold click, or <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> to shoot<br><kbd>Space</kbd> / <kbd>Shift</kbd> dash (invincible!)<br><kbd>T</kbd> auto-aim for easy mode</p>
        <h3>Enemies</h3><p class="hint"><b style="color:#7bea6a">Blob</b> chases · <b style="color:#ff8fd8">Spitter</b> shoots · <b style="color:#ffb347">Dasher</b> flashes then charges · <b style="color:#5fd3c9">Splitter</b> splits in two</p>`;
      pn.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => { this.api.sfx("click"); if (b.dataset.act === "auto") { this.autoAim = !this.autoAim; this.panel(); } else this.reset(); });
    },
    begin() { if (this.mode === "intro") { this.mode = "play"; this.api.sfx("open"); } },
    key(e, down) {
      const k = e.key.toLowerCase(); const map = { arrowup: 1, arrowdown: 1, arrowleft: 1, arrowright: 1, w: 1, a: 1, s: 1, d: 1 };
      if (map[k]) { this.keys[k] = down; if (down) this.begin(); return true; }
      if (!down) return k === " " || k === "shift";
      if (this.mode === "upgrade" && ["1", "2", "3"].includes(k)) { this.pick(+k - 1); return true; }
      if (k === " " || k === "shift") { this.begin(); this.dash(); return true; }
      if (k === "t") { this.autoAim = !this.autoAim; this.panel(); return true; }
      if (k === "r") { this.reset(); return true; }
      if (k === "enter") { this.begin(); return true; }
      return false;
    },
    dash() { const p = this.p; if (this.mode !== "play" && this.mode !== "door") return; if (p.dashReady > 0) return; p.dashT = 0.16; p.dashReady = p.dashCd; this.api.sfx("dash"); },
    mouse(type, x, y, b) {
      if (type === "move" || type === "down") { this.mx = x; this.my = y; }
      if (type === "down" && b === 0) {
        this.mdown = true; this.begin();
        if (this.mode === "upgrade") for (let i = 0; i < this.choices.length; i++) { const cx = 180 + i * 300; if (x > cx - 125 && x < cx + 125 && y > 190 && y < 430) this.pick(i); }
      }
      if (type === "down" && b === 2) this.dash();
      if (type === "up" || type === "leave") this.mdown = false;
    },
    // ---------------------------------------------------------------- draw
    draw(ctx) {
      const p = this.p; ctx.save();
      if (this.shake > 0) ctx.translate((rnd() - 0.5) * 16 * this.shake, (rnd() - 0.5) * 16 * this.shake);
      ctx.fillStyle = `hsl(${this.hue},30%,9%)`; ctx.fillRect(-20, -20, W + 40, H + 40);
      for (let y = WALL; y < H - WALL; y += 48) for (let x = WALL; x < W - WALL; x += 48) { ctx.fillStyle = ((x + y) / 48) % 2 ? `hsl(${this.hue},28%,12%)` : `hsl(${this.hue},26%,10.5%)`; ctx.fillRect(x, y, 48, 48); }
      ctx.fillStyle = `hsl(${this.hue},35%,22%)`; ctx.fillRect(0, 0, W, WALL); ctx.fillRect(0, H - WALL, W, WALL); ctx.fillRect(0, 0, WALL, H); ctx.fillRect(W - WALL, 0, WALL, H);
      ctx.strokeStyle = `hsl(${this.hue},90%,60%)`; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 12; ctx.lineWidth = 2; ctx.strokeRect(WALL, WALL, W - 2 * WALL, H - 2 * WALL); ctx.shadowBlur = 0;
      // door
      if (this.doorOpen) { const g = 0.6 + 0.4 * Math.sin(this.time * 6); ctx.fillStyle = `rgba(125,255,155,${g})`; ctx.shadowColor = "#7dff9b"; ctx.shadowBlur = 24; ctx.fillRect(W - WALL, H / 2 - 50, WALL, 100); ctx.shadowBlur = 0;
        ctx.fillStyle = "#7dff9b"; ctx.font = "bold 22px 'Trebuchet MS', sans-serif"; ctx.textAlign = "right"; ctx.fillText("EXIT →", W - WALL - 12, H / 2 - 60); }
      else { ctx.fillStyle = "#3a1d2a"; ctx.fillRect(W - WALL, H / 2 - 50, WALL, 100); }
      for (const o of this.obstacles) { ctx.fillStyle = `hsl(${this.hue},25%,26%)`; ctx.fillRect(o.x, o.y, o.w, o.h); ctx.fillStyle = `hsl(${this.hue},30%,36%)`; ctx.fillRect(o.x, o.y, o.w, 6); ctx.strokeStyle = `hsl(${this.hue},70%,55%)`; ctx.lineWidth = 1.5; ctx.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1); }
      for (const s of this.spawns) { ctx.strokeStyle = FOES[s.type].color; ctx.globalAlpha = 0.4 + 0.4 * Math.sin(this.time * 20); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x, s.y, FOES[s.type].r * (1 + s.t), 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
      for (const h of this.pickups) this.heart(ctx, h.x, h.y + Math.sin(this.time * 5) * 3, 9, "#ff6b6b");
      for (const f of this.foes) this.drawFoe(ctx, f);
      // player
      if (this.mode !== "dead" && !(p.inv > 0 && Math.floor(this.time * 20) % 2)) {
        for (let i = 0; i < p.orbs; i++) { const a = this.time * 3 + i * Math.PI * 2 / p.orbs; ctx.fillStyle = "#ffe066"; ctx.shadowColor = "#ffe066"; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * 46, p.y + Math.sin(a) * 46, 8, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
        ctx.save(); ctx.translate(p.x, p.y);
        ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(0, 14, 15, 5, 0, 0, 7); ctx.fill();
        ctx.rotate(p.ang); ctx.fillStyle = "#cfd5ff"; ctx.fillRect(4, -4, 20, 8); ctx.fillStyle = "#ff5fb7"; ctx.fillRect(20, -5, 6, 10); ctx.rotate(-p.ang);
        ctx.fillStyle = p.dashT > 0 ? "#4ae0ff" : "#ffffff"; ctx.shadowColor = "#ff5fb7"; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = "#ff5fb7"; ctx.fillRect(-p.r + 2, -5, p.r * 2 - 4, 7); ctx.fillStyle = "#1b0b2a"; ctx.fillRect(-8 + Math.cos(p.ang) * 3, -4, 5, 4); ctx.fillRect(3 + Math.cos(p.ang) * 3, -4, 5, 4);
        ctx.restore();
      }
      for (const b of this.bullets) { ctx.fillStyle = "#fff6c9"; ctx.shadowColor = "#ffd166"; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); }
      for (const b of this.ebullets) { ctx.fillStyle = b.boss ? "#e3b8ff" : "#ffb3e6"; ctx.shadowColor = b.boss ? "#b56cff" : "#ff5fb7"; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); }
      ctx.shadowBlur = 0;
      for (const e of this.parts) { ctx.globalAlpha = Math.min(1, e.t * 2.5); ctx.fillStyle = e.c; ctx.fillRect(e.x - e.s / 2, e.y - e.s / 2, e.s, e.s); } ctx.globalAlpha = 1;
      ctx.textAlign = "center"; ctx.font = "bold 15px 'Trebuchet MS', sans-serif"; for (const e of this.texts) { ctx.globalAlpha = Math.min(1, e.t * 2); ctx.fillStyle = e.c; ctx.fillText(e.s, e.x, e.y); } ctx.globalAlpha = 1;
      ctx.restore();
      if (this.flash > 0) { ctx.fillStyle = `rgba(255,40,80,${this.flash})`; ctx.fillRect(0, 0, W, H); }
      // HUD
      for (let i = 0; i < p.maxHp; i++) this.heart(ctx, 44 + i * 28, 48, 10, i < p.hp ? "#ff4d6d" : "#3a2233");
      ctx.fillStyle = "#fff"; ctx.font = "bold 18px 'Trebuchet MS', sans-serif"; ctx.textAlign = "right"; ctx.fillText("SCORE " + this.score, W - 40, 54);
      for (let i = 1; i <= ROOMS; i++) { const x = W / 2 - (ROOMS * 26) / 2 + (i - 1) * 26; ctx.fillStyle = i < this.room ? "#7dff9b" : i === this.room ? "#ffd166" : "#2c3155"; if (i === ROOMS) { ctx.beginPath(); ctx.arc(x + 9, 46, 9, 0, 7); ctx.fill(); ctx.fillStyle = "#000"; ctx.fillRect(x + 5, 43, 3, 3); ctx.fillRect(x + 11, 43, 3, 3); } else ctx.fillRect(x, 40, 18, 12); }
      const dashK = 1 - p.dashReady / p.dashCd; ctx.fillStyle = "#1b2042"; ctx.fillRect(36, 66, 100, 6); ctx.fillStyle = dashK >= 1 ? "#4ae0ff" : "#2a6c80"; ctx.fillRect(36, 66, 100 * dashK, 6);
      ctx.fillStyle = "#8b92b8"; ctx.font = "11px sans-serif"; ctx.textAlign = "left"; ctx.fillText("DASH", 142, 72);
      if (this.boss) { const b = this.boss; ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(W / 2 - 252, H - 58, 504, 26); ctx.fillStyle = "#3a1650"; ctx.fillRect(W / 2 - 248, H - 54, 496, 18); ctx.fillStyle = "#b56cff"; ctx.fillRect(W / 2 - 248, H - 54, 496 * Math.max(0, b.hp) / b.max, 18);
        ctx.fillStyle = "#fff"; ctx.font = "bold 14px 'Trebuchet MS', sans-serif"; ctx.textAlign = "center"; ctx.fillText("KING GLOOP · PHASE " + (b.phase || 1), W / 2, H - 40); }
      if (this.banner) { ctx.textAlign = "center"; ctx.font = "900 italic 46px 'Trebuchet MS', sans-serif"; ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillText(this.banner.text, W / 2 + 3, 153); ctx.fillStyle = this.mode === "won" ? "#7dff9b" : "#ff5fb7"; ctx.fillText(this.banner.text, W / 2, 150); }
      if (this.mode === "intro") this.overlay(ctx, "NEON BLASTER", "WASD to move · aim with the mouse or arrow keys", "Click or press any move key to start", "#ff5fb7");
      if (this.mode === "dead") this.overlay(ctx, "GAME OVER", `Room ${this.room} · Score ${this.score} · Best ${this.best}`, "Press R to try again", "#ff6b6b");
      if (this.mode === "won") this.overlay(ctx, "YOU WIN!", `Score ${this.score} · ${this.kills} enemies · ${this.picked.length} upgrades`, "Press R for a new run", "#7dff9b");
      if (this.mode === "upgrade") {
        ctx.fillStyle = "rgba(5,5,15,0.78)"; ctx.fillRect(0, 0, W, H); ctx.textAlign = "center"; ctx.fillStyle = "#ffd166"; ctx.font = "900 italic 40px 'Trebuchet MS', sans-serif"; ctx.fillText("ROOM CLEAR! CHOOSE A POWER-UP", W / 2, 140);
        this.choices.forEach((u, i) => {
          const cx = 180 + i * 300, hov = this.mx > cx - 125 && this.mx < cx + 125 && this.my > 190 && this.my < 430;
          ctx.fillStyle = hov ? "#1d2350" : "#141838"; ctx.strokeStyle = u.color; ctx.lineWidth = hov ? 4 : 2; ctx.shadowColor = u.color; ctx.shadowBlur = hov ? 26 : 10;
          ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx - 125, 190, 250, 240, 18) : ctx.rect(cx - 125, 190, 250, 240); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
          ctx.fillStyle = u.color; ctx.beginPath(); ctx.arc(cx, 260, 34, 0, 7); ctx.fill(); ctx.fillStyle = "#0b0d1e"; ctx.font = "900 34px 'Trebuchet MS', sans-serif"; ctx.fillText(String(i + 1), cx, 272);
          ctx.fillStyle = "#fff"; ctx.font = "bold 23px 'Trebuchet MS', sans-serif"; ctx.fillText(u.name, cx, 335); ctx.fillStyle = "#b9c0e8"; ctx.font = "16px 'Trebuchet MS', sans-serif"; ctx.fillText(u.desc, cx, 365);
          ctx.fillStyle = "#8b92b8"; ctx.font = "13px sans-serif"; ctx.fillText("press " + (i + 1) + " or click", cx, 410);
        });
      }
    },
    overlay(ctx, title, sub, hint, color) {
      ctx.fillStyle = "rgba(5,5,15,0.72)"; ctx.fillRect(0, 0, W, H); ctx.textAlign = "center";
      ctx.font = "900 italic 76px 'Trebuchet MS', sans-serif"; ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillText(title, W / 2 + 4, 268); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 30; ctx.fillText(title, W / 2, 264); ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff"; ctx.font = "20px 'Trebuchet MS', sans-serif"; ctx.fillText(sub, W / 2, 316); ctx.fillStyle = "#ffd166"; ctx.font = "bold 18px 'Trebuchet MS', sans-serif"; ctx.fillText(hint, W / 2, 360);
    },
    heart(ctx, x, y, s, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y + s * 0.9); ctx.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.7, y - s * 1.3, x, y - s * 0.45); ctx.bezierCurveTo(x + s * 0.7, y - s * 1.3, x + s * 1.6, y - s * 0.2, x, y + s * 0.9); ctx.fill(); },
    drawFoe(ctx, f) {
      const x = f.x, y = f.y, r = f.r, sq = 1 + Math.sin(f.t * 8) * 0.06;
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(x, y + r * 0.85, r, r * 0.3, 0, 0, 7); ctx.fill();
      let col = f.hitT > 0 ? "#ffffff" : f.d.color; if (f.type === "dasher" && f.state === "wind") col = Math.floor(f.t * 20) % 2 ? "#fff" : "#ff4040";
      ctx.fillStyle = col; ctx.shadowColor = f.d.color; ctx.shadowBlur = f.type === "boss" ? 30 : 10;
      if (f.type === "spitter") { ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + f.t, rr = i % 2 ? r * 0.75 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.fill(); }
      else if (f.type === "dasher") { ctx.beginPath(); const a = Math.atan2(this.p.y - y, this.p.x - x); ctx.moveTo(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3); ctx.lineTo(x + Math.cos(a + 2.4) * r, y + Math.sin(a + 2.4) * r); ctx.lineTo(x + Math.cos(a - 2.4) * r, y + Math.sin(a - 2.4) * r); ctx.fill(); }
      else { ctx.beginPath(); ctx.ellipse(x, y, r * sq, r / sq, 0, 0, 7); ctx.fill(); }
      ctx.shadowBlur = 0;
      if (f.type === "boss") { ctx.fillStyle = "#ffd166"; for (let i = 0; i < 5; i++) { const cx = x - 32 + i * 16; ctx.beginPath(); ctx.moveTo(cx - 7, y - r + 6); ctx.lineTo(cx, y - r - 16); ctx.lineTo(cx + 7, y - r + 6); ctx.fill(); } }
      const ea = Math.atan2(this.p.y - y, this.p.x - x), es = r * 0.28;
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.15, es, 0, 7); ctx.arc(x + r * 0.35, y - r * 0.15, es, 0, 7); ctx.fill();
      ctx.fillStyle = "#14081f"; ctx.beginPath(); ctx.arc(x - r * 0.35 + Math.cos(ea) * es * 0.45, y - r * 0.15 + Math.sin(ea) * es * 0.45, es * 0.5, 0, 7); ctx.arc(x + r * 0.35 + Math.cos(ea) * es * 0.45, y - r * 0.15 + Math.sin(ea) * es * 0.45, es * 0.5, 0, 7); ctx.fill();
      if (f.type !== "boss" && f.hp < f.max) { ctx.fillStyle = "#300"; ctx.fillRect(x - r, y - r - 9, r * 2, 4); ctx.fillStyle = "#ff5d8f"; ctx.fillRect(x - r, y - r - 9, r * 2 * f.hp / f.max, 4); }
    },
    bestLabel() { return "Best score: " + this.best; },
    preview(ctx, w, h, t) {
      ctx.fillStyle = "#151027"; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = "#b56cff"; ctx.lineWidth = 2; ctx.strokeRect(6, 6, w - 12, h - 12);
      const px = 60 + Math.sin(t) * 20, py = 80 + Math.cos(t * 1.3) * 25; const bx = 190, by = 80;
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + t, rr = 30 + ((t * 60) % 70); ctx.fillStyle = "#e3b8ff"; ctx.beginPath(); ctx.arc(bx + Math.cos(a) * rr, by + Math.sin(a) * rr, 3, 0, 7); ctx.fill(); }
      ctx.fillStyle = "#b56cff"; ctx.shadowColor = "#b56cff"; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(bx, by, 24, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(bx - 8, by - 4, 6, 0, 7); ctx.arc(bx + 8, by - 4, 6, 0, 7); ctx.fill();
      for (let i = 0; i < 4; i++) { const k = ((t * 2 + i / 4) % 1); ctx.fillStyle = "#fff6c9"; ctx.beginPath(); ctx.arc(px + (bx - px) * k, py + (by - py) * k, 3, 0, 7); ctx.fill(); }
      ctx.fillStyle = "#fff"; ctx.shadowColor = "#ff5fb7"; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(px, py, 10, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      [[40, 130], [120, 30], [230, 135]].forEach(([x, y], i) => { ctx.fillStyle = ["#7bea6a", "#ff8fd8", "#ffb347"][i]; ctx.beginPath(); ctx.arc(x + Math.sin(t * 2 + i) * 6, y, 9, 0, 7); ctx.fill(); });
    },
    state() { const p = this.p; return { mode: this.mode, room: this.room, rooms: ROOMS, wave: this.wave, waves: this.waves.length, hp: p.hp, maxHp: p.maxHp, foes: this.foes.length, spawns: this.spawns.length, bullets: this.bullets.length, ebullets: this.ebullets.length, score: this.score, kills: this.kills, picked: this.picked.slice(), choices: this.choices.map((c) => c.name), boss: this.boss ? Math.round(this.boss.hp) : null, x: Math.round(p.x), y: Math.round(p.y), shots: p.shots, door: this.doorOpen }; },
    test: {
      reset: (s) => G.reset(s || 4242), begin: () => G.begin(),
      sim: (sec) => { const n = Math.round(sec / STEP); for (let i = 0; i < n; i++) G.sim(); return G.state(); },
      god: (on) => { G.god = on !== false; },
      keys: (obj) => { Object.assign(G.keys, obj); },
      aim: (x, y, down) => { G.mx = x; G.my = y; G.mdown = !!down; },
      auto: (on) => { G.autoAim = !!on; },
      killAll: () => { G.spawns.forEach((s) => G.addFoe(s.type, s.x, s.y)); G.spawns = []; G.foes.slice().forEach((f) => { if (f.type !== "boss") G.killFoe(f); }); G.foes = G.foes.filter((f) => !f.dead && f.type === "boss"); G.wave = G.waves.length; },
      pick: (i) => G.pick(i),
      walkOut: () => { G.p.x = W - WALL - G.p.r - 2; G.p.y = H / 2; G.sim(); return G.state(); },
      toRoom: (n) => { G.room = n - 1; G.nextRoom(); },
      hurtBoss: (frac) => { if (G.boss) G.boss.hp = Math.max(1, G.boss.max * frac); },
      foePos: () => G.foes.map((f) => [Math.round(f.x), Math.round(f.y), f.type, +f.hp.toFixed(1)]),
    },
  };
  root.FGJ_GAMES = root.FGJ_GAMES || []; root.FGJ_GAMES.push(G);
})(window);
