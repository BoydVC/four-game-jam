/* CHIP-8 Arcade: a real CHIP-8 interpreter + three original built-in ROMs (web/roms.js). */
(function (root) {
  "use strict";
  const FONT = [
    0xF0,0x90,0x90,0x90,0xF0, 0x20,0x60,0x20,0x20,0x70, 0xF0,0x10,0xF0,0x80,0xF0, 0xF0,0x10,0xF0,0x10,0xF0,
    0x90,0x90,0xF0,0x10,0x10, 0xF0,0x80,0xF0,0x10,0xF0, 0xF0,0x80,0xF0,0x90,0xF0, 0xF0,0x10,0x20,0x40,0x40,
    0xF0,0x90,0xF0,0x90,0xF0, 0xF0,0x90,0xF0,0x10,0xF0, 0xF0,0x90,0xF0,0x90,0x90, 0xE0,0x90,0xE0,0x90,0xE0,
    0xF0,0x80,0x80,0x80,0xF0, 0xE0,0x90,0x90,0x90,0xE0, 0xF0,0x80,0xF0,0x80,0xF0, 0xF0,0x80,0xF0,0x80,0x80,
  ];

  class Chip8Core {
    constructor(seed) { this.rngState = (seed || 0x2468ace) >>> 0; this.reset(); }
    reset() {
      this.mem = new Uint8Array(4096);
      this.mem.set(FONT, 0x50);
      this.V = new Uint8Array(16);
      this.I = 0; this.pc = 0x200; this.stack = []; this.dt = 0; this.st = 0;
      this.disp = new Uint8Array(64 * 32);
      this.keys = new Uint8Array(16);
      this.waitKey = -1; this.halted = false; this.cycles = 0; this.drawFlag = true; this.lastOp = 0; this.error = null;
    }
    load(bytes) { this.reset(); this.mem.set(bytes.slice(0, 4096 - 0x200), 0x200); this.romSize = bytes.length; }
    rand() { let x = this.rngState; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.rngState = x >>> 0; return this.rngState & 0xFF; }
    keyDown(k) { this.keys[k] = 1; if (this.waitKey >= 0) { this.V[this.waitKey] = k; this.waitKey = -1; } }
    keyUp(k) { this.keys[k] = 0; }
    tick60() { if (this.dt > 0) this.dt--; if (this.st > 0) this.st--; }
    run(n) { for (let i = 0; i < n && this.waitKey < 0 && !this.halted; i++) this.step(); }
    step() {
      const m = this.mem, V = this.V;
      const op = (m[this.pc] << 8) | m[this.pc + 1];
      this.lastOp = op; this.pc = (this.pc + 2) & 0xFFF; this.cycles++;
      const x = (op >> 8) & 0xF, y = (op >> 4) & 0xF, n = op & 0xF, nn = op & 0xFF, nnn = op & 0xFFF;
      switch (op >> 12) {
        case 0x0:
          if (op === 0x00E0) { this.disp.fill(0); this.drawFlag = true; }
          else if (op === 0x00EE) { if (!this.stack.length) return this.fault("stack underflow"); this.pc = this.stack.pop(); }
          else if (op === 0x0000) return this.fault("hit empty memory");
          break;
        case 0x1: if (nnn === ((this.pc - 2) & 0xFFF)) this.halted = true; this.pc = nnn; break;
        case 0x2: if (this.stack.length > 15) return this.fault("stack overflow"); this.stack.push(this.pc); this.pc = nnn; break;
        case 0x3: if (V[x] === nn) this.pc += 2; break;
        case 0x4: if (V[x] !== nn) this.pc += 2; break;
        case 0x5: if (V[x] === V[y]) this.pc += 2; break;
        case 0x6: V[x] = nn; break;
        case 0x7: V[x] = (V[x] + nn) & 0xFF; break;
        case 0x8: {
          const a = V[x], b = V[y];
          switch (n) {
            case 0x0: V[x] = b; break;
            case 0x1: V[x] = a | b; break;
            case 0x2: V[x] = a & b; break;
            case 0x3: V[x] = a ^ b; break;
            case 0x4: { const s = a + b; V[x] = s & 0xFF; V[0xF] = s > 0xFF ? 1 : 0; break; }
            case 0x5: V[x] = (a - b) & 0xFF; V[0xF] = a >= b ? 1 : 0; break;
            case 0x6: V[x] = a >> 1; V[0xF] = a & 1; break;
            case 0x7: V[x] = (b - a) & 0xFF; V[0xF] = b >= a ? 1 : 0; break;
            case 0xE: V[x] = (a << 1) & 0xFF; V[0xF] = (a >> 7) & 1; break;
            default: return this.fault("bad 8xy op");
          }
          break;
        }
        case 0x9: if (V[x] !== V[y]) this.pc += 2; break;
        case 0xA: this.I = nnn; break;
        case 0xB: this.pc = (nnn + V[0]) & 0xFFF; break;
        case 0xC: V[x] = this.rand() & nn; break;
        case 0xD: {
          const ox = V[x] & 63, oy = V[y] & 31; let hit = 0;
          for (let r = 0; r < n; r++) {
            const py = oy + r; if (py >= 32) break;
            const row = m[(this.I + r) & 0xFFF];
            for (let c = 0; c < 8; c++) {
              const px = ox + c; if (px >= 64) break;
              if (row & (0x80 >> c)) { const i = py * 64 + px; if (this.disp[i]) hit = 1; this.disp[i] ^= 1; }
            }
          }
          V[0xF] = hit; this.drawFlag = true; break;
        }
        case 0xE:
          if (nn === 0x9E) { if (this.keys[V[x] & 0xF]) this.pc += 2; }
          else if (nn === 0xA1) { if (!this.keys[V[x] & 0xF]) this.pc += 2; }
          break;
        case 0xF:
          switch (nn) {
            case 0x07: V[x] = this.dt; break;
            case 0x0A: this.waitKey = x; break;
            case 0x15: this.dt = V[x]; break;
            case 0x18: this.st = V[x]; break;
            case 0x1E: this.I = (this.I + V[x]) & 0xFFF; break;
            case 0x29: this.I = 0x50 + (V[x] & 0xF) * 5; break;
            case 0x33: m[this.I] = Math.floor(V[x] / 100); m[this.I + 1] = Math.floor(V[x] / 10) % 10; m[this.I + 2] = V[x] % 10; break;
            case 0x55: for (let i = 0; i <= x; i++) m[(this.I + i) & 0xFFF] = V[i]; break;
            case 0x65: for (let i = 0; i <= x; i++) V[i] = m[(this.I + i) & 0xFFF]; break;
            default: return this.fault("bad Fx op");
          }
          break;
      }
    }
    fault(msg) { this.halted = true; this.error = msg + " @" + ((this.pc - 2) & 0xFFF).toString(16); }
    disasm(op) {
      const h = (v, w) => v.toString(16).toUpperCase().padStart(w, "0");
      const x = (op >> 8) & 0xF, y = (op >> 4) & 0xF, n = op & 0xF, nn = op & 0xFF, nnn = op & 0xFFF;
      const X = "V" + h(x, 1), Y = "V" + h(y, 1);
      switch (op >> 12) {
        case 0: return op === 0xE0 ? "CLS" : op === 0xEE ? "RET" : "SYS " + h(nnn, 3);
        case 1: return "JP " + h(nnn, 3);
        case 2: return "CALL " + h(nnn, 3);
        case 3: return `SE ${X}, ${h(nn, 2)}`;
        case 4: return `SNE ${X}, ${h(nn, 2)}`;
        case 5: return `SE ${X}, ${Y}`;
        case 6: return `LD ${X}, ${h(nn, 2)}`;
        case 7: return `ADD ${X}, ${h(nn, 2)}`;
        case 8: return (["LD", "OR", "AND", "XOR", "ADD", "SUB", "SHR", "SUBN"][n] || (n === 14 ? "SHL" : "?")) + ` ${X}, ${Y}`;
        case 9: return `SNE ${X}, ${Y}`;
        case 0xA: return "LD I, " + h(nnn, 3);
        case 0xB: return "JP V0, " + h(nnn, 3);
        case 0xC: return `RND ${X}, ${h(nn, 2)}`;
        case 0xD: return `DRW ${X}, ${Y}, ${n}`;
        case 0xE: return (nn === 0x9E ? "SKP " : "SKNP ") + X;
        case 0xF: return ({ 7: `LD ${X}, DT`, 0x0A: `LD ${X}, K`, 0x15: `LD DT, ${X}`, 0x18: `LD ST, ${X}`, 0x1E: `ADD I, ${X}`,
          0x29: `LD F, ${X}`, 0x33: `LD B, ${X}`, 0x55: `LD [I], ${X}`, 0x65: `LD ${X}, [I]` })[nn] || "?";
      }
      return "?";
    }
  }
  root.Chip8Core = Chip8Core;
  if (typeof module !== "undefined" && module.exports) { module.exports = { Chip8Core }; return; }

  // ---------------------------------------------------------------- game wrapper
  const KEYMAP = { "1": 0x1, "2": 0x2, "3": 0x3, "4": 0xC, q: 0x4, w: 0x5, e: 0x6, r: 0xD, a: 0x7, s: 0x8, d: 0x9, f: 0xE,
    z: 0xA, x: 0x0, c: 0xB, v: 0xF, arrowup: 0x5, arrowdown: 0x8, arrowleft: 0x7, arrowright: 0x9, " ": 0x6 };
  const THEMES = [
    { name: "Phosphor", on: "#7dff9b", off: "#06140b", glow: "rgba(125,255,155,0.55)" },
    { name: "Amber", on: "#ffbf47", off: "#170e02", glow: "rgba(255,191,71,0.55)" },
    { name: "Ice", on: "#9be7ff", off: "#04101a", glow: "rgba(155,231,255,0.55)" },
    { name: "Candy", on: "#ff7ad9", off: "#16041a", glow: "rgba(255,122,217,0.55)" },
  ];
  const G = {
    id: "chip8", title: "CHIP-8 Arcade", tag: "Real emulator · 3 original ROMs", color: "#7dff9b",
    core: null, rom: null, romIdx: 0, theme: 0, paused: false, auto: false, acc: 0, ghost: null, speed: 1, held: {},
    init(api) {
      this.api = api;
      this.core = new Chip8Core(0xC0FFEE);
      this.ghost = new Float32Array(64 * 32);
    },
    enter() { if (!this.rom) this.loadRom(0); this.buildPanel(); },
    leave() { for (let k = 0; k < 16; k++) this.core.keyUp(k); this.held = {}; },
    loadRom(i) {
      const roms = root.CHIP8_ROMS || [];
      this.romIdx = ((i % roms.length) + roms.length) % roms.length;
      this.rom = roms[this.romIdx];
      this.core.load(this.rom.bytes);
      this.ghost.fill(0); this.paused = false; this.acc = 0;
      this.api.setStatus(this.rom.name + " · " + this.rom.keys);
      this.buildPanel();
    },
    loadBytes(name, bytes) {
      this.rom = { id: "custom", name, ipf: 15, keys: "Keypad 1234 / QWER / ASDF / ZXCV", blurb: "Your own ROM file", bytes: Array.from(bytes) };
      this.core.load(this.rom.bytes); this.ghost.fill(0); this.api.setStatus("Loaded " + name); this.buildPanel();
    },
    buildPanel() {
      const p = this.api.panel; if (!p || this.api.active() !== this) return;
      const roms = root.CHIP8_ROMS || [];
      p.innerHTML = `
        <h3>Cartridges</h3>
        <div class="roms">${roms.map((r, i) => `<button class="rom ${this.rom && this.rom.id === r.id ? "on" : ""}" data-rom="${i}"><b>${r.name}</b><small>${r.blurb}</small></button>`).join("")}</div>
        <div class="row"><button data-act="reset">Reset</button><button data-act="pause">${this.paused ? "Resume" : "Pause"}</button><button data-act="auto" class="${this.auto ? "on" : ""}">Autoplay</button></div>
        <div class="row"><button data-act="theme">Screen: ${THEMES[this.theme].name}</button><button data-act="speed">Speed ${this.speed}x</button></div>
        <label class="file">Load your own .ch8 <input type="file" accept=".ch8,.c8,application/octet-stream"></label>
        <h3>Controls</h3><p class="hint">${this.rom ? this.rom.keys : ""}<br>Arrows also work. Keypad = 1234 QWER ASDF ZXCV.</p>
        <h3>CPU</h3><pre class="regs" id="c8regs"></pre>`;
      p.querySelectorAll("[data-rom]").forEach((b) => b.onclick = () => { this.loadRom(+b.dataset.rom); this.api.sfx("click"); });
      p.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => { this.act(b.dataset.act); this.api.sfx("click"); });
      const f = p.querySelector("input[type=file]");
      f.onchange = () => { const file = f.files[0]; if (!file) return; const rd = new FileReader();
        rd.onload = () => this.loadBytes(file.name, new Uint8Array(rd.result)); rd.readAsArrayBuffer(file); };
    },
    act(a) {
      if (a === "reset") this.loadRom(this.romIdx);
      if (a === "pause") { this.paused = !this.paused; this.buildPanel(); }
      if (a === "auto") { this.auto = !this.auto; if (!this.auto) for (let k = 0; k < 16; k++) if (!this.held[k]) this.core.keyUp(k); this.buildPanel(); }
      if (a === "theme") { this.theme = (this.theme + 1) % THEMES.length; this.buildPanel(); }
      if (a === "speed") { this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 0.5 : 1; this.buildPanel(); }
    },
    autopilot() {
      const c = this.core, V = c.V, id = this.rom && this.rom.id; const set = (k, on) => on ? c.keyDown(k) : c.keyUp(k);
      if (c.waitKey >= 0) { c.keyDown(6); c.keyUp(6); return; }
      if (id === "pong") { const center = V[0] + 3; set(5, V[3] < center - 1); set(8, V[3] > center + 1); }
      else if (id === "brix") {
        // aim the paddle under the ball's predicted landing x (simple wall-reflection projection)
        let x = V[0xB], y = V[0xC], dx = V[0xD] === 1 ? 1 : -1, dy = V[0xE] === 1 ? 1 : -1;
        if (dy > 0) { let steps = 29 - y; while (steps-- > 0) { x += dx; if (x <= 0 || x >= 63) dx = -dx; } }
        const center = V[0xA] + 2; set(7, x < center - 1); set(9, x > center + 1);
      } else if (id === "dodge") {
        const sx = V[3] + 4; let threat = 0;
        for (const [rx, ry] of [[V[4], V[5]], [V[6], V[7]], [V[8], V[9]]]) if (ry > 14 && Math.abs(rx + 2 - sx) < 9) threat += (rx + 2 < sx ? 1 : -1) * (ry);
        if (!threat) { set(7, sx > 36); set(9, sx < 28); } else { set(9, threat > 0 && V[3] < 56); set(7, threat < 0 && V[3] > 1); if (V[3] >= 56) set(7, true); if (V[3] <= 1) set(9, true); }
      }
    },
    frame() {
      const c = this.core;
      if (this.auto) this.autopilot();
      c.run(Math.round((this.rom ? this.rom.ipf : 15) * this.speed));
      c.tick60();
      if (c.st > 0) this.api.tone(true); else this.api.tone(false);
      for (let i = 0; i < 2048; i++) this.ghost[i] = c.disp[i] ? 1 : this.ghost[i] * 0.72;
    },
    update(dt) {
      if (this.paused || !this.rom) { this.api.tone(false); return; }
      this.acc += dt; let n = 0;
      while (this.acc >= 1 / 60 && n < 4) { this.frame(); this.acc -= 1 / 60; n++; }
      if (n === 4) this.acc = 0;
    },
    draw(ctx) {
      const W = ctx.canvas.width, H = ctx.canvas.height, th = THEMES[this.theme];
      const regEl = document.getElementById("c8regs");
      if (regEl && ((this._rt = (this._rt || 0) + 1) % 5 === 0 || !regEl.textContent)) regEl.textContent = c8hex(this.core);
      ctx.fillStyle = "#05060a"; ctx.fillRect(0, 0, W, H);
      // cabinet bezel
      const sx = 40, sy = 52, sw = 880, sh = 440, ps = 13.75;
      const grd = ctx.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, "#1b1f2e"); grd.addColorStop(1, "#0b0d14");
      ctx.fillStyle = grd; roundRect(ctx, sx - 24, sy - 36, sw + 48, sh + 92, 22); ctx.fill();
      ctx.fillStyle = th.off; roundRect(ctx, sx - 6, sy - 6, sw + 12, sh + 12, 10); ctx.fill();
      ctx.save(); ctx.shadowColor = th.glow; ctx.shadowBlur = 14; ctx.fillStyle = th.on;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
        const g = this.ghost[y * 64 + x];
        if (g > 0.05) { ctx.globalAlpha = g; ctx.fillRect(sx + x * ps + 0.6, sy + y * ps + 0.6, ps - 1.2, ps - 1.2); }
      }
      ctx.restore(); ctx.globalAlpha = 1;
      // scanlines
      ctx.fillStyle = "rgba(0,0,0,0.18)"; for (let y = sy; y < sy + sh; y += 3) ctx.fillRect(sx, y, sw, 1);
      ctx.fillStyle = "#c9d1ff"; ctx.font = "bold 18px ui-monospace, Menlo, monospace"; ctx.textAlign = "left";
      ctx.fillText((this.rom ? this.rom.name : "NO ROM") + (this.paused ? "  · PAUSED" : "") + (this.auto ? "  · AUTOPLAY" : ""), sx, sy - 14);
      ctx.textAlign = "right"; ctx.fillStyle = "#7f88b5";
      ctx.fillText(`PC ${this.core.pc.toString(16).toUpperCase().padStart(3, "0")}  ${this.core.disasm(this.core.lastOp)}`, sx + sw, sy - 14);
      ctx.textAlign = "center"; ctx.fillStyle = this.core.error ? "#ff6b6b" : "#7f88b5"; ctx.font = "15px ui-monospace, Menlo, monospace";
      ctx.fillText(this.core.error ? "CPU FAULT: " + this.core.error : this.core.waitKey >= 0 ? "Press any key to play again" : (this.rom ? this.rom.keys : ""), W / 2, sy + sh + 32);
      // keypad LEDs
      const order = [1, 2, 3, 0xC, 4, 5, 6, 0xD, 7, 8, 9, 0xE, 0xA, 0, 0xB, 0xF];
      order.forEach((k, i) => { ctx.fillStyle = this.core.keys[k] ? th.on : "#222838"; ctx.fillRect(W / 2 - 128 + i * 16, sy + sh + 44, 12, 6); });
    },
    key(e, down) {
      const k = KEYMAP[e.key.toLowerCase()]; if (k === undefined) return false;
      if (down) { this.held[k] = 1; this.core.keyDown(k); } else { delete this.held[k]; this.core.keyUp(k); }
      return true;
    },
    mouse() {},
    preview(ctx, w, h, t) {
      ctx.fillStyle = "#06140b"; ctx.fillRect(0, 0, w, h);
      const ps = w / 64; ctx.fillStyle = "#7dff9b"; ctx.shadowColor = "rgba(125,255,155,.6)"; ctx.shadowBlur = 6;
      const by = 16 + Math.round(Math.sin(t * 2.1) * 13), bx = Math.round(32 + Math.sin(t * 1.3) * 28);
      const ly = Math.max(0, Math.min(26, by - 3)), ry = Math.max(0, Math.min(26, Math.round(16 + Math.sin(t * 2.1 - 0.5) * 12) - 3));
      for (let i = 0; i < 6; i++) { ctx.fillRect(2 * ps, (ly + i) * ps * h / w * 2, ps, ps); ctx.fillRect(61 * ps, (ry + i) * ps * h / w * 2, ps, ps); }
      ctx.fillRect(bx * ps, by * ps * h / w * 2, ps, ps);
      for (let x = 0; x < 64; x += 4) ctx.fillRect((x + 0.5) * ps, h - 4, ps * 2, 2);
      ctx.shadowBlur = 0;
    },
    state() {
      const c = this.core;
      return { rom: this.rom && this.rom.id, pc: c.pc, cycles: c.cycles, lit: c.disp.reduce((a, b) => a + b, 0), V: Array.from(c.V),
        st: c.st, waitKey: c.waitKey, error: c.error, halted: c.halted, auto: this.auto };
    },
    test: {
      load(i) { G.loadRom(i); },
      frames(n) { for (let i = 0; i < n; i++) G.frame(); return G.state(); },
      press(k, on) { on ? G.core.keyDown(k) : G.core.keyUp(k); },
      auto(on) { G.auto = !!on; },
    },
  };
  function c8hex(c) {
    const h = (v) => v.toString(16).toUpperCase().padStart(2, "0"); let s = "";
    for (let i = 0; i < 16; i++) s += "V" + i.toString(16).toUpperCase() + "=" + h(c.V[i]) + (i % 4 === 3 ? "\n" : "  ");
    return s + `I=${c.I.toString(16).toUpperCase().padStart(3, "0")}  DT=${h(c.dt)}  ST=${h(c.st)}\ncycles ${c.cycles.toLocaleString()}`;
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
  root.FGJ_GAMES = root.FGJ_GAMES || []; root.FGJ_GAMES.push(G);
})(typeof window !== "undefined" ? window : globalThis);
