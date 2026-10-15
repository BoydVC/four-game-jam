// Four-Game Jam headless playthrough via window.__FGJ__ (Chrome DevTools Protocol).
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sleep } from "./cdp.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = pathToFileURL(join(HERE, "..", "dist", "four-game-jam.html")).href;
const checks = [];
const check = (ok, msg, info = "") => checks.push({ ok: !!ok, msg, info: typeof info === "string" ? info : JSON.stringify(info) });
const J = (c, expr) => c.ev(`JSON.stringify(${expr})`).then(JSON.parse);

async function main() {
  const c = await launch({ width: 1280, height: 800, port: 9455 });
  try {
    await c.goto(DIST, 500);
    check(await c.ev("typeof window.__FGJ__ === 'object'"), "__FGJ__ test API present");
    check((await c.ev("document.title")) === "Four-Game Jam", "document title");
    const ids = await J(c, "__FGJ__.ids");
    check(ids.join() === "td,factory,chip8,shooter", "hub registers 4 games", ids.join());
    check((await c.ev("document.querySelectorAll('#cards .card').length")) === 4, "hub renders 4 cards");
    check(await c.ev("document.querySelector('#hub').classList.contains('on')"), "hub visible on load");

    // ---- open via card click, back via Esc
    await c.click('.card[data-game="td"]'); await sleep(150);
    check((await c.ev("__FGJ__.active()")) === "td", "card click opens Tower Defense");
    await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await sleep(120);
    check((await c.ev("__FGJ__.active()")) === null && await c.ev("document.querySelector('#hub').classList.contains('on')"), "Esc returns to hub");
    for (const [k, id] of [["2", "factory"], ["3", "chip8"], ["4", "shooter"], ["1", "td"]]) {
      await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, text: k }); await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: k }); await sleep(80);
      const a = await c.ev("__FGJ__.active()"); check(a === id, `hub key ${k} opens ${id}`, String(a));
      await c.ev("__FGJ__.hub()");
    }
    const m0 = await c.ev("__FGJ__.muted()"); await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "m", text: "m" }); await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "m" });
    const m1 = await c.ev("__FGJ__.muted()"); check(m0 !== m1, "M toggles mute", `${m0}->${m1}`); if (m1) await c.ev("__FGJ__.toggleMute()");

    // ---- Tower Defense
    await c.ev("__FGJ__.open('td'); __FGJ__.pause(true); __FGJ__.t('td').reset()");
    const gStart = await c.ev("__FGJ__.state('td').gold");
    // real canvas click: place an archer at tile (2,3) -> canvas px (2*48+24, 3*48+24)
    const box = await J(c, "(() => { const r = document.querySelector('#cv').getBoundingClientRect(); return {x:r.left, y:r.top, s:r.width/960}; })()");
    const px = box.x + (2 * 48 + 24) * box.s, py = box.y + (3 * 48 + 24) * box.s;
    await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: px, y: py });
    await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: px, y: py, button: "left", clickCount: 1 });
    await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: px, y: py, button: "left", clickCount: 1 });
    let td = await J(c, "__FGJ__.state('td')");
    check(td.towers === 1 && td.gold === gStart - 50, "TD: mouse click builds an Archer (-50 gold)", td);
    check(!(await c.ev("__FGJ__.t('td').place('arrow', 0, 2)")), "TD: cannot build on the road");
    check(await c.ev("__FGJ__.t('td').upgrade(2, 3)"), "TD: upgrade works");
    await c.ev("__FGJ__.t('td').wave()");
    td = await J(c, "__FGJ__.t('td').sim(1.5)");
    check(td.mode === "wave" && td.foes > 0, "TD: wave 1 spawns enemies", td);
    td = await J(c, "__FGJ__.t('td').sim(40)");
    check(td.mode === "build" && td.wave === 1 && td.kills > 0, "TD: wave 1 cleared, back to build", td);
    const g0 = td.gold; check(await c.ev("__FGJ__.t('td').sell(2, 3)"), "TD: sell refunds");
    td = await J(c, "__FGJ__.state('td')"); check(td.gold > g0, "TD: gold rose after sell", `${g0}->${td.gold}`);
    // lose path: no towers, let waves leak
    await c.ev("__FGJ__.t('td').reset()");
    for (let w = 0; w < 10 && (await c.ev("__FGJ__.state('td').mode")) !== "lost"; w++) { await c.ev("__FGJ__.t('td').wave()"); await c.ev("__FGJ__.t('td').sim(60)"); }
    td = await J(c, "__FGJ__.state('td')"); check(td.mode === "lost" && td.lives === 0, "TD: undefended castle falls (lose state)", td);
    // win path: fortress build, all 10 waves incl. Golem King
    await c.ev("__FGJ__.t('td').reset(); __FGJ__.t('td').gold(9000)");
    const nT = await c.ev("__FGJ__.t('td').fortress()"); check(nT >= 12, "TD: fortress layout placed", String(nT));
    for (let w = 0; w < 10; w++) { await c.ev("__FGJ__.t('td').wave()"); td = await J(c, "__FGJ__.t('td').sim(120)"); if (td.mode !== "build") break; }
    check(td.mode === "won" && td.wave === 10, "TD: all 10 waves + Golem King -> VICTORY", td);
    await c.ev("__FGJ__.pause(false)");

    // ---- Mini Factory
    await c.ev("__FGJ__.open('factory'); __FGJ__.pause(true); __FGJ__.t('factory').reset()");
    let fa = await J(c, "__FGJ__.state('factory')"); check(fa.goal === 0 && fa.buildings === 0, "Factory: fresh map", fa);
    check(!(await c.ev("__FGJ__.t('factory').place('miner', 8, 8, 0)")), "Factory: miner refuses non-ore tile");
    // hand-built line: miner on iron -> furnace -> belts -> core (row 6)
    await c.ev(`(() => { const t = __FGJ__.t('factory'); t.place('miner', 4, 6 - 2, 0); })()`);
    await c.ev(`(() => { const t = __FGJ__.t('factory'); t.reset(); t.place('miner', 4, 3, 1); t.place('furnace', 4, 4 + 1, 0);
      for (let c = 5; c <= 19; c++) t.place('belt', c, 5, 0); t.place('belt', 4, 4, 1); t.place('belt', 20, 5, 1); })()`);
    fa = await J(c, "__FGJ__.t('factory').sim(30)");
    check(fa.mined >= 10 && (fa.made.iron_plate || 0) >= 10 && (fa.delivered.iron_plate || 0) > 0, "Factory: miner→belt→furnace→belts→core delivers plates", fa);
    check(fa.goal >= 2, "Factory: first two goals complete", fa);
    // drag belts with the mouse
    await c.ev("__FGJ__.t('factory').reset()"); await c.ev("__FGJ__.game('factory').tool = 'belt'");
    await c.ev("__FGJ__.mouse('down', 8*40+20, 9*40+20, 0); __FGJ__.mouse('move', 9*40+20, 9*40+20, 1); __FGJ__.mouse('move', 10*40+20, 9*40+20, 1); __FGJ__.mouse('move', 10*40+20, 10*40+20, 1); __FGJ__.mouse('up', 0, 0, 0)");
    const belts = await J(c, "[[8,9],[9,9],[10,9],[10,10]].map(([x,y]) => __FGJ__.t('factory').at(x,y))");
    check(belts.every((b) => b && b.type === "belt") && belts[0].dir === 0 && belts[2].dir === 1 && belts[3].dir === 1, "Factory: mouse drag lays auto-oriented belts", belts);
    await c.ev("__FGJ__.t('factory').demo()");
    fa = await J(c, "__FGJ__.t('factory').sim(150)");
    check(fa.won && fa.goal === fa.goals && (fa.delivered.robot || 0) >= 3, "Factory: demo factory builds 3 robots -> WIN", fa);
    await c.ev("__FGJ__.pause(false)");

    // ---- CHIP-8
    await c.ev("__FGJ__.open('chip8'); __FGJ__.pause(true)");
    const roms = await c.ev("window.CHIP8_ROMS.length"); check(roms === 3, "CHIP-8: 3 built-in ROMs", String(roms));
    for (let i = 0; i < 3; i++) {
      await c.ev(`__FGJ__.t('chip8').load(${i})`);
      const s = await J(c, "__FGJ__.t('chip8').frames(240)");
      check(!s.error && s.cycles > 5000 && s.lit > 5, `CHIP-8: ROM ${s.rom} runs + draws`, { cycles: s.cycles, lit: s.lit, err: s.error });
    }
    await c.ev("__FGJ__.t('chip8').load(0)"); await c.ev("__FGJ__.t('chip8').frames(60)");
    let y0 = (await J(c, "__FGJ__.state('chip8')")).V[0];
    await c.ev("__FGJ__.t('chip8').press(8, true)"); await c.ev("__FGJ__.t('chip8').frames(20)"); await c.ev("__FGJ__.t('chip8').press(8, false)");
    let y1 = (await J(c, "__FGJ__.state('chip8')")).V[0]; check(y1 > y0, "CHIP-8 Pong: S key moves paddle down", `${y0}->${y1}`);
    await c.ev("__FGJ__.key('w', true)"); await c.ev("__FGJ__.t('chip8').frames(10)"); await c.ev("__FGJ__.key('w', false)");
    let y2 = (await J(c, "__FGJ__.state('chip8')")).V[0]; check(y2 < y1, "CHIP-8 Pong: W via keymap moves paddle up", `${y1}->${y2}`);
    await c.ev("__FGJ__.t('chip8').load(2); __FGJ__.t('chip8').auto(true)");
    let br = await J(c, "__FGJ__.t('chip8').frames(1800)");
    check(br.V[8] >= 10 && !br.error, "CHIP-8 Brix autoplay breaks bricks (score register)", { score: br.V[8], lives: br.V[9] });
    await c.ev("__FGJ__.t('chip8').load(1); __FGJ__.t('chip8').auto(false)");
    let dg = await J(c, "__FGJ__.t('chip8').frames(1800)"); check(dg.V[0xA] >= 3 || dg.waitKey >= 0, "CHIP-8 Rock Dodge scores / reaches game over", { score: dg.V[10], wait: dg.waitKey });
    await c.ev("__FGJ__.pause(false)");

    // ---- Shooter
    await c.ev("__FGJ__.open('shooter'); __FGJ__.pause(true); __FGJ__.t('shooter').reset()");
    let sh = await J(c, "__FGJ__.state('shooter')"); check(sh.mode === "intro", "Shooter: intro screen", sh.mode);
    await c.ev("__FGJ__.key('d', true)"); sh = await J(c, "__FGJ__.t('shooter').sim(0.5)"); await c.ev("__FGJ__.key('d', false)");
    check(sh.mode === "play" && sh.x > 160, "Shooter: D key starts + moves player right", sh);
    sh = await J(c, "__FGJ__.t('shooter').sim(1.8)"); check(sh.foes > 0 && sh.wave === 1, "Shooter: wave 1 spawns", sh);
    await c.ev("__FGJ__.t('shooter').god(true); __FGJ__.t('shooter').auto(true)");
    sh = await J(c, "__FGJ__.t('shooter').sim(25)");
    check(sh.kills > 0, "Shooter: auto-aim shooting kills enemies", sh);
    for (let i = 0; i < 40 && sh.mode === "play"; i++) sh = await J(c, "__FGJ__.t('shooter').sim(3)");
    check(sh.mode === "upgrade" && sh.choices.length === 3, "Shooter: room 1 cleared by play -> 3 upgrade choices", sh);
    await c.ev("__FGJ__.key('1', true)"); sh = await J(c, "__FGJ__.state('shooter')");
    check(sh.mode === "door" && sh.picked.length === 1, "Shooter: key 1 picks upgrade, door opens", sh);
    sh = await J(c, "__FGJ__.t('shooter').walkOut()"); check(sh.room === 2 && sh.mode === "play", "Shooter: walking out the door -> room 2", sh);
    for (let r = 2; r <= 6; r++) { await c.ev("__FGJ__.t('shooter').sim(2.5)"); await c.ev("__FGJ__.t('shooter').killAll()"); sh = await J(c, "__FGJ__.t('shooter').sim(0.2)"); await c.ev("__FGJ__.t('shooter').pick(0)"); sh = await J(c, "__FGJ__.t('shooter').walkOut()"); }
    check(sh.room === 7 && sh.picked.length === 6, "Shooter: rooms 2-6 cleared, 6 upgrades, boss room", sh);
    sh = await J(c, "__FGJ__.t('shooter').sim(3)"); check(sh.boss > 0 && sh.ebullets >= 0, "Shooter: King Gloop spawns", sh);
    sh = await J(c, "__FGJ__.t('shooter').sim(4)"); check(sh.ebullets > 0, "Shooter: boss fires bullet rings", sh);
    await c.ev("__FGJ__.t('shooter').hurtBoss(0.02)");
    for (let i = 0; i < 30 && sh.mode !== "won"; i++) sh = await J(c, "__FGJ__.t('shooter').sim(1)");
    check(sh.mode === "won", "Shooter: boss defeated by gunfire -> VICTORY", sh);
    await c.ev("__FGJ__.t('shooter').reset(); __FGJ__.t('shooter').begin(); __FGJ__.t('shooter').god(false); __FGJ__.t('shooter').auto(false)");
    for (let i = 0; i < 40 && sh.mode !== "dead"; i++) sh = await J(c, "__FGJ__.t('shooter').sim(3)");
    check(sh.mode === "dead", "Shooter: standing still eventually dies (lose state)", sh);
    await c.ev("__FGJ__.pause(false)");

    // ---- live render sanity for each game (rAF loop running, no exceptions)
    for (const id of ids) { await c.ev(`__FGJ__.open('${id}')`); await sleep(250); }
    await c.ev("__FGJ__.hub()"); await sleep(250);
    check(c.errors.length === 0, "no JS errors", c.errors.slice(0, 3).join(" | "));
    check(c.requests.length === 0, "no network requests", c.requests.slice(0, 3).join(" | "));
  } catch (e) {
    check(false, "playthrough threw", String(e).slice(0, 300));
  } finally {
    await c.close();
  }
  const passed = checks.filter((x) => x.ok).length;
  console.log(JSON.stringify({ checks, passed, failed: checks.length - passed }));
}
main();
