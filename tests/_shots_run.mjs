// Screenshot tour of Four-Game Jam (1280x800) via window.__FGJ__.
import { pathToFileURL, fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { launch, sleep } from "./cdp.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = pathToFileURL(join(HERE, "..", "dist", "four-game-jam.html")).href;
const OUT = join(HERE, "..", "screenshots");

async function main() {
  const c = await launch({ width: 1280, height: 800, port: 9456 });
  const snap = async (name) => { await c.ev("__FGJ__.redraw()"); await sleep(60); await c.shot(join(OUT, name)); console.log("shot", name); };
  try {
    await c.goto(DIST, 900);
    await sleep(600);
    await c.shot(join(OUT, "00-best-hub.png")); await c.shot(join(OUT, "01-hub.png")); console.log("shot hub");

    // Tower Defense mid-battle: fortress build, run to wave 9 action
    await c.ev("__FGJ__.open('td'); __FGJ__.pause(true); const t=__FGJ__.t('td'); t.reset(); t.gold(1400);");
    await c.ev(`(() => { const t=__FGJ__.t('td'); [['arrow',2,3],['cannon',4,4],['frost',4,7],['zap',7,8],['arrow',9,4],['cannon',12,4],['zap',9,7],['frost',12,8],['arrow',14,4],['cannon',16,8]].forEach(([y,c,r])=>t.place(y,c,r)); t.upgrade(4,4); t.upgrade(7,8); t.upgrade(7,8); t.upgrade(12,4); })()`);
    for (let w = 0; w < 8; w++) { await c.ev("__FGJ__.t('td').gold(2000); __FGJ__.t('td').wave(); __FGJ__.t('td').sim(90)"); }
    await c.ev("__FGJ__.t('td').wave(); __FGJ__.t('td').sim(9.5)");
    await c.ev("__FGJ__.mouse('move', 6*48+24, 5*48+24, 0)");
    await snap("02-tower-defense.png");
    await c.ev("__FGJ__.t('td').sim(200); __FGJ__.t('td').gold(3000); __FGJ__.t('td').fortress(); __FGJ__.t('td').wave(); __FGJ__.t('td').sim(14)");
    await snap("03-td-golem-king.png");
    await c.ev("__FGJ__.pause(false)");

    // Factory: demo running
    await c.ev("__FGJ__.open('factory'); __FGJ__.pause(true); __FGJ__.t('factory').demo(); __FGJ__.t('factory').sim(13)");
    await c.ev("__FGJ__.mouse('move', 10*40+20, 7*40+20, 0)");
    await snap("04-mini-factory.png");
    await c.ev("__FGJ__.t('factory').sim(150)");
    await snap("05-factory-win.png");
    await c.ev("__FGJ__.pause(false)");

    // CHIP-8: Brix autoplay, Pong
    await c.ev("__FGJ__.open('chip8'); __FGJ__.pause(true); __FGJ__.t('chip8').load(2); __FGJ__.t('chip8').auto(true); __FGJ__.t('chip8').frames(900)");
    await c.ev("__FGJ__.game('chip8').update(0.2)");
    await snap("06-chip8-brix.png");
    await c.ev("__FGJ__.t('chip8').load(0); __FGJ__.t('chip8').frames(420)");
    await snap("07-chip8-pong.png");
    await c.ev("__FGJ__.t('chip8').load(1); __FGJ__.t('chip8').frames(400)");
    await snap("08-chip8-dodge.png");
    await c.ev("__FGJ__.t('chip8').auto(false); __FGJ__.pause(false)");

    // Shooter: room 3 firefight, upgrade pick, boss
    await c.ev("__FGJ__.open('shooter'); __FGJ__.pause(true); const s=__FGJ__.t('shooter'); s.reset(); s.begin(); s.god(true); s.auto(true); s.toRoom(4); s.sim(3.2)");
    await c.ev("__FGJ__.t('shooter').keys({w:true}); __FGJ__.t('shooter').sim(0.4); __FGJ__.t('shooter').keys({w:false})");
    await snap("09-shooter-room.png");
    await c.ev("__FGJ__.t('shooter').killAll(); __FGJ__.t('shooter').sim(0.2); __FGJ__.t('shooter').aim(480, 300, false)");
    await snap("10-shooter-upgrade.png");
    await c.ev("__FGJ__.t('shooter').pick(0); __FGJ__.t('shooter').toRoom(7); __FGJ__.t('shooter').sim(6.3)");
    await snap("11-shooter-boss.png");
    await c.ev("__FGJ__.t('shooter').auto(false); __FGJ__.t('shooter').god(false); __FGJ__.pause(false)");
    console.log("shots done");
  } finally { await c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
