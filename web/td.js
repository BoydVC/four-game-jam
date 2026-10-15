/* Tower Defense: "Castle Crunch". Build on grass, stop 10 waves, survive the Golem. */
(function (root) {
  "use strict";
  const T = 48, COLS = 20, ROWS = 12, STEP = 1 / 60;
  const WAY = [[-1, 2], [3, 2], [3, 9], [8, 9], [8, 3], [13, 3], [13, 9], [17, 9], [17, 5], [20, 5]];
  const ROCKS = [[1, 5], [6, 1], [10, 6], [11, 11], [15, 1], [19, 10], [0, 10], [6, 6], [16, 7]];
  const TOWERS = {
    arrow: { name: "Archer", key: "1", cost: 50, color: "#ffd166", range: 2.6, rate: 0.42, dmg: 6, up: [45, 80], desc: "Fast single shots" },
    cannon: { name: "Cannon", key: "2", cost: 90, color: "#ff7b54", range: 2.7, rate: 1.25, dmg: 20, splash: 0.95, up: [70, 120], desc: "Slow, big splash" },
    frost: { name: "Frost", key: "3", cost: 70, color: "#7fd8ff", range: 2.3, rate: 0.8, dmg: 2, slow: 0.5, splash: 0.7, up: [55, 90], desc: "Slows groups" },
    zap: { name: "Tesla", key: "4", cost: 120, color: "#c792ff", range: 2.5, rate: 1.0, dmg: 11, chain: 3, up: [90, 150], desc: "Chain lightning" },
  };
  const FOES = {
    slime: { name: "Slime", hp: 22, spd: 1.25, gold: 5, r: 13, color: "#7bea6a", lives: 1 },
    bat: { name: "Bat", hp: 15, spd: 2.35, gold: 6, r: 11, color: "#d18cff", lives: 1 },
    beetle: { name: "Beetle", hp: 75, spd: 0.8, gold: 12, r: 16, color: "#4fb3c9", armor: 2, lives: 2 },
    golem: { name: "Golem King", hp: 1100, spd: 0.5, gold: 150, r: 26, color: "#c9a26b", armor: 3, lives: 10, boss: true },
  };
  const WAVES = [
    [["slime", 8, 0.9]],
    [["slime", 10, 0.7], ["bat", 4, 0.6]],
    [["bat", 12, 0.5]],
    [["slime", 10, 0.6], ["beetle", 3, 1.6]],
    [["beetle", 6, 1.2], ["bat", 8, 0.4]],
    [["slime", 18, 0.38], ["beetle", 4, 1.1]],
    [["bat", 16, 0.33], ["beetle", 6, 1.0]],
    [["beetle", 11, 0.85]],
    [["slime", 20, 0.3], ["bat", 12, 0.3], ["beetle", 7, 0.85]],
    [["golem", 1, 0], ["slime", 14, 0.5], ["beetle", 4, 1.2]],
  ];
  // path polyline in px + tile mask
  const PTS = WAY.map(([c, r]) => [c * T + T / 2, r * T + T / 2]);
  const SEG = []; let PATHLEN = 0;
  for (let i = 0; i < PTS.length - 1; i++) { const [x1, y1] = PTS[i], [x2, y2] = PTS[i + 1]; const L = Math.hypot(x2 - x1, y2 - y1); SEG.push({ x1, y1, x2, y2, L, s: PATHLEN }); PATHLEN += L; }
  const PATH = new Set();
  for (let i = 0; i < WAY.length - 1; i++) {
    let [c, r] = WAY[i]; const [c2, r2] = WAY[i + 1];
    while (c !== c2 || r !== r2) { PATH.add(c + "," + r); c += Math.sign(c2 - c); r += Math.sign(r2 - r); }
    PATH.add(c2 + "," + r2);
  }
  function posAt(d) {
    for (const s of SEG) if (d <= s.s + s.L) { const k = (d - s.s) / s.L; return [s.x1 + (s.x2 - s.x1) * k, s.y1 + (s.y2 - s.y1) * k]; }
    const s = SEG[SEG.length - 1]; return [s.x2, s.y2];
  }
  let rngS = 7;
  const rnd = () => { rngS = (rngS * 1103515245 + 12345) & 0x7fffffff; return rngS / 0x7fffffff; };

  const G = {
    id: "td", title: "Castle Crunch", tag: "Tower defense · 10 waves + boss", color: "#ffd166",
    init(api) { this.api = api; this.best = api.load("td.best", 0); this.reset(); },
    reset() {
      rngS = 7;
      Object.assign(this, { gold: 150, lives: 20, wave: 0, mode: "build", towers: [], foes: [], shots: [], fx: [], texts: [], spawnQ: [],
        tool: "arrow", sel: null, hover: null, speed: 1, autoNext: false, acc: 0, time: 0, kills: 0, leaked: 0, bossLeaked: false, banner: null, shake: 0 });
      this.grass = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) this.grass.push(rnd());
      this.api.setStatus("Pick a tower, click grass to build, then press Start Wave (Space).");
      this.panel();
    },
    enter() { this.panel(); },
    leave() {},
    tileFree(c, r) {
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
      if (PATH.has(c + "," + r)) return false;
      if (ROCKS.some(([a, b]) => a === c && b === r)) return false;
      return !this.towers.some((t) => t.c === c && t.r === r);
    },
    towerAt(c, r) { return this.towers.find((t) => t.c === c && t.r === r); },
    place(type, c, r) {
      const d = TOWERS[type]; if (!d || !this.tileFree(c, r) || this.gold < d.cost) { if (d && this.gold < d.cost) this.toast("Need " + d.cost + " gold", c, r); return false; }
      this.gold -= d.cost;
      const t = { type, c, r, x: c * T + T / 2, y: r * T + T / 2, lvl: 1, cd: 0, ang: -Math.PI / 2, spent: d.cost, kills: 0 };
      this.towers.push(t); this.api.sfx("place"); this.puff(t.x, t.y, d.color, 10); this.panel(); return t;
    },
    stats(t) { const d = TOWERS[t.type], k = t.lvl - 1; return { range: (d.range + 0.35 * k) * T, rate: d.rate * Math.pow(0.82, k), dmg: d.dmg * Math.pow(1.7, k), splash: (d.splash || 0) * T * (1 + 0.15 * k), slow: d.slow, chain: (d.chain || 0) + k }; },
    upgrade(t) {
      if (!t || t.lvl >= 3) return false; const cost = TOWERS[t.type].up[t.lvl - 1]; if (this.gold < cost) { this.toast("Need " + cost, t.c, t.r); return false; }
      this.gold -= cost; t.spent += cost; t.lvl++; this.api.sfx("upgrade"); this.puff(t.x, t.y, "#fff", 14); this.panel(); return true;
    },
    sell(t) {
      if (!t) return false; const back = Math.floor(t.spent * 0.7); this.gold += back; this.towers = this.towers.filter((x) => x !== t);
      if (this.sel === t) this.sel = null; this.toast("+" + back, t.c, t.r, "#ffd166"); this.api.sfx("sell"); this.panel(); return true;
    },
    startWave() {
      if (this.mode !== "build" || this.wave >= WAVES.length) return false;
      this.wave++; this.mode = "wave"; this.spawnQ = [];
      let tm = 0.3; for (const [type, n, gap] of WAVES[this.wave - 1]) { for (let i = 0; i < n; i++) { this.spawnQ.push({ type, at: tm }); tm += gap; } tm += 1.2; }
      this.waveT = 0; this.api.sfx(this.wave === WAVES.length ? "boss" : "wave");
      this.banner = { text: this.wave === WAVES.length ? "FINAL WAVE: GOLEM KING!" : "WAVE " + this.wave, t: 2 };
      this.api.setStatus(`Wave ${this.wave}/${WAVES.length} incoming!`); this.panel(); return true;
    },
    spawn(type) {
      const d = FOES[type], hp = Math.round(d.hp * (1 + 0.3 * (this.wave - 1) + 0.02 * (this.wave - 1) * (this.wave - 1)));
      this.foes.push({ type, d, hp, max: hp, dist: -20 - rnd() * 6, slowT: 0, wob: rnd() * 6, x: -40, y: PTS[0][1], hitT: 0 });
    },
    damage(f, dmg, color) {
      if (f.hp <= 0) return; const real = Math.max(1, dmg - (f.d.armor || 0)); f.hp -= real; f.hitT = 0.1;
      if (f.hp <= 0) {
        this.gold += f.d.gold; this.kills++; this.puff(f.x, f.y, f.d.color, f.d.boss ? 60 : 12); this.text("+" + f.d.gold, f.x, f.y - 10, "#ffd166");
        this.api.sfx(f.d.boss ? "boom" : "pop"); if (f.d.boss) this.shake = 0.6;
      }
    },
    sim() {
      this.time += STEP;
      if (this.mode === "wave") {
        this.waveT += STEP;
        while (this.spawnQ.length && this.spawnQ[0].at <= this.waveT) this.spawn(this.spawnQ.shift().type);
      }
      for (const f of this.foes) {
        if (f.hp <= 0) continue;
        const sp = f.d.spd * T * (f.slowT > 0 ? 0.5 : 1); f.slowT -= STEP; f.hitT -= STEP;
        f.dist += sp * STEP; const [x, y] = posAt(Math.max(0, f.dist)); f.x = f.dist < 0 ? f.dist : x; f.y = y;
        if (f.dist >= PATHLEN) { f.hp = 0; f.leak = true; if (f.d.boss) this.bossLeaked = true; this.lives = Math.max(0, this.lives - f.d.lives); this.leaked++; this.shake = 0.3; this.api.sfx("hurt"); this.text("-" + f.d.lives + " ♥", 920, PTS[PTS.length - 1][1] - 20, "#ff6b6b"); }
      }
      for (const t of this.towers) {
        const s = this.stats(t); t.cd -= STEP;
        let best = null;
        for (const f of this.foes) if (f.hp > 0 && f.dist > 0 && Math.hypot(f.x - t.x, f.y - t.y) <= s.range && (!best || f.dist > best.dist)) best = f;
        if (best) t.ang = Math.atan2(best.y - t.y, best.x - t.x);
        if (best && t.cd <= 0) {
          t.cd = s.rate;
          if (t.type === "zap") {
            let cur = best; const hit = [best]; const pts = [[t.x, t.y - 14]];
            for (let i = 0; i < s.chain && cur; i++) {
              pts.push([cur.x, cur.y]); this.damage(cur, s.dmg * (1 - i * 0.15)); hit.push(cur);
              let nx = null; for (const f of this.foes) if (f.hp > 0 && !hit.includes(f) && Math.hypot(f.x - cur.x, f.y - cur.y) < 2 * T && (!nx || f.dist > nx.dist)) nx = f; cur = nx;
            }
            this.fx.push({ kind: "bolt", pts, t: 0.14 }); this.api.sfx("zap");
          } else {
            const spd = t.type === "cannon" ? 0 : t.type === "frost" ? 7 * T : 11 * T;
            this.shots.push({ type: t.type, x: t.x + Math.cos(t.ang) * 18, y: t.y + Math.sin(t.ang) * 18, tgt: best, spd, s, tx: best.x, ty: best.y, sx: t.x, sy: t.y, t: 0, T: 0.55 });
            this.api.sfx(t.type === "cannon" ? "cannon" : "shoot");
          }
        }
      }
      for (const p of this.shots) {
        if (p.type === "cannon") {
          p.t += STEP; const k = Math.min(1, p.t / p.T); p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k - Math.sin(k * Math.PI) * 50;
          if (k >= 1) { p.done = true; this.boom(p.tx, p.ty, p.s, "#ff7b54"); }
        } else {
          if (p.tgt.hp > 0) { p.tx = p.tgt.x; p.ty = p.tgt.y; }
          const dx = p.tx - p.x, dy = p.ty - p.y, L = Math.hypot(dx, dy);
          if (L < p.spd * STEP + 4) { p.done = true; if (p.type === "frost") this.boom(p.tx, p.ty, p.s, "#7fd8ff"); else if (p.tgt.hp > 0) { this.damage(p.tgt, p.s.dmg); this.api.sfx("hit"); } }
          else { p.x += dx / L * p.spd * STEP; p.y += dy / L * p.spd * STEP; p.ang = Math.atan2(dy, dx); }
        }
      }
      this.shots = this.shots.filter((p) => !p.done);
      this.foes = this.foes.filter((f) => f.hp > 0);
      for (const e of this.fx) { e.t -= STEP; if (e.kind === "puff") { e.x += e.vx * STEP; e.y += e.vy * STEP; e.vy += 200 * STEP; } }
      this.fx = this.fx.filter((e) => e.t > 0);
      for (const e of this.texts) { e.t -= STEP; e.y -= 30 * STEP; }
      this.texts = this.texts.filter((e) => e.t > 0);
      if (this.banner) { this.banner.t -= STEP; if (this.banner.t <= 0) this.banner = null; }
      this.shake = Math.max(0, this.shake - STEP);
      if (this.lives <= 0 && this.mode !== "lost") { this.mode = "lost"; this.api.sfx("lose"); this.api.setStatus("The castle fell on wave " + this.wave + ". Press R to try again."); this.saveBest(); this.panel(); }
      if (this.mode === "wave" && !this.spawnQ.length && !this.foes.length) {
        const bonus = 15 + this.wave * 4; this.gold += bonus; this.saveBest();
        if (this.wave >= WAVES.length) { this.mode = "won"; this.api.sfx("win"); this.api.setStatus(this.bossLeaked ? `VICTORY... barely! The Golem King smashed the gate, but you held with ${this.lives} lives.` : `VICTORY! The Golem King is dust. ${this.lives} lives left.`); this.banner = { text: "VICTORY!", t: 999 }; }
        else { this.mode = "build"; this.api.sfx("coin"); this.text("Wave clear +" + bonus, 480, 300, "#ffd166", 2); this.api.setStatus(`Wave ${this.wave} cleared! +${bonus} gold. Build up, then Start Wave.`); if (this.autoNext) this.startWave(); }
        this.panel();
      }
    },
    boom(x, y, s, color) {
      for (const f of this.foes) if (f.hp > 0 && Math.hypot(f.x - x, f.y - y) <= s.splash + f.d.r * 0.5) { this.damage(f, s.dmg); if (s.slow) f.slowT = 1.6; }
      this.fx.push({ kind: "ring", x, y, r: s.splash, t: 0.3, color });
    },
    saveBest() { const score = this.mode === "won" ? 11 : this.wave - (this.mode === "lost" ? 1 : 0); if (score > this.best) { this.best = score; this.api.save("td.best", score); } },
    bestLabel() { return this.best >= 11 ? "Best: <b style='color:#ffd166'>Castle saved!</b>" : "Best: wave " + this.best; },
    puff(x, y, color, n) { for (let i = 0; i < n; i++) { const a = rnd() * 6.28, v = 40 + rnd() * 120; this.fx.push({ kind: "puff", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, t: 0.5 + rnd() * 0.3, color }); } },
    text(s, x, y, color, t) { this.texts.push({ s, x, y, color, t: t || 0.9 }); },
    toast(s, c, r, color) { this.text(s, c * T + T / 2, r * T + 10, color || "#ff8a8a"); },
    update(dt) {
      if (this.mode === "won" || this.mode === "lost") { this.acc = 0; this.sim2(dt); return; }
      this.acc += dt * this.speed; let n = 0;
      while (this.acc >= STEP && n < 12) { this.sim(); this.acc -= STEP; n++; }
      if (n >= 12) this.acc = 0;
      this._pt = (this._pt || 0) + dt; if (this._pt > 0.25) { this._pt = 0; this.livePanel(); }
    },
    sim2(dt) { for (const e of this.fx) e.t -= dt; this.fx = this.fx.filter((e) => e.t > 0); },
    // ------------------------------------------------------------- panel
    panel() {
      const p = this.api.panel; if (!p || this.api.active() !== this) return;
      const t = this.sel;
      p.innerHTML = `
        <div class="stat"><span>Gold</span><b id="td-gold">${this.gold}</b></div>
        <div class="stat"><span>Lives</span><b id="td-lives">${this.lives}</b></div>
        <div class="stat"><span>Wave</span><b>${this.wave} / ${WAVES.length}</b></div>
        <h3>Build</h3>
        <div class="tools">${Object.entries(TOWERS).map(([k, d]) => `<button class="tool ${this.tool === k && !t ? "on" : ""}" data-tool="${k}"><b><span class="sw" style="background:${d.color}"></span>${d.name} <small>[${d.key}]</small></b><small>${d.cost}g · ${d.desc}</small></button>`).join("")}</div>
        ${t ? `<h3>Selected: ${TOWERS[t.type].name} Lv${t.lvl}</h3>
          <div class="stat"><span>Damage</span><b>${this.stats(t).dmg.toFixed(0)}</b></div><div class="stat"><span>Range</span><b>${(this.stats(t).range / T).toFixed(1)}</b></div>
          <div class="row"><button data-act="up" ${t.lvl >= 3 ? "disabled" : ""}>${t.lvl >= 3 ? "Max level" : "Upgrade " + TOWERS[t.type].up[t.lvl - 1] + "g [U]"}</button><button data-act="sell">Sell ${Math.floor(t.spent * 0.7)}g [X]</button></div>` : ""}
        <h3>Battle</h3>
        <div class="row"><button data-act="wave" ${this.mode !== "build" ? "disabled" : ""}>${this.mode === "wave" ? "Wave in progress" : this.mode === "won" ? "Victory!" : this.mode === "lost" ? "Game over" : "Start Wave " + (this.wave + 1) + " [Space]"}</button></div>
        <div class="row"><button data-act="speed">Speed ${this.speed}x [F]</button><button data-act="auto" class="${this.autoNext ? "on" : ""}">Auto-wave</button></div>
        <div class="row"><button data-act="reset">New game [R]</button></div>
        <p class="hint">Enemies follow the dirt road to your castle. Beetles and the Golem have armor: Cannons and Tesla chew through it. Frost slows whole groups.</p>`;
      p.querySelectorAll("[data-tool]").forEach((b) => b.onclick = () => { this.tool = b.dataset.tool; this.sel = null; this.api.sfx("click"); this.panel(); });
      p.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => this.act(b.dataset.act));
    },
    livePanel() { const g = document.getElementById("td-gold"), l = document.getElementById("td-lives"); if (g) g.textContent = this.gold; if (l) l.textContent = this.lives; },
    act(a) {
      this.api.sfx("click");
      if (a === "wave") this.startWave();
      if (a === "speed") { this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1; this.panel(); }
      if (a === "auto") { this.autoNext = !this.autoNext; if (this.autoNext && this.mode === "build" && this.wave > 0) this.startWave(); this.panel(); }
      if (a === "reset") this.reset();
      if (a === "up") this.upgrade(this.sel);
      if (a === "sell") this.sell(this.sel);
    },
    key(e, down) {
      if (!down) return false; const k = e.key.toLowerCase();
      const byKey = Object.entries(TOWERS).find(([, d]) => d.key === k); if (byKey) { this.tool = byKey[0]; this.sel = null; this.panel(); return true; }
      if (k === " ") { this.startWave(); return true; }
      if (k === "f") { this.act("speed"); return true; }
      if (k === "u") { this.upgrade(this.sel); return true; }
      if (k === "x" || k === "delete") { this.sell(this.sel); return true; }
      if (k === "r") { this.reset(); return true; }
      return false;
    },
    mouse(type, x, y, b) {
      const c = Math.floor(x / T), r = Math.floor(y / T);
      if (type === "move") this.hover = y < ROWS * T && x >= 0 ? [c, r] : null;
      if (type === "leave") this.hover = null;
      if (type !== "down") return;
      if (b === 2) { this.sel = null; this.panel(); return; }
      const t = this.towerAt(c, r);
      if (t) { this.sel = this.sel === t ? null : t; this.api.sfx("click"); this.panel(); return; }
      if (this.sel) { this.sel = null; this.panel(); return; }
      if (r < ROWS) this.place(this.tool, c, r);
    },
    // ------------------------------------------------------------- draw
    draw(ctx) {
      ctx.save();
      if (this.shake > 0) ctx.translate((Math.random() - 0.5) * 10 * this.shake, (Math.random() - 0.5) * 10 * this.shake);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const g = this.grass[r * COLS + c];
        ctx.fillStyle = (r + c) % 2 ? `hsl(${102 + g * 10},45%,${30 + g * 4}%)` : `hsl(${100 + g * 10},48%,${33 + g * 4}%)`;
        ctx.fillRect(c * T, r * T, T, T);
        if (g > 0.82) { ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(c * T + 10 + g * 20, r * T + 14, 3, 3); ctx.fillStyle = "#ffd6f0"; ctx.fillRect(c * T + 30 - g * 9, r * T + 32, 3, 3); }
      }
      // road
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = "#6b4a2b"; ctx.lineWidth = T * 0.98; this.poly(ctx);
      ctx.strokeStyle = "#c9995f"; ctx.lineWidth = T * 0.8; this.poly(ctx);
      ctx.strokeStyle = "rgba(255,240,200,0.18)"; ctx.lineWidth = 2; ctx.setLineDash([8, 14]); this.poly(ctx); ctx.setLineDash([]);
      // rocks
      for (const [c, r] of ROCKS) { const x = c * T + T / 2, y = r * T + T / 2; ctx.fillStyle = "#3f5a38"; ctx.beginPath(); ctx.ellipse(x, y + 12, 18, 6, 0, 0, 7); ctx.fill();
        if ((c + r) % 2) { ctx.fillStyle = "#2f6b33"; ctx.beginPath(); ctx.arc(x, y - 4, 16, 0, 7); ctx.fill(); ctx.fillStyle = "#3f8a41"; ctx.beginPath(); ctx.arc(x - 4, y - 8, 9, 0, 7); ctx.fill(); ctx.fillStyle = "#5b3b1f"; ctx.fillRect(x - 3, y + 8, 6, 8); }
        else { ctx.fillStyle = "#8a8f99"; ctx.beginPath(); ctx.moveTo(x - 16, y + 10); ctx.lineTo(x - 10, y - 8); ctx.lineTo(x + 6, y - 12); ctx.lineTo(x + 16, y + 10); ctx.fill(); ctx.fillStyle = "#b5bac4"; ctx.fillRect(x - 6, y - 6, 8, 4); } }
      // cave + castle
      ctx.fillStyle = "#2a2233"; ctx.beginPath(); ctx.arc(8, PTS[0][1], 30, -Math.PI / 2, Math.PI / 2); ctx.fill();
      this.castle(ctx, 936, PTS[PTS.length - 1][1]);
      // hover ghost
      if (this.hover && !this.sel && this.mode !== "won" && this.mode !== "lost") {
        const [c, r] = this.hover, ok = this.tileFree(c, r) && this.gold >= TOWERS[this.tool].cost, d = TOWERS[this.tool];
        if (!this.towerAt(c, r)) {
          ctx.fillStyle = ok ? "rgba(255,255,255,0.18)" : "rgba(255,60,60,0.25)"; ctx.fillRect(c * T, r * T, T, T);
          ctx.strokeStyle = ok ? "rgba(255,255,255,0.5)" : "rgba(255,80,80,0.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c * T + T / 2, r * T + T / 2, d.range * T, 0, 7); ctx.stroke();
          ctx.globalAlpha = 0.55; this.drawTower(ctx, { type: this.tool, x: c * T + T / 2, y: r * T + T / 2, lvl: 1, ang: -Math.PI / 2 }); ctx.globalAlpha = 1;
        }
      }
      if (this.sel) { const s = this.stats(this.sel); ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.strokeStyle = "rgba(255,230,140,0.8)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.sel.x, this.sel.y, s.range, 0, 7); ctx.fill(); ctx.stroke(); }
      for (const t of this.towers) this.drawTower(ctx, t);
      for (const f of [...this.foes].sort((a, b) => a.y - b.y)) this.drawFoe(ctx, f);
      for (const p of this.shots) {
        if (p.type === "cannon") { ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 7); ctx.fill(); }
        else if (p.type === "frost") { ctx.fillStyle = "#d7f6ff"; ctx.shadowColor = "#7fd8ff"; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
        else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang || 0); ctx.fillStyle = "#fff3c4"; ctx.fillRect(-7, -1.5, 14, 3); ctx.fillStyle = "#ff8a3d"; ctx.fillRect(5, -2.5, 4, 5); ctx.restore(); }
      }
      for (const e of this.fx) {
        if (e.kind === "puff") { ctx.globalAlpha = Math.min(1, e.t * 2); ctx.fillStyle = e.color; ctx.fillRect(e.x - 2.5, e.y - 2.5, 5, 5); }
        else if (e.kind === "ring") { ctx.globalAlpha = e.t / 0.3; ctx.strokeStyle = e.color; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1.2 - e.t), 0, 7); ctx.stroke(); }
        else if (e.kind === "bolt") { ctx.globalAlpha = e.t / 0.14; ctx.strokeStyle = "#e6ccff"; ctx.shadowColor = "#c792ff"; ctx.shadowBlur = 12; ctx.lineWidth = 3; ctx.beginPath();
          e.pts.forEach(([x, y], i) => { if (!i) ctx.moveTo(x, y); else { const [px, py] = e.pts[i - 1]; ctx.lineTo((px + x) / 2 + (Math.random() - 0.5) * 16, (py + y) / 2 + (Math.random() - 0.5) * 16); ctx.lineTo(x, y); } }); ctx.stroke(); ctx.shadowBlur = 0; }
        ctx.globalAlpha = 1;
      }
      ctx.textAlign = "center"; ctx.font = "bold 16px 'Trebuchet MS', sans-serif";
      for (const e of this.texts) { ctx.globalAlpha = Math.min(1, e.t * 2); ctx.fillStyle = "#000"; ctx.fillText(e.s, e.x + 1, e.y + 1); ctx.fillStyle = e.color; ctx.fillText(e.s, e.x, e.y); }
      ctx.globalAlpha = 1; ctx.restore();
      // bottom bar
      ctx.fillStyle = "#101426"; ctx.fillRect(0, 576, 960, 24);
      ctx.fillStyle = "#ffd166"; ctx.font = "bold 15px 'Trebuchet MS', sans-serif"; ctx.textAlign = "left";
      ctx.fillText(`Gold ${this.gold}`, 10, 593); ctx.fillStyle = "#ff8a8a"; ctx.fillText(`Lives ${this.lives}`, 110, 593);
      ctx.fillStyle = "#cfd5ff"; ctx.fillText(`Wave ${this.wave}/${WAVES.length}   Kills ${this.kills}   Speed ${this.speed}x`, 210, 593);
      for (let i = 0; i < WAVES.length; i++) { ctx.fillStyle = i < this.wave - (this.mode === "wave" ? 1 : 0) ? "#7bea6a" : i === this.wave - 1 && this.mode === "wave" ? "#ffd166" : "#333a5e"; ctx.fillRect(700 + i * 25, 582, 20, 12); }
      if (this.banner) {
        ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(0, 230, 960, 90); ctx.textAlign = "center"; ctx.font = "900 italic 54px 'Trebuchet MS', sans-serif";
        ctx.fillStyle = "#3b2100"; ctx.fillText(this.banner.text, 483, 297); ctx.fillStyle = this.mode === "won" ? "#7bea6a" : "#ffd166"; ctx.fillText(this.banner.text, 480, 293);
        if (this.mode === "won") { ctx.font = "18px 'Trebuchet MS', sans-serif"; ctx.fillStyle = "#fff"; ctx.fillText(`Lives left ${this.lives} · Kills ${this.kills} · press R to play again`, 480, 318); }
      }
      if (this.mode === "lost") { ctx.fillStyle = "rgba(40,0,0,0.6)"; ctx.fillRect(0, 0, 960, 576); ctx.textAlign = "center"; ctx.fillStyle = "#ff8a8a"; ctx.font = "900 italic 60px 'Trebuchet MS', sans-serif"; ctx.fillText("CASTLE FALLEN", 480, 280); ctx.font = "20px 'Trebuchet MS', sans-serif"; ctx.fillStyle = "#fff"; ctx.fillText("You reached wave " + this.wave + ". Press R for a new game.", 480, 320); }
      if (this.mode === "build" && this.wave === 0 && !this.towers.length) {
        ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(250, 470, 460, 64); ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "bold 18px 'Trebuchet MS', sans-serif";
        ctx.fillText("Click the grass to build an Archer (50 gold)", 480, 496); ctx.font = "15px 'Trebuchet MS', sans-serif"; ctx.fillStyle = "#ffd166"; ctx.fillText("then press SPACE to send the first wave", 480, 520);
      }
    },
    poly(ctx) { ctx.beginPath(); PTS.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); },
    castle(ctx, x, y) {
      ctx.fillStyle = "#6c7184"; ctx.fillRect(x - 22, y - 34, 44, 60); ctx.fillStyle = "#8a90a6";
      for (let i = 0; i < 4; i++) ctx.fillRect(x - 22 + i * 12, y - 42, 8, 10);
      ctx.fillStyle = "#3b2a1a"; ctx.beginPath(); ctx.arc(x, y + 10, 10, Math.PI, 0); ctx.fillRect(x - 10, y + 10, 20, 16); ctx.fill();
      ctx.fillStyle = "#ff5f7a"; ctx.beginPath(); ctx.moveTo(x, y - 60); ctx.lineTo(x + 18, y - 54); ctx.lineTo(x, y - 48); ctx.fill(); ctx.fillStyle = "#ddd"; ctx.fillRect(x - 1, y - 62, 2, 22);
    },
    drawTower(ctx, t) {
      const d = TOWERS[t.type], x = t.x, y = t.y;
      ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(x, y + 14, 18, 7, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#5d6274"; ctx.fillRect(x - 17, y - 6, 34, 22); ctx.fillStyle = "#7d8396"; ctx.fillRect(x - 17, y - 10, 34, 6);
      ctx.save(); ctx.translate(x, y - 6); ctx.rotate(t.ang + Math.PI / 2);
      ctx.fillStyle = d.color;
      if (t.type === "arrow") { ctx.fillRect(-3, -20, 6, 18); ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill(); ctx.strokeStyle = "#5b3b1f"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -8, 12, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
      else if (t.type === "cannon") { ctx.fillStyle = "#2b2b33"; ctx.fillRect(-6, -22, 12, 22); ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill(); }
      else if (t.type === "frost") { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.lineTo(Math.cos(a) * 13, Math.sin(a) * 13); } ctx.fill(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill(); }
      else { ctx.rotate(-(t.ang + Math.PI / 2)); ctx.fillStyle = "#4b3a6b"; ctx.fillRect(-4, -18, 8, 18); ctx.fillStyle = d.color; ctx.shadowColor = d.color; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(0, -18, 8 + Math.sin(this.time * 8) * 1.5, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
      ctx.restore();
      for (let i = 0; i < t.lvl; i++) { ctx.fillStyle = "#ffe066"; ctx.beginPath(); ctx.arc(x - 8 + i * 8, y + 11, 3, 0, 7); ctx.fill(); }
    },
    drawFoe(ctx, f) {
      const d = f.d, x = f.x, y = f.y, bob = Math.sin(this.time * 9 + f.wob) * 2, r = d.r;
      if (x < -30) return;
      ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(x, y + r * 0.8, r, r * 0.35, 0, 0, 7); ctx.fill();
      ctx.fillStyle = f.hitT > 0 ? "#fff" : f.slowT > 0 ? "#bdefff" : d.color;
      if (f.type === "slime") { ctx.beginPath(); ctx.ellipse(x, y + 2 - bob * 0.5, r, r * 0.8 + bob * 0.4, 0, Math.PI, 0); ctx.lineTo(x + r, y + r * 0.6); ctx.lineTo(x - r, y + r * 0.6); ctx.fill(); }
      else if (f.type === "bat") { const w = Math.sin(this.time * 20 + f.wob) * 8; ctx.beginPath(); ctx.moveTo(x - r - 8, y - 4 + w + bob); ctx.lineTo(x, y + bob); ctx.lineTo(x + r + 8, y - 4 + w + bob); ctx.lineTo(x, y + 6 + bob); ctx.fill(); ctx.beginPath(); ctx.arc(x, y + bob, r * 0.6, 0, 7); ctx.fill(); }
      else if (f.type === "beetle") { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, 7); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - r * 0.8); ctx.lineTo(x, y + r * 0.8); ctx.stroke(); }
      else { ctx.fillRect(x - r, y - r - bob, r * 2, r * 1.8); ctx.fillStyle = "#8a6a3f"; ctx.fillRect(x - r - 8, y - r * 0.5 - bob, 10, r); ctx.fillRect(x + r - 2, y - r * 0.5 - bob, 10, r);
        ctx.fillStyle = "#ffd166"; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x - 14 + i * 14 - 6, y - r - bob); ctx.lineTo(x - 14 + i * 14, y - r - 14 - bob); ctx.lineTo(x - 14 + i * 14 + 6, y - r - bob); ctx.fill(); } }
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.2 + (f.type === "golem" ? -bob : bob * 0.3), r * 0.2, 0, 7); ctx.arc(x + r * 0.3, y - r * 0.2 + (f.type === "golem" ? -bob : bob * 0.3), r * 0.2, 0, 7); ctx.fill();
      ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.18, r * 0.09, 0, 7); ctx.arc(x + r * 0.35, y - r * 0.18, r * 0.09, 0, 7); ctx.fill();
      const w = d.boss ? 60 : 26; ctx.fillStyle = "#300"; ctx.fillRect(x - w / 2, y - r - (d.boss ? 26 : 10), w, 4); ctx.fillStyle = f.hp / f.max > 0.4 ? "#6dff6d" : "#ff5d5d"; ctx.fillRect(x - w / 2, y - r - (d.boss ? 26 : 10), w * f.hp / f.max, 4);
    },
    preview(ctx, w, h, t) {
      ctx.fillStyle = "#3d7a33"; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#c9995f"; ctx.lineWidth = 22; ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(-10, 40); ctx.lineTo(80, 40); ctx.lineTo(80, 120); ctx.lineTo(180, 120); ctx.lineTo(180, 60); ctx.lineTo(270, 60); ctx.stroke();
      const tw = [[40, 80, "#ffd166"], [130, 85, "#ff7b54"], [140, 30, "#7fd8ff"], [215, 100, "#c792ff"]];
      for (const [x, y, c] of tw) { ctx.fillStyle = "#5d6274"; ctx.fillRect(x - 10, y - 6, 20, 14); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y - 6, 7, 0, 7); ctx.fill(); }
      const L = 90 + 80 + 100 + 60 + 90; for (let i = 0; i < 6; i++) { let d = ((t * 40 + i * 50) % L); let x, y; if (d < 90) { x = d; y = 40; } else if (d < 170) { x = 80; y = 40 + d - 90; } else if (d < 270) { x = 80 + d - 170; y = 120; } else if (d < 330) { x = 180; y = 120 - (d - 270); } else { x = 180 + d - 330; y = 60; }
        ctx.fillStyle = i % 3 ? "#7bea6a" : "#d18cff"; ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); }
      ctx.fillStyle = "#6c7184"; ctx.fillRect(236, 38, 20, 30); ctx.fillStyle = "#ff5f7a"; ctx.fillRect(246, 24, 10, 6);
      if (Math.floor(t * 3) % 2) { ctx.strokeStyle = "#e6ccff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(215, 88); ctx.lineTo(195, 70); ctx.lineTo(180, 75); ctx.stroke(); }
    },
    state() { return { mode: this.mode, wave: this.wave, waves: WAVES.length, gold: this.gold, lives: this.lives, towers: this.towers.length, foes: this.foes.length, kills: this.kills, shots: this.shots.length, sel: !!this.sel, tool: this.tool }; },
    test: {
      reset: () => G.reset(),
      place: (type, c, r) => !!G.place(type, c, r),
      free: (c, r) => G.tileFree(c, r),
      upgrade: (c, r) => G.upgrade(G.towerAt(c, r)),
      sell: (c, r) => G.sell(G.towerAt(c, r)),
      wave: () => G.startWave(),
      sim: (sec) => { const n = Math.round(sec / STEP); for (let i = 0; i < n; i++) { G.sim(); if (G.mode === "won" || G.mode === "lost") break; } return G.state(); },
      gold: (g) => { G.gold = g; },
      fortress() { // a strong demo build, used by smoke test + screenshots
        const spots = [["zap", 4, 4], ["cannon", 7, 8], ["zap", 9, 7], ["frost", 4, 7], ["cannon", 12, 4], ["arrow", 2, 3], ["arrow", 9, 4], ["zap", 12, 8], ["cannon", 14, 4], ["frost", 14, 8], ["arrow", 16, 8], ["zap", 16, 6], ["cannon", 7, 4], ["arrow", 5, 9], ["cannon", 10, 9], ["zap", 18, 6]];
        for (const [ty, c, r] of spots) { const t = G.place(ty, c, r); if (t) { G.upgrade(t); G.upgrade(t); } }
        return G.towers.length;
      },
    },
  };
  root.FGJ_GAMES = root.FGJ_GAMES || []; root.FGJ_GAMES.push(G);
})(window);
