/* Mini Factory: "Robo Works". Factorio-lite: miners, belts, furnaces, assemblers -> build robots. */
(function (root) {
  "use strict";
  const S = 40, COLS = 24, ROWS = 15, STEP = 1 / 60;
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1], ARROW = ["→", "↓", "←", "↑"];
  const ITEMS = {
    iron_ore: { name: "Iron ore", color: "#9fb0c6" }, copper_ore: { name: "Copper ore", color: "#e08a4f" },
    iron_plate: { name: "Iron plate", color: "#d4dce8" }, copper_plate: { name: "Copper plate", color: "#ffa45c" },
    gear: { name: "Gear", color: "#c3cad6" }, wire: { name: "Copper wire", color: "#ff9a3d" },
    circuit: { name: "Circuit", color: "#44d17a" }, robot: { name: "Robot", color: "#ffd166" },
  };
  const RECIPES = {
    gear: { name: "Gear", ins: { iron_plate: 2 }, out: "gear", n: 1, time: 1.0, color: "#8f9bb3" },
    wire: { name: "Wire", ins: { copper_plate: 1 }, out: "wire", n: 2, time: 0.7, color: "#d9773a" },
    circuit: { name: "Circuit", ins: { iron_plate: 1, wire: 3 }, out: "circuit", n: 1, time: 1.4, color: "#2fa35f" },
    robot: { name: "Robot", ins: { gear: 2, circuit: 2 }, out: "robot", n: 1, time: 2.5, color: "#d4a72c" },
  };
  const TOOLS = [
    { id: "belt", name: "Belt", key: "1", desc: "Moves items", color: "#596273" },
    { id: "miner", name: "Miner", key: "2", desc: "Put on ore", color: "#c9a227" },
    { id: "furnace", name: "Furnace", key: "3", desc: "Ore → plate", color: "#c4552d" },
    { id: "asm:gear", name: "Gear Maker", key: "4", desc: "2 iron plate", color: RECIPES.gear.color },
    { id: "asm:wire", name: "Wire Maker", key: "5", desc: "1 copper plate", color: RECIPES.wire.color },
    { id: "asm:circuit", name: "Circuit Maker", key: "6", desc: "1 iron + 3 wire", color: RECIPES.circuit.color },
    { id: "asm:robot", name: "Robot Maker", key: "7", desc: "2 gear + 2 circuit", color: RECIPES.robot.color },
    { id: "erase", name: "Eraser", key: "X", desc: "Or right-click", color: "#7a2f3f" },
  ];
  const GOALS = [
    { stat: "mined", item: null, n: 10, text: "Mine 10 ore", hint: "Put a Miner on the gray or orange ore, then a Belt toward the Core." },
    { stat: "made", item: "iron_plate", n: 10, text: "Smelt 10 iron plates", hint: "Miner → Furnace → Belt into the Core. Machines push out the way they face." },
    { stat: "made", item: "gear", n: 8, text: "Make 8 gears", hint: "A Gear Maker turns 2 iron plates into a gear." },
    { stat: "made", item: "circuit", n: 4, text: "Make 4 circuits", hint: "Copper plates → Wire Maker → Circuit Maker (also needs iron plates)." },
    { stat: "delivered", item: "robot", n: 3, text: "Deliver 3 robots to the Core", hint: "Robot Maker needs 2 gears + 2 circuits. Feed its output into the Core!" },
  ];
  const ORE = {};
  const addOre = (c0, r0, c1, r1, t) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) ORE[c + "," + r] = t; };
  addOre(1, 1, 4, 4, "iron_ore"); addOre(1, 10, 4, 13, "copper_ore"); addOre(10, 12, 13, 13, "iron_ore"); addOre(11, 0, 13, 0, "copper_ore");
  const CORE = { c: 20, r: 6 };

  const G = {
    id: "factory", title: "Robo Works", tag: "Factory builder · ore → robots", color: "#7fd8ff",
    init(api) { this.api = api; this.best = api.load("factory.best", 0); this.reset(); },
    reset() {
      this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
      this.core = { type: "core", c: CORE.c, r: CORE.r, got: {} };
      for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) this.grid[CORE.r + r][CORE.c + c] = this.core;
      Object.assign(this, { tool: "belt", dir: 0, hover: null, drag: null, speed: 1, acc: 0, time: 0, goal: 0, won: false, fx: [], texts: [], banner: null,
        stats: { mined: 0, made: {}, delivered: {} } });
      this.api.setStatus("Goal 1: " + GOALS[0].text + ". R rotates, drag to lay belts, right-click erases.");
      this.panel();
    },
    enter() { this.panel(); },
    leave() { this.drag = null; },
    at(c, r) { return c >= 0 && r >= 0 && c < COLS && r < ROWS ? this.grid[r][c] : undefined; },
    canPlace(tool, c, r) {
      const cur = this.at(c, r); if (cur === undefined || (cur && cur.type === "core")) return false;
      if (tool === "erase") return !!cur;
      if (tool === "miner" && !ORE[c + "," + r]) return false;
      return true;
    },
    place(tool, c, r, dir) {
      if (dir === undefined) dir = this.dir;
      if (!this.canPlace(tool, c, r)) return false;
      const cur = this.grid[r][c];
      if (tool === "erase") { this.grid[r][c] = null; this.api.sfx("sell"); this.puff(c, r, "#888"); return true; }
      const type = tool.startsWith("asm:") ? "asm" : tool, recipe = type === "asm" ? tool.slice(4) : null;
      if (cur && cur.type === type && cur.recipe === recipe) { if (cur.dir === dir) return false; cur.dir = dir; return true; }
      const b = { type, recipe, c, r, dir, t: 0, buf: {}, out: [], item: null, p: 0, work: 0 };
      this.grid[r][c] = b; this.api.sfx(type === "belt" ? "click" : "place"); if (type !== "belt") this.puff(c, r, "#fff");
      return b;
    },
    accept(b, item, fromC, fromR) {
      if (!b) return false;
      if (b.type === "core") { b.got[item] = (b.got[item] || 0) + 1; this.stats.delivered[item] = (this.stats.delivered[item] || 0) + 1; this.coreFlash = 0.25;
        if (item === "robot") { this.api.sfx("goal"); this.text("+1 ROBOT!", (CORE.c + 1) * S, CORE.r * S - 6, "#ffd166"); } return true; }
      if (b.type === "belt") { if (b.item) return false; if (b.c + DX[b.dir] === fromC && b.r + DY[b.dir] === fromR) return false; b.item = item; b.p = 0; return true; }
      if (b.type === "furnace") { const n = (b.buf.iron_ore || 0) + (b.buf.copper_ore || 0); if (!/_ore$/.test(item) || n >= 4) return false; b.buf[item] = (b.buf[item] || 0) + 1; return true; }
      if (b.type === "asm") { const R = RECIPES[b.recipe], need = R.ins[item]; if (!need || (b.buf[item] || 0) >= need * 2) return false; b.buf[item] = (b.buf[item] || 0) + 1; return true; }
      return false;
    },
    pushFront(b, item) { const tc = b.c + DX[b.dir], tr = b.r + DY[b.dir]; return this.accept(this.at(tc, tr), item, b.c, b.r); },
    sim() {
      this.time += STEP;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const b = this.grid[r][c]; if (!b || b.type === "core" || b._tick === this.time) continue; b._tick = this.time;
        if (b.type === "belt") { if (b.item) { b.p = Math.min(1, b.p + 2.4 * STEP); if (b.p >= 1 && this.pushFront(b, b.item)) b.item = null; } continue; }
        if (b.out.length && this.pushFront(b, b.out[0])) b.out.shift();
        if (b.type === "miner") {
          const ore = ORE[c + "," + r]; if (!ore) continue;
          if (b.out.length < 1) { b.work += STEP; if (b.work >= 1.1) { b.work = 0; b.out.push(ore); this.stats.mined++; } }
        } else if (b.type === "furnace") {
          const ore = (b.buf.iron_ore ? "iron_ore" : b.buf.copper_ore ? "copper_ore" : null);
          if (ore && b.out.length < 2) { b.work += STEP; if (b.work >= 1.0) { b.work = 0; b.buf[ore]--; const pl = ore.replace("_ore", "_plate"); b.out.push(pl); this.made(pl); } } else b.work = 0;
        } else if (b.type === "asm") {
          const R = RECIPES[b.recipe]; const ready = Object.entries(R.ins).every(([k, n]) => (b.buf[k] || 0) >= n);
          if ((ready || b.work > 0) && b.out.length < 4) {
            if (b.work === 0) for (const [k, n] of Object.entries(R.ins)) b.buf[k] -= n;
            b.work += STEP; if (b.work >= R.time) { b.work = 0; for (let i = 0; i < R.n; i++) { b.out.push(R.out); this.made(R.out); } this.api.sfx("craft"); }
          }
        }
      }
      for (const e of this.fx) { e.t -= STEP; e.x += e.vx * STEP; e.y += e.vy * STEP; }
      this.fx = this.fx.filter((e) => e.t > 0);
      for (const e of this.texts) { e.t -= STEP; e.y -= 24 * STEP; } this.texts = this.texts.filter((e) => e.t > 0);
      if (this.coreFlash) this.coreFlash = Math.max(0, this.coreFlash - STEP);
      if (this.banner && this.banner.t < 900) { this.banner.t -= STEP; if (this.banner.t <= 0) this.banner = null; }
      this.checkGoals();
    },
    made(item) { this.stats.made[item] = (this.stats.made[item] || 0) + 1; },
    progress(g) { return g.stat === "mined" ? this.stats.mined : (this.stats[g.stat][g.item] || 0); },
    checkGoals() {
      let changed = false;
      while (!this.won && this.goal < GOALS.length && this.progress(GOALS[this.goal]) >= GOALS[this.goal].n) {
        this.goal++; changed = true;
        if (this.goal >= GOALS.length) {
          this.won = true; this.api.sfx("win"); this.banner = { text: "ROBOT FACTORY ONLINE!", t: 999 };
          this.api.setStatus(`You built robots from raw ore in ${Math.round(this.time)}s of factory time!`);
          if (!this.best || this.time < this.best) { this.best = Math.round(this.time); this.api.save("factory.best", this.best); }
          for (let i = 0; i < 40; i++) this.puff(CORE.c + 1, CORE.r + 1, ["#ffd166", "#7fd8ff", "#ff5fb7", "#7dff9b"][i % 4], 1);
        } else { this.api.sfx("goal"); this.banner = { text: "GOAL COMPLETE!", t: 1.6 }; this.api.setStatus(`Goal ${this.goal + 1}: ${GOALS[this.goal].text}. ${GOALS[this.goal].hint}`); }
      }
      if (changed || (this._gp = (this._gp || 0) + 1) % 15 === 0) this.goalPanel();
    },
    puff(c, r, color, n) { for (let i = 0; i < (n || 8); i++) { const a = Math.random() * 6.28, v = 30 + Math.random() * 90; this.fx.push({ x: c * S + S / 2, y: r * S + S / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0.5 + Math.random() * 0.4, color }); } },
    text(s, x, y, color) { this.texts.push({ s, x, y, color, t: 1.2 }); },
    update(dt) {
      this.acc += dt * this.speed; let n = 0;
      while (this.acc >= STEP && n < 16) { this.sim(); this.acc -= STEP; n++; }
      if (n >= 16) this.acc = 0;
    },
    // ---------------------------------------------------------------- panel
    panel() {
      const p = this.api.panel; if (!p || this.api.active() !== this) return;
      p.innerHTML = `<h3>Build <small style="float:right;letter-spacing:0">facing ${ARROW[this.dir]} [R]</small></h3>
        <div class="tools">${TOOLS.map((t) => `<button class="tool ${this.tool === t.id ? "on" : ""}" data-tool="${t.id}"><b><span class="sw" style="background:${t.color}"></span>${t.name} <small>[${t.key}]</small></b><small>${t.desc}</small></button>`).join("")}</div>
        <div class="row"><button data-act="rot">Rotate ${ARROW[this.dir]}</button><button data-act="speed">Speed ${this.speed}x</button></div>
        <h3>Goals</h3><div id="fac-goals"></div>
        <div class="row"><button data-act="demo">Show demo factory</button><button data-act="reset">Clear</button></div>
        <p class="hint">Machines grab items from any side and push their output in the direction they face. Drag to lay belts in a line.</p>`;
      p.querySelectorAll("[data-tool]").forEach((b) => b.onclick = () => { this.tool = b.dataset.tool; this.api.sfx("click"); this.panel(); });
      p.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => this.act(b.dataset.act));
      this.goalPanel();
    },
    goalPanel() {
      const el = document.getElementById("fac-goals"); if (!el) return;
      el.innerHTML = GOALS.map((g, i) => { const v = Math.min(g.n, this.progress(g)); const cls = i < this.goal ? "done" : i === this.goal ? "cur" : "";
        return `<div class="goal ${cls}"><b>${i < this.goal ? "✓ " : (i + 1) + ". "}${g.text}</b> <small style="float:right">${v}/${g.n}</small><div class="bar"><i style="width:${100 * v / g.n}%"></i></div></div>`; }).join("");
    },
    act(a) {
      this.api.sfx("click");
      if (a === "rot") { this.dir = (this.dir + 1) % 4; this.panel(); }
      if (a === "speed") { this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1; this.panel(); }
      if (a === "demo") this.demo();
      if (a === "reset") this.reset();
    },
    demo() {
      this.reset();
      const P = (t, c, r, d) => this.place(t, c, r, d);
      const line = (r, c0, c1, d) => { for (let c = c0; c <= c1; c++) P("belt", c, r, d); };
      const col = (c, r0, r1, d) => { for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) P("belt", c, r, d); };
      P("miner", 4, 2, 0); P("furnace", 5, 2, 0); line(2, 6, 18, 0); col(19, 2, 5, 1); P("asm:gear", 19, 6, 1);
      P("miner", 4, 4, 0); P("furnace", 5, 4, 0); line(4, 6, 17, 0); col(18, 4, 7, 1); P("belt", 18, 8, 0); P("asm:circuit", 19, 8, 3);
      P("miner", 4, 11, 0); P("furnace", 5, 11, 0); line(11, 6, 18, 0); col(19, 10, 11, 3); P("asm:wire", 19, 9, 3);
      P("asm:robot", 19, 7, 0);
      this.api.setStatus("Demo factory: iron → gears, copper → wire → circuits, all feeding the Robot Maker. Watch it run!");
      this.panel();
    },
    key(e, down) {
      if (!down) return false; const k = e.key.toLowerCase();
      const t = TOOLS.find((x) => x.key.toLowerCase() === k); if (t) { this.tool = t.id; this.panel(); return true; }
      if (k === "r") { this.dir = (this.dir + (e.shiftKey ? 3 : 1)) % 4; this.panel(); return true; }
      if (k === "f") { this.act("speed"); return true; }
      return false;
    },
    wheel(d) { this.dir = (this.dir + (d > 0 ? 1 : 3)) % 4; this.panel(); },
    mouse(type, x, y, b) {
      const c = Math.floor(x / S), r = Math.floor(y / S);
      if (type === "leave") { this.hover = null; return; }
      if (type === "up") { this.drag = null; return; }
      this.hover = [c, r];
      if (type === "down") { this.drag = { erase: b === 2 || this.tool === "erase", last: [c, r] }; this.apply(c, r, this.drag.erase); return; }
      if (type === "move" && this.drag && b) {
        const [lc, lr] = this.drag.last; if (lc === c && lr === r) return;
        if (!this.drag.erase && this.tool === "belt" && Math.abs(lc - c) + Math.abs(lr - r) === 1) {
          const d = c > lc ? 0 : r > lr ? 1 : c < lc ? 2 : 3; this.dir = d;
          const prev = this.at(lc, lr); if (prev && prev.type === "belt") prev.dir = d;
        }
        this.drag.last = [c, r]; this.apply(c, r, this.drag.erase);
      } else if (type === "move" && this.drag && !b) this.drag = null;
    },
    apply(c, r, erase) { if (erase) { if (this.canPlace("erase", c, r)) this.place("erase", c, r); } else this.place(this.tool, c, r); },
    // ---------------------------------------------------------------- draw
    draw(ctx) {
      ctx.fillStyle = "#23272f"; ctx.fillRect(0, 0, 960, 600);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const ore = ORE[c + "," + r];
        ctx.fillStyle = (r + c) % 2 ? "#262b34" : "#2a2f39"; ctx.fillRect(c * S, r * S, S, S);
        if (ore) { const col = ITEMS[ore].color; ctx.fillStyle = ore === "iron_ore" ? "#3a4350" : "#4a3427"; ctx.fillRect(c * S, r * S, S, S);
          for (let i = 0; i < 5; i++) { const h = ((c * 7 + r * 13 + i * 17) % 23) / 23, k = ((c * 11 + r * 5 + i * 29) % 19) / 19; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(c * S + 6 + h * 28, r * S + 6 + k * 28, 3 + (i % 3), 0, 7); ctx.fill(); } }
      }
      ctx.strokeStyle = "rgba(255,255,255,0.03)"; ctx.lineWidth = 1;
      for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c * S + 0.5, 0); ctx.lineTo(c * S + 0.5, 600); ctx.stroke(); }
      for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * S + 0.5); ctx.lineTo(960, r * S + 0.5); ctx.stroke(); }
      // belts first, then items, then machines
      const all = [];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const b = this.grid[r][c]; if (b && b.type !== "core") all.push(b); }
      for (const b of all) if (b.type === "belt") this.drawBelt(ctx, b);
      for (const b of all) if (b.type === "belt" && b.item) { const k = b.p - 0.5; this.drawItem(ctx, b.item, b.c * S + S / 2 + DX[b.dir] * k * S, b.r * S + S / 2 + DY[b.dir] * k * S, 1); }
      for (const b of all) if (b.type !== "belt") this.drawMachine(ctx, b);
      this.drawCore(ctx);
      // ghost
      if (this.hover && !this.won) {
        const [c, r] = this.hover, ok = this.canPlace(this.tool, c, r);
        if (this.at(c, r) !== undefined) {
          ctx.fillStyle = this.tool === "erase" ? "rgba(255,80,80,0.3)" : ok ? "rgba(127,216,255,0.22)" : "rgba(255,60,60,0.3)"; ctx.fillRect(c * S, r * S, S, S);
          ctx.strokeStyle = ok ? "#7fd8ff" : "#ff5d5d"; ctx.lineWidth = 2; ctx.strokeRect(c * S + 1, r * S + 1, S - 2, S - 2);
          if (this.tool !== "erase") { ctx.fillStyle = "#fff"; ctx.font = "bold 18px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(ARROW[this.dir], c * S + S / 2, r * S + S / 2); ctx.textBaseline = "alphabetic"; }
        }
      }
      for (const e of this.fx) { ctx.globalAlpha = Math.min(1, e.t * 2); ctx.fillStyle = e.color; ctx.fillRect(e.x - 3, e.y - 3, 6, 6); }
      ctx.globalAlpha = 1; ctx.textAlign = "center"; ctx.font = "bold 17px 'Trebuchet MS', sans-serif";
      for (const e of this.texts) { ctx.fillStyle = "#000"; ctx.fillText(e.s, e.x + 1, e.y + 1); ctx.fillStyle = e.color; ctx.fillText(e.s, e.x, e.y); }
      // HUD
      const g = GOALS[Math.min(this.goal, GOALS.length - 1)], v = Math.min(g.n, this.progress(g));
      ctx.fillStyle = "rgba(10,12,24,0.82)"; ctx.fillRect(560, 8, 392, 56); ctx.strokeStyle = "#7fd8ff"; ctx.strokeRect(560.5, 8.5, 391, 55);
      ctx.textAlign = "left"; ctx.fillStyle = "#7fd8ff"; ctx.font = "bold 13px 'Trebuchet MS', sans-serif"; ctx.fillText(this.won ? "ALL GOALS COMPLETE" : `GOAL ${this.goal + 1} OF ${GOALS.length}`, 572, 27);
      ctx.fillStyle = "#fff"; ctx.font = "bold 17px 'Trebuchet MS', sans-serif"; ctx.fillText(this.won ? "Robots delivered: " + (this.stats.delivered.robot || 0) : g.text, 572, 49);
      if (!this.won) { ctx.fillStyle = "#1b2042"; ctx.fillRect(820, 38, 120, 10); ctx.fillStyle = "#ffd166"; ctx.fillRect(820, 38, 120 * v / g.n, 10); ctx.fillStyle = "#cfd5ff"; ctx.font = "12px sans-serif"; ctx.fillText(v + " / " + g.n, 856, 30); }
      if (this.banner) { ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, 250, 960, 80); ctx.textAlign = "center"; ctx.font = "900 italic 48px 'Trebuchet MS', sans-serif";
        ctx.fillStyle = "#06324a"; ctx.fillText(this.banner.text, 483, 307); ctx.fillStyle = this.won ? "#ffd166" : "#7fd8ff"; ctx.fillText(this.banner.text, 480, 304); }
      if (!all.length && !this.won) { ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(200, 520, 560, 62); ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = "bold 17px 'Trebuchet MS', sans-serif";
        ctx.fillText("Place a Miner [2] on ore, then drag Belts [1] to the Core", 480, 545); ctx.fillStyle = "#7fd8ff"; ctx.font = "14px 'Trebuchet MS', sans-serif"; ctx.fillText("Stuck? Press \"Show demo factory\" in the side panel", 480, 568); }
    },
    drawBelt(ctx, b) {
      const x = b.c * S, y = b.r * S; ctx.fillStyle = "#3b414d"; ctx.fillRect(x + 2, y + 2, S - 4, S - 4);
      ctx.save(); ctx.translate(x + S / 2, y + S / 2); ctx.rotate(b.dir * Math.PI / 2);
      ctx.fillStyle = "#2c313b"; ctx.fillRect(-S / 2 + 2, -13, S - 4, 26);
      ctx.strokeStyle = "#e0b43a"; ctx.lineWidth = 2.5; const off = (this.time * 2.4 * S) % 13;
      ctx.beginPath(); ctx.rect(-S / 2 + 2, -13, S - 4, 26); ctx.clip();
      for (let i = -2; i < 4; i++) { const cx = -S / 2 + i * 13 + off; ctx.beginPath(); ctx.moveTo(cx - 4, -7); ctx.lineTo(cx + 2, 0); ctx.lineTo(cx - 4, 7); ctx.stroke(); }
      ctx.restore();
    },
    drawMachine(ctx, b) {
      const x = b.c * S, y = b.r * S, R = b.type === "asm" ? RECIPES[b.recipe] : null;
      const col = b.type === "miner" ? "#c9a227" : b.type === "furnace" ? "#c4552d" : R.color;
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(x + 4, y + 6, S - 4, S - 4);
      ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x + 2, y + 2, S - 4, S - 4, 7) : ctx.rect(x + 2, y + 2, S - 4, S - 4); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(x + 5, y + 5, S - 10, 5);
      const cx = x + S / 2, cy = y + S / 2;
      if (b.type === "miner") { ctx.save(); ctx.translate(cx, cy + 2); ctx.rotate(this.time * (b.out.length ? 0.5 : 6)); ctx.fillStyle = "#3b3b3b"; for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.fillRect(-2, -12, 4, 12); } ctx.restore(); }
      else if (b.type === "furnace") { ctx.fillStyle = "#2a1410"; ctx.fillRect(cx - 9, cy - 4, 18, 13); if (b.work > 0) { ctx.fillStyle = `hsl(${30 + Math.sin(this.time * 20) * 15},100%,60%)`; ctx.fillRect(cx - 7, cy - 1 + Math.sin(this.time * 13) * 2, 14, 9); } }
      else { this.drawItem(ctx, R.out, cx, cy + 1, 1.25); }
      // direction notch
      ctx.fillStyle = "#fff"; ctx.save(); ctx.translate(cx, cy); ctx.rotate(b.dir * Math.PI / 2); ctx.beginPath(); ctx.moveTo(S / 2 - 3, 0); ctx.lineTo(S / 2 - 10, -6); ctx.lineTo(S / 2 - 10, 6); ctx.fill(); ctx.restore();
      const need = b.type === "miner" ? 1.1 : b.type === "furnace" ? 1.0 : R.time;
      if (b.work > 0) { ctx.fillStyle = "#111"; ctx.fillRect(x + 5, y + S - 8, S - 10, 4); ctx.fillStyle = "#7dff9b"; ctx.fillRect(x + 5, y + S - 8, (S - 10) * b.work / need, 4); }
      if (b.out.length >= (b.type === "asm" ? 4 : b.type === "furnace" ? 2 : 1) && b.type !== "miner") { ctx.fillStyle = "#ff5d5d"; ctx.beginPath(); ctx.arc(x + S - 7, y + 7, 4, 0, 7); ctx.fill(); }
      if (b.type === "miner" && !ORE[b.c + "," + b.r]) { ctx.fillStyle = "#ff5d5d"; ctx.fillText("!", cx, cy); }
    },
    drawCore(ctx) {
      const x = CORE.c * S, y = CORE.r * S, w = S * 2, pulse = 0.5 + 0.5 * Math.sin(this.time * 3);
      ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(x + 6, y + 8, w, w);
      const g = ctx.createLinearGradient(x, y, x, y + w); g.addColorStop(0, "#3b5bdb"); g.addColorStop(1, "#1c2d7a"); ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x + 2, y + 2, w - 4, w - 4, 12) : ctx.rect(x + 2, y + 2, w - 4, w - 4); ctx.fill();
      ctx.strokeStyle = `rgba(127,216,255,${0.5 + pulse * 0.5 + (this.coreFlash || 0) * 2})`; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "bold 15px 'Trebuchet MS', sans-serif"; ctx.textAlign = "center"; ctx.fillText("CORE", x + S, y + 24);
      this.drawItem(ctx, "robot", x + S - 12, y + S + 16, 1.2); ctx.fillStyle = "#ffd166"; ctx.font = "bold 16px sans-serif"; ctx.fillText("×" + (this.stats.delivered.robot || 0), x + S + 14, y + S + 22);
    },
    drawItem(ctx, it, x, y, s) {
      const c = ITEMS[it].color; ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      if (it.endsWith("_ore")) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-7, 2); ctx.lineTo(-3, -6); ctx.lineTo(5, -5); ctx.lineTo(7, 3); ctx.lineTo(0, 7); ctx.fill(); ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(-2, -1, 4, 3); }
      else if (it.endsWith("_plate")) { ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.fillRect(-7, -4, 15, 10); ctx.fillStyle = c; ctx.fillRect(-8, -6, 15, 10); ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.fillRect(-6, -5, 11, 2); }
      else if (it === "gear") { ctx.fillStyle = c; for (let i = 0; i < 8; i++) { ctx.save(); ctx.rotate(i * Math.PI / 4 + this.time); ctx.fillRect(-2, -9, 4, 4); ctx.restore(); } ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, 7); ctx.fill(); ctx.fillStyle = "#555"; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, 7); ctx.fill(); }
      else if (it === "wire") { ctx.strokeStyle = c; ctx.lineWidth = 2.5; ctx.beginPath(); for (let i = 0; i < 4; i++) ctx.arc(-5 + i * 3.3, 0, 3.2, Math.PI, Math.PI * 3); ctx.stroke(); }
      else if (it === "circuit") { ctx.fillStyle = "#156b3a"; ctx.fillRect(-8, -7, 16, 14); ctx.fillStyle = c; ctx.fillRect(-5, -4, 10, 8); ctx.fillStyle = "#ffd166"; for (let i = -1; i <= 1; i++) { ctx.fillRect(-10, i * 4 - 1, 2, 2); ctx.fillRect(8, i * 4 - 1, 2, 2); } }
      else if (it === "robot") { ctx.fillStyle = c; ctx.fillRect(-7, -6, 14, 12); ctx.fillRect(-1, -10, 2, 4); ctx.fillStyle = "#ff5f7a"; ctx.fillRect(-2, -12, 4, 3); ctx.fillStyle = "#222"; ctx.fillRect(-5, -3, 3, 3); ctx.fillRect(2, -3, 3, 3); ctx.fillRect(-4, 2, 8, 2); }
      ctx.restore();
    },
    bestLabel() { return this.best ? "Best: robots in <b style='color:#7fd8ff'>" + this.best + "s</b>" : "Goal: build 3 robots"; },
    preview(ctx, w, h, t) {
      ctx.fillStyle = "#262b34"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#3a4350"; ctx.fillRect(0, 50, 40, 60);
      for (let i = 0; i < 8; i++) { ctx.fillStyle = "#9fb0c6"; ctx.beginPath(); ctx.arc(8 + (i * 13) % 30, 58 + (i * 17) % 46, 3, 0, 7); ctx.fill(); }
      ctx.fillStyle = "#c9a227"; ctx.fillRect(28, 66, 28, 28); ctx.fillStyle = "#c4552d"; ctx.fillRect(60, 66, 28, 28); ctx.fillStyle = "#8f9bb3"; ctx.fillRect(170, 66, 28, 28);
      ctx.fillStyle = "#3b414d"; ctx.fillRect(90, 70, 78, 20); ctx.fillRect(200, 70, 14, 20);
      ctx.fillStyle = "#3b5bdb"; ctx.fillRect(214, 50, 36, 60); ctx.fillStyle = "#fff"; ctx.font = "bold 10px sans-serif"; ctx.fillText("CORE", 219, 64);
      for (let i = 0; i < 4; i++) { const x = 92 + ((t * 40 + i * 20) % 76); ctx.fillStyle = "#d4dce8"; ctx.fillRect(x, 76, 9, 7); }
      this.drawItem(ctx, "robot", 232, 90, 1.1);
      ctx.fillStyle = "#ffa45c"; ctx.fillRect(60, 124, 28, 18); ctx.fillStyle = "#3b414d"; ctx.fillRect(90, 128, 120, 10);
      for (let i = 0; i < 5; i++) { ctx.fillStyle = "#ff9a3d"; ctx.fillRect(92 + ((t * 30 + i * 24) % 116), 130, 6, 6); }
    },
    state() { return { goal: this.goal, goals: GOALS.length, won: this.won, mined: this.stats.mined, made: { ...this.stats.made }, delivered: { ...this.stats.delivered }, buildings: this.grid.flat().filter((b) => b && b.type !== "core").length, time: +this.time.toFixed(1), tool: this.tool, dir: this.dir }; },
    test: {
      reset: () => G.reset(), demo: () => G.demo(), place: (t, c, r, d) => !!G.place(t, c, r, d),
      sim: (sec) => { const n = Math.round(sec / STEP); for (let i = 0; i < n; i++) G.sim(); return G.state(); },
      at: (c, r) => { const b = G.at(c, r); return b ? { type: b.type, dir: b.dir, recipe: b.recipe, item: b.item } : null; },
    },
  };
  root.FGJ_GAMES = root.FGJ_GAMES || []; root.FGJ_GAMES.push(G);
})(window);
