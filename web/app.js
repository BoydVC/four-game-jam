/* Four-Game Jam hub: routing, shared loop, input, persistence, and the window.__FGJ__ test API. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const SFX = window.FGJ_SFX;
  const ORDER = ["td", "factory", "chip8", "shooter"];
  const games = ORDER.map((id) => (window.FGJ_GAMES || []).find((g) => g.id === id)).filter(Boolean);
  const cv = $("#cv"), ctx = cv.getContext("2d");
  let active = null, last = performance.now(), paused = false;

  const store = {
    load(k, d) { try { const v = localStorage.getItem("fgj." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    save(k, v) { try { localStorage.setItem("fgj." + k, JSON.stringify(v)); } catch (e) {} },
  };
  function apiFor(g) {
    return {
      canvas: cv, ctx, panel: $("#panel"), sfx: SFX.play, tone: SFX.tone, load: store.load, save: store.save,
      active: () => active,
      setStatus(t) { g._status = t; if (active === g) $("#gstatus").textContent = t; },
      refreshCards: () => renderCards(),
    };
  }
  games.forEach((g) => g.init(apiFor(g)));

  // ---------------------------------------------------------------- hub
  const previews = [];
  function renderCards() {
    const el = $("#cards"); el.innerHTML = ""; previews.length = 0;
    games.forEach((g, i) => {
      const c = document.createElement("button");
      c.className = "card"; c.style.setProperty("--c", g.color); c.dataset.game = g.id;
      c.innerHTML = `<span class="num">${i + 1}</span><canvas width="254" height="160"></canvas><h3>${g.title}</h3><p class="tag">${g.tag}</p>
        <div class="best"><span>${g.bestLabel ? g.bestLabel() : ""}</span><b>${g._started ? "Resume ▶" : "Play ▶"}</b></div>`;
      c.onclick = () => open(g.id);
      el.appendChild(c);
      previews.push({ g, ctx: c.querySelector("canvas").getContext("2d") });
    });
  }
  function muteLabel() { const t = SFX.muted ? "Sound: off (M)" : "Sound: on (M)"; $("#mute").textContent = SFX.muted ? "Sound: OFF" : "Sound: ON"; $("#hubmute").textContent = t; }
  function open(id) {
    const g = games.find((x) => x.id === id); if (!g) return false;
    SFX.unlock(); SFX.play("open");
    if (active && active.leave) active.leave();
    active = g; g._started = true;
    $("#hub").classList.remove("on"); $("#play").classList.add("on");
    $("#gtitle").textContent = g.title; document.documentElement.style.setProperty("--gc", g.color);
    $("#panel").innerHTML = ""; g.enter();
    $("#gstatus").textContent = g._status || "";
    cv.focus(); return true;
  }
  function hub() {
    if (active && active.leave) active.leave();
    SFX.tone(false); active = null;
    $("#play").classList.remove("on"); $("#hub").classList.add("on"); renderCards();
  }
  $("#back").onclick = () => { SFX.play("click"); hub(); };
  $("#mute").onclick = $("#hubmute").onclick = () => { SFX.unlock(); SFX.toggle(); muteLabel(); };

  // ---------------------------------------------------------------- input
  window.addEventListener("keydown", (e) => {
    if (e.target && e.target.tagName === "INPUT") return;
    SFX.unlock();
    if (e.key === "Escape") { if (active) { e.preventDefault(); hub(); } return; }
    if (!active) {
      if (e.key.toLowerCase() === "m") { SFX.toggle(); muteLabel(); return; }
      const n = parseInt(e.key, 10); if (n >= 1 && n <= games.length) open(games[n - 1].id); return;
    }
    if (e.key.toLowerCase() === "m" && !e.repeat) { SFX.toggle(); muteLabel(); return; }
    if (active.key && active.key(e, true)) e.preventDefault();
    else if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => { if (active && active.key && active.key(e, false)) e.preventDefault(); });
  window.addEventListener("blur", () => { if (active && active.leave) active.leave(true); });
  function toCanvas(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; }
  cv.addEventListener("mousedown", (e) => { SFX.unlock(); if (active) { const [x, y] = toCanvas(e); active.mouse("down", x, y, e.button); } });
  window.addEventListener("mouseup", (e) => { if (active) { const [x, y] = toCanvas(e); active.mouse("up", x, y, e.button); } });
  cv.addEventListener("mousemove", (e) => { if (active) { const [x, y] = toCanvas(e); active.mouse("move", x, y, e.buttons); } });
  cv.addEventListener("mouseleave", () => { if (active) active.mouse("leave", -1, -1, 0); });
  cv.addEventListener("contextmenu", (e) => e.preventDefault());
  cv.addEventListener("wheel", (e) => { if (active && active.wheel) { e.preventDefault(); active.wheel(e.deltaY); } }, { passive: false });

  // ---------------------------------------------------------------- background + loop
  const bg = $("#bg"), bctx = bg.getContext("2d"); const stars = [];
  for (let i = 0; i < 140; i++) stars.push({ x: Math.random(), y: Math.random(), z: Math.random() * 0.8 + 0.2 });
  function drawBg(t) {
    if (bg.width !== innerWidth || bg.height !== innerHeight) { bg.width = innerWidth; bg.height = innerHeight; }
    const w = bg.width, h = bg.height;
    const g = bctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#0a0b1f"); g.addColorStop(1, "#130820");
    bctx.fillStyle = g; bctx.fillRect(0, 0, w, h);
    bctx.strokeStyle = "rgba(90,110,255,0.07)"; bctx.lineWidth = 1;
    const off = (t * 20) % 40;
    for (let y = h * 0.62 + off; y < h; y += 40) { bctx.beginPath(); bctx.moveTo(0, y); bctx.lineTo(w, y); bctx.stroke(); }
    for (let x = -w; x < w * 2; x += 80) { bctx.beginPath(); bctx.moveTo(w / 2, h * 0.62); bctx.lineTo(x, h); bctx.stroke(); }
    for (const s of stars) { bctx.fillStyle = `rgba(200,210,255,${0.25 + 0.5 * s.z * (0.6 + 0.4 * Math.sin(t * 2 + s.x * 50))})`; bctx.fillRect(s.x * w, s.y * h * 0.62, s.z * 2, s.z * 2); }
  }
  let bgDrawn = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = now / 1000;
    if (!active) {
      drawBg(t);
      for (const p of previews) { try { p.ctx.save(); p.g.preview(p.ctx, 254, 160, t); p.ctx.restore(); } catch (e) {} }
    } else {
      if (now - bgDrawn > 500) { drawBg(t); bgDrawn = now; }
      if (!paused) active.update(dt);
      ctx.save(); active.draw(ctx); ctx.restore();
    }
    requestAnimationFrame(frame);
  }
  renderCards(); muteLabel(); requestAnimationFrame(frame);

  // ---------------------------------------------------------------- test API
  window.__FGJ__ = {
    ids: games.map((g) => g.id),
    open, hub,
    active: () => (active ? active.id : null),
    game: (id) => games.find((g) => g.id === id),
    t: (id) => games.find((g) => g.id === id).test,
    state: (id) => games.find((g) => g.id === id).state(),
    pause(on) { paused = !!on; },
    redraw() { if (active) { if (active.panel) active.panel(); ctx.save(); active.draw(ctx); ctx.restore(); } },
    mouse(type, x, y, b) { if (active) active.mouse(type, x, y, b || 0); },
    key(k, down) { const e = { key: k, preventDefault() {}, repeat: false }; if (active && active.key) return active.key(e, down !== false); },
    muted: () => SFX.muted,
    toggleMute: () => { SFX.toggle(); muteLabel(); return SFX.muted; },
  };
})();
