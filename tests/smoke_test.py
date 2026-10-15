#!/usr/bin/env python3
"""Four-Game Jam smoke test.
1. Builds the offline snapshot and checks it is self-contained (no external URLs/tags/fetches).
2. CHIP-8 ROM sanity in Node (tools/rom_check.mjs): each original ROM runs fault-free.
3. Headless Chrome playthrough (tests/play.mjs via CDP): hub routing, Esc/M, then every game:
   Tower Defense build/upgrade/sell/wave/lose/win, Factory chain + drag belts + robot win,
   CHIP-8 three ROMs + input + autoplay, Shooter move/shoot/upgrade/rooms/boss/win/lose.
4. Optional: if the server is running on FGJ_PORT, checks /healthz and /.
Usage: python3 tests/smoke_test.py   (or ./run.sh test)
"""
import json, os, re, subprocess, sys, time, urllib.request

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(HERE, "dist", "four-game-jam.html")
PORT = int(os.environ.get("FGJ_PORT", "4355"))
RES = []


def check(ok, msg, info=""):
    RES.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + msg + (f"  [{info}]" if info and not ok else ""), flush=True)


def main():
    print(f"Four-Game Jam smoke test · {time.strftime('%Y-%m-%d %H:%M %Z')}", flush=True)
    subprocess.run([sys.executable, os.path.join(HERE, "build.py")], check=True, capture_output=True)
    html = open(DIST, encoding="utf-8").read()
    size = os.path.getsize(DIST)
    check(size > 80000, f"offline snapshot built ({size:,} bytes)")
    check(open(os.path.join(HERE, "dist", "index.html"), encoding="utf-8").read() == html, "dist/index.html is an identical copy")
    check(html.count("<style>") == 1 and html.count("<script>") == 7, "CSS + 7 scripts inlined (audio, roms, chip8, td, factory, shooter, app)")
    bad = re.findall(r'<(?:script|link|img|iframe|source)[^>]+(?:src|href)\s*=\s*["\'](?!data:)[^"\']+', html, re.I)
    check(not bad, "no external script/link/img tags", str(bad[:3]))
    urls = [u for u in re.findall(r"https?://[^\s\"'<>)]+", html) if "w3.org" not in u]
    check(not urls, "no external http(s) URLs", str(urls[:3]))
    check(not re.search(r"\bfetch\(|XMLHttpRequest|new WebSocket|importScripts", html), "no network APIs used by the game")
    check("CHIP8_ROMS" in html and html.count('"id":"') >= 3, "CHIP-8 ROMs embedded as byte arrays")
    for name in ("Castle Crunch", "Robo Works", "CHIP-8 Arcade", "Neon Blaster"):
        check(name in html, f"game present: {name}")

    r = subprocess.run(["node", os.path.join(HERE, "tools", "rom_check.mjs")], capture_output=True, text=True, cwd=HERE, timeout=60)
    try:
        roms = json.loads(r.stdout)
        for k, v in roms.items():
            check(not v["error"] and v["cycles"] > 50000 and v["maxLit"] > 10, f"node ROM run: {k} ({v['cycles']:,} cycles, no fault)", str(v)[:200])
    except Exception as e:
        check(False, "rom_check.mjs JSON", (r.stdout + r.stderr)[-400:])

    print("headless Chrome playthrough (tests/play.mjs) ...", flush=True)
    t0 = time.time()
    r = subprocess.run(["node", "--experimental-websocket", os.path.join(HERE, "tests", "play.mjs")],
                       capture_output=True, text=True, timeout=240, cwd=HERE)
    out = None
    for line in reversed(r.stdout.strip().splitlines()):
        if line.strip().startswith("{"):
            try:
                out = json.loads(line); break
            except Exception:
                pass
    if not out:
        check(False, "play.mjs produced JSON", (r.stdout + r.stderr)[-800:])
    else:
        for c in out.get("checks", []):
            check(c.get("ok"), "browser: " + c.get("msg", "?"), c.get("info", "")[:300])
    print(f"     play took {time.time() - t0:.1f}s", flush=True)

    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/healthz", timeout=2) as h:
            ok = json.loads(h.read()).get("ok")
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/", timeout=2) as h:
            body = h.read().decode()
        check(ok and "Four-Game Jam" in body, f"server on :{PORT} serves /healthz and the game")
    except Exception:
        print(f"SKIP server checks (nothing on :{PORT})", flush=True)

    shots = os.path.join(HERE, "screenshots")
    pngs = [f for f in os.listdir(shots) if f.endswith(".png")] if os.path.isdir(shots) else []
    if pngs:
        best = [f for f in pngs if f.startswith("00-best")]
        check(bool(best) and len(pngs) >= 5, f"screenshots: {len(pngs)} incl. hero {','.join(best)}")

    n, p = len(RES), sum(RES)
    print(f"RESULT: {p}/{n} checks passed" + ("" if p == n else f" ({n - p} FAILED)"), flush=True)
    sys.exit(0 if p == n else 1)


if __name__ == "__main__":
    main()
