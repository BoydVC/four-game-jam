/* Shared WebAudio synth: tiny procedural SFX, no audio files. M toggles mute. */
(function () {
  "use strict";
  let ac = null, master = null, buzz = null, buzzGain = null;
  const S = { muted: false };
  try { S.muted = localStorage.getItem("fgj.muted") === "1"; } catch (e) {}
  function ctx() {
    if (ac) return ac;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ac = new AC(); master = ac.createGain(); master.gain.value = S.muted ? 0 : 0.35; master.connect(ac.destination);
    return ac;
  }
  function blip(freq, dur, type, vol, slide, delay) {
    const a = ctx(); if (!a || S.muted) return;
    const t = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || "square"; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, delay) {
    const a = ctx(); if (!a || S.muted) return;
    const t = a.currentTime + (delay || 0), len = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = a.createBufferSource(), g = a.createGain(); s.buffer = b; g.gain.value = vol || 0.2; s.connect(g); g.connect(master); s.start(t);
  }
  const SOUNDS = {
    click: () => blip(660, 0.05, "square", 0.08),
    place: () => { blip(320, 0.08, "triangle", 0.2); blip(480, 0.08, "triangle", 0.15, 1, 0.06); },
    sell: () => { blip(700, 0.06, "square", 0.1); blip(500, 0.08, "square", 0.1, 1, 0.05); },
    upgrade: () => [440, 554, 659, 880].forEach((f, i) => blip(f, 0.09, "square", 0.1, 1, i * 0.05)),
    shoot: () => blip(880, 0.06, "square", 0.05, 0.5),
    cannon: () => { noise(0.18, 0.18); blip(120, 0.18, "sine", 0.25, 0.4); },
    zap: () => blip(1400, 0.1, "sawtooth", 0.06, 0.3),
    hit: () => blip(200, 0.05, "square", 0.06, 0.6),
    pop: () => { blip(520, 0.07, "triangle", 0.12, 1.8); },
    boom: () => { noise(0.35, 0.3); blip(90, 0.35, "sine", 0.3, 0.3); },
    coin: () => { blip(988, 0.06, "square", 0.08); blip(1319, 0.12, "square", 0.08, 1, 0.06); },
    hurt: () => { blip(160, 0.2, "sawtooth", 0.18, 0.5); noise(0.1, 0.1); },
    dash: () => blip(300, 0.12, "sine", 0.12, 2.5),
    craft: () => { blip(740, 0.05, "triangle", 0.1); blip(990, 0.07, "triangle", 0.1, 1, 0.04); },
    goal: () => [523, 659, 784, 1047, 1319].forEach((f, i) => blip(f, 0.14, "triangle", 0.15, 1, i * 0.08)),
    wave: () => { blip(220, 0.25, "sawtooth", 0.1, 2); blip(330, 0.25, "sawtooth", 0.08, 2, 0.1); },
    win: () => [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => blip(f, 0.18, "square", 0.1, 1, i * 0.11)),
    lose: () => [392, 330, 262, 196].forEach((f, i) => blip(f, 0.3, "triangle", 0.15, 0.9, i * 0.2)),
    power: () => [392, 523, 659, 784, 1047].forEach((f, i) => blip(f, 0.1, "sine", 0.15, 1, i * 0.05)),
    boss: () => { blip(70, 0.8, "sawtooth", 0.25, 0.7); noise(0.6, 0.15); },
    open: () => { blip(523, 0.08, "triangle", 0.12); blip(784, 0.12, "triangle", 0.12, 1, 0.07); },
  };
  S.play = (name) => { try { (SOUNDS[name] || SOUNDS.click)(); } catch (e) {} };
  S.tone = (on) => {
    const a = ac; if (!a) return;
    if (on && !S.muted && !buzz) {
      buzz = a.createOscillator(); buzzGain = a.createGain(); buzz.type = "square"; buzz.frequency.value = 440;
      buzzGain.gain.value = 0.06; buzz.connect(buzzGain); buzzGain.connect(master); buzz.start();
    } else if ((!on || S.muted) && buzz) { try { buzz.stop(); } catch (e) {} buzz = null; }
  };
  S.unlock = () => { const a = ctx(); if (a && a.state === "suspended") a.resume(); };
  S.toggle = () => {
    S.muted = !S.muted; try { localStorage.setItem("fgj.muted", S.muted ? "1" : "0"); } catch (e) {}
    if (master) master.gain.value = S.muted ? 0 : 0.35; if (S.muted) S.tone(false); return S.muted;
  };
  window.FGJ_SFX = S;
})();
