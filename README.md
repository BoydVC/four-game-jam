# Four-Game Jam

One offline cartridge with four real browser games for Char and Vic, all vanilla JS + canvas in a single HTML file.

| # | Game | What it is | Win |
|---|------|-----------|-----|
| 1 | **Castle Crunch** | Tower defense. Archer / Cannon / Frost / Tesla towers, 3 upgrade levels, sell for 70%, 1x/2x/3x speed, auto-wave | Survive 10 waves incl. the **Golem King** |
| 2 | **Robo Works** | Factorio-lite. Miners on ore → belts → furnaces → Gear/Wire/Circuit/Robot makers → Core. Drag to lay auto-oriented belts, R/wheel rotates, right-click erases, "Show demo factory" | 5 goals ending in **3 robots delivered** |
| 3 | **CHIP-8 Arcade** | A real CHIP-8 interpreter (all 35 opcodes, 60 Hz timers, buzzer) with 3 **original** ROMs: PONG-1P, ROCK DODGE, BRIX. Autoplay, 4 phosphor themes, live register view, load your own `.ch8` from disk | Per ROM |
| 4 | **Neon Blaster** | Roguelike top-down shooter: 6 rooms of waves (Blob, Spitter, Dasher, Splitter), pick 1 of 3 power-ups per room, dash i-frames, auto-aim easy mode | Beat **King Gloop** (3 phases) |

Hub: `1`–`4` open a game · `Esc` back to the hub (games resume) · `M` mute (WebAudio synth SFX, no audio files) · best scores saved in localStorage.

## Run

```bash
./run.sh all      # build → screenshots → start server → smoke test → publish to ../out-oct15/
./run.sh start    # http://127.0.0.1:4355  (FGJ_PORT overrides)
./run.sh build|stop|restart|status|shots|test|publish
```

Or just open `dist/four-game-jam.html` directly. It makes zero network requests.

## Layout

- `web/`: `index.html`, `app.css`, `app.js` (hub/loop/input/`window.__FGJ__` test API), `audio.js`, `td.js`, `factory.js`, `chip8.js`, `roms.js` (generated)
- `tools/c8asm.py`: a small two-pass CHIP-8 assembler. `tools/roms.py` holds the ROM sources and writes `web/roms.js` byte arrays (run automatically by `build.py`). `tools/rom_check.mjs` runs each ROM headless in Node.
- `build.py`: inlines everything into `dist/four-game-jam.html` + `dist/index.html`
- `server.py`: stdlib HTTP on 127.0.0.1:4355 with `/healthz`
- `tests/smoke_test.py`: offline checks + Node ROM runs + headless Chrome playthrough (`tests/play.mjs`) of every game's win/lose paths
- `tests/shots.py`: writes the 1280×800 screenshot tour to `screenshots/` (`00-best-hub.png` is the hero)


---
## Repo notes
- **Built:** Oct 2026 (TokenMax build week; see SHORTLIST/ledger), by TokenMax (Boyd's Grok Bot) on the Grok Bot box.
- **Run:** `./run.sh` (then open the localhost URL it prints).
- Imported from `/workspace/tokenmax/four-game-jam` on Oct 23, 2026. node_modules, virtualenvs, logs and files over 20 MB were left out.
