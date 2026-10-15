// Headless ROM sanity run in Node: each built-in ROM must run without faults and do its thing.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Chip8Core } = require("../web/chip8.js");
globalThis.window = globalThis; eval(readFileSync(new URL("../web/roms.js", import.meta.url), "utf8"));
const roms = globalThis.CHIP8_ROMS; const res = {};
for (const r of roms) {
  const c = new Chip8Core(12345); c.load(r.bytes);
  let maxV = {}, beeps = 0, waits = 0, minLit = 1e9, maxLit = 0;
  for (let f = 0; f < 60 * 60; f++) {
    // light auto-play for variety: hold right half the time
    if (r.id === "brix" || r.id === "dodge") { (Math.floor(f / 40) % 2 ? c.keyDown(9) : c.keyUp(9)); }
    if (c.waitKey >= 0) { waits++; c.keyDown(6); c.keyUp(6); }
    c.run(r.ipf); c.tick60(); if (c.st > 0) beeps++;
    const lit = c.disp.reduce((a, b) => a + b, 0); minLit = Math.min(minLit, lit); maxLit = Math.max(maxLit, lit);
    for (let i = 0; i < 16; i++) maxV[i] = Math.max(maxV[i] || 0, c.V[i]);
    if (c.error) break;
  }
  res[r.id] = { error: c.error, cycles: c.cycles, beeps, waits, minLit, maxLit, V: Array.from(c.V) };
}
console.log(JSON.stringify(res, null, 1));
