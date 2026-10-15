#!/usr/bin/env python3
"""Original CHIP-8 ROMs for the Four-Game Jam arcade, written for this project.
Assembles each source with tools/c8asm.py and writes web/roms.js (byte arrays).
Keypad: W=5 up, S=8 down, A=7 left, D=9 right (arrows map to the same keys).
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from c8asm import assemble

PONG = r"""
; PONG-1P: you (left, W/S) vs the CPU (right). First to 10 resets.
start:
  LD V6, 0
  LD V7, 0
serve:
  CLS
  LD V0, 13
  LD V1, 13
  LD V2, 32
  RND V3, 15
  ADD V3, 8
  LD V4, 1
  RND V9, 1
  SE V9, 0
  LD V4, 0xFF
  CALL rand_dy
  CALL draw_score
  CALL draw_all
  LD V9, 40
  LD DT, V9
serve_wait:
  LD V9, DT
  SE V9, 0
  JP serve_wait
loop:
  LD V9, 2
  LD DT, V9
  CALL draw_all
  LD V9, 5
  SKNP V9
  CALL p_up
  LD V9, 8
  SKNP V9
  CALL p_down
  RND VE, 7
  SE VE, 0
  CALL cpu_move
  ADD V2, V4
  ADD V3, V5
  SNE V3, 0
  LD V5, 1
  SNE V3, 31
  LD V5, 0xFF
  SE V2, 3
  JP no_left
  SE V4, 0xFF
  JP no_left
  LD VA, V3
  SUB VA, V0
  SE VF, 1
  JP no_left
  LD V9, 6
  SUB VA, V9
  SE VF, 0
  JP no_left
  LD V4, 1
  CALL rand_dy
  CALL beep
no_left:
  SE V2, 60
  JP no_right
  SE V4, 1
  JP no_right
  LD VA, V3
  SUB VA, V1
  SE VF, 1
  JP no_right
  LD V9, 6
  SUB VA, V9
  SE VF, 0
  JP no_right
  LD V4, 0xFF
  CALL rand_dy
  CALL beep
no_right:
  SNE V2, 0
  JP cpu_point
  SNE V2, 63
  JP player_point
  CALL draw_all
wait:
  LD V9, DT
  SE V9, 0
  JP wait
  JP loop
cpu_point:
  ADD V7, 1
  JP point_done
player_point:
  ADD V6, 1
point_done:
  LD V9, 12
  LD ST, V9
  SNE V6, 10
  JP start
  SNE V7, 10
  JP start
  JP serve
draw_all:
  LD I, paddle
  LD V9, 2
  DRW V9, V0, 6
  LD V9, 61
  DRW V9, V1, 6
  LD I, ball
  DRW V2, V3, 1
  RET
draw_score:
  LD V9, 22
  LD VA, 1
  LD F, V6
  DRW V9, VA, 5
  LD V9, 38
  LD F, V7
  DRW V9, VA, 5
  RET
p_up:
  LD V9, 2
  LD VA, V0
  SUB VA, V9
  SE VF, 0
  ADD V0, 0xFE
  RET
p_down:
  LD V9, 25
  LD VA, V0
  SUB VA, V9
  SE VF, 1
  ADD V0, 2
  RET
cpu_move:
  LD VA, V1
  ADD VA, 2
  LD VB, V3
  SUB VB, VA
  SE VF, 1
  JP cpu_up
  SNE VB, 0
  RET
  LD V9, 26
  LD VA, V1
  SUB VA, V9
  SE VF, 1
  ADD V1, 1
  RET
cpu_up:
  SE V1, 0
  ADD V1, 0xFF
  RET
rand_dy:
  RND V9, 1
  LD V5, 1
  SE V9, 0
  LD V5, 0xFF
  RET
beep:
  LD V9, 3
  LD ST, V9
  RET
paddle: DB 0x80, 0x80, 0x80, 0x80, 0x80, 0x80
ball: DB 0x80
"""

def dodge_src():
    rocks = [("V4", "V5"), ("V6", "V7"), ("V8", "V9")]
    fall = "\n".join(f"  ADD {y}, 1\n  SNE {y}, 30\n  CALL respawn{i}" for i, (x, y) in enumerate(rocks))
    resp = "\n".join(f"respawn{i}:\n  LD {y}, 0\n  RND {x}, 0x3F\n  JP score_up" for i, (x, y) in enumerate(rocks))
    draw = "\n".join(f"  DRW {x}, {y}, 3" for x, y in rocks)
    return rf"""
; ROCK DODGE: A/D to slide the ship; dodge the falling rocks. Speeds up every 8.
start:
  CLS
  LD V3, 28
  RND V4, 0x1F
  LD V5, 0
  RND V6, 0x3F
  LD V7, 11
  LD V8, 52
  LD V9, 18
  LD VA, 0
  LD VB, 4
  CALL draw_score
  CALL draw_rocks
  CALL draw_ship
loop:
  LD VE, VB
  LD DT, VE
  CALL draw_rocks
  CALL draw_ship
  LD VE, 7
  SKNP VE
  CALL left
  LD VE, 9
  SKNP VE
  CALL right
{fall}
  CALL draw_rocks
  CALL draw_ship
  SE VF, 0
  JP crash
wait:
  LD VE, DT
  SE VE, 0
  JP wait
  JP loop
crash:
  LD VE, 30
  LD ST, VE
  LD VE, 50
  LD DT, VE
cw:
  LD VE, DT
  SE VE, 0
  JP cw
  LD VE, K
  JP start
{resp}
score_up:
  CALL draw_score
  ADD VA, 1
  CALL draw_score
  LD VE, 1
  LD ST, VE
  LD VE, VA
  LD VD, 7
  AND VE, VD
  SE VE, 0
  RET
  SE VB, 1
  ADD VB, 0xFF
  RET
left:
  LD VE, 2
  LD VD, V3
  SUB VD, VE
  SE VF, 0
  ADD V3, 0xFE
  RET
right:
  LD VE, 56
  LD VD, V3
  SUB VD, VE
  SE VF, 1
  ADD V3, 2
  RET
draw_rocks:
  LD I, rock
{draw}
  RET
draw_ship:
  LD I, ship
  LD VE, 28
  DRW V3, VE, 4
  RET
draw_score:
  LD I, bcd
  LD B, VA
  LD V2, [I]
  LD VD, 1
  LD VE, 1
  LD F, V0
  DRW VD, VE, 5
  ADD VD, 5
  LD F, V1
  DRW VD, VE, 5
  ADD VD, 5
  LD F, V2
  DRW VD, VE, 5
  RET
ship: DB 0x18, 0x3C, 0x7E, 0xDB
rock: DB 0x60, 0xF0, 0x60
bcd: DB 0, 0, 0
"""

BRIX = r"""
; BRIX: A/D to move the paddle. Clear all 80 bricks. 3 lives.
start:
  CLS
  LD V8, 0
  LD V9, 3
  CALL draw_bricks
  CALL draw_score
  CALL draw_lives
serve:
  LD VA, 28
  LD VB, 31
  LD VC, 24
  LD VD, 1
  RND V3, 1
  SE V3, 0
  LD VD, 0xFF
  LD VE, 0xFF
  CALL draw_paddle
  LD I, ball
  DRW VB, VC, 1
  LD V3, 40
  LD DT, V3
sw:
  LD V3, DT
  SE V3, 0
  JP sw
loop:
  LD V3, 2
  LD DT, V3
  CALL draw_paddle
  LD V3, 7
  SKNP V3
  CALL left
  LD V3, 9
  SKNP V3
  CALL right
  CALL draw_paddle
  LD I, ball
  DRW VB, VC, 1
  ADD VB, VD
  ADD VC, VE
  SNE VB, 0
  LD VD, 1
  SNE VB, 63
  LD VD, 0xFF
  SNE VC, 6
  LD VE, 1
  SE VC, 29
  JP no_pad
  SE VE, 1
  JP no_pad
  LD V3, VB
  SUB V3, VA
  SE VF, 1
  JP no_pad
  LD V4, 6
  LD V5, V3
  SUB V5, V4
  SE VF, 0
  JP no_pad
  LD VE, 0xFF
  LD VD, 1
  LD V4, 3
  SUB V3, V4
  SE VF, 1
  LD VD, 0xFF
  CALL beep
no_pad:
  SNE VC, 31
  JP lose_life
  LD I, ball
  DRW VB, VC, 1
  SE VF, 1
  JP wait
  LD V3, 20
  LD V4, VC
  SUB V4, V3
  SE VF, 0
  JP wait
  DRW VB, VC, 1
  LD V3, 0xFC
  AND V3, VB
  LD V4, 0xFE
  AND V4, VC
  LD I, brick
  DRW V3, V4, 1
  LD I, ball
  DRW VB, VC, 1
  SNE VE, 1
  JP set_up
  LD VE, 1
  JP flipped
set_up:
  LD VE, 0xFF
flipped:
  CALL draw_score
  ADD V8, 1
  CALL draw_score
  CALL beep
  SNE V8, 80
  JP win
wait:
  LD V3, DT
  SE V3, 0
  JP wait
  JP loop
lose_life:
  CALL draw_lives
  ADD V9, 0xFF
  CALL draw_lives
  LD V3, 20
  LD ST, V3
  CALL draw_paddle
  SE V9, 0
  JP serve
  LD V3, K
  JP start
win:
  LD V3, 40
  LD ST, V3
  LD V3, K
  JP start
draw_bricks:
  LD I, brick
  LD V4, 8
db_row:
  LD V3, 0
db_col:
  DRW V3, V4, 1
  ADD V3, 4
  SE V3, 64
  JP db_col
  ADD V4, 2
  SE V4, 18
  JP db_row
  RET
draw_score:
  LD I, bcd
  LD B, V8
  LD V2, [I]
  LD V3, 1
  LD V4, 0
  LD F, V0
  DRW V3, V4, 5
  ADD V3, 5
  LD F, V1
  DRW V3, V4, 5
  ADD V3, 5
  LD F, V2
  DRW V3, V4, 5
  RET
draw_lives:
  LD V3, 58
  LD V4, 0
  LD F, V9
  DRW V3, V4, 5
  RET
draw_paddle:
  LD I, paddle
  LD V3, 30
  DRW VA, V3, 1
  RET
left:
  LD V3, 2
  LD V4, VA
  SUB V4, V3
  SE VF, 0
  ADD VA, 0xFE
  RET
right:
  LD V3, 57
  LD V4, VA
  SUB V4, V3
  SE VF, 1
  ADD VA, 2
  RET
beep:
  LD V3, 2
  LD ST, V3
  RET
paddle: DB 0xFC
ball: DB 0x80
brick: DB 0xE0
bcd: DB 0, 0, 0
"""

ROMS = [
    {"id": "pong", "name": "PONG-1P", "ipf": 30,
     "keys": "W / S move your paddle (left). Beat the CPU to 10.",
     "blurb": "Classic paddle duel vs a slightly sleepy CPU.", "src": PONG},
    {"id": "dodge", "name": "ROCK DODGE", "ipf": 30,
     "keys": "A / D slide the ship. Any key restarts after a crash.",
     "blurb": "Rocks rain down faster every 8 points.", "src": dodge_src()},
    {"id": "brix", "name": "BRIX", "ipf": 30,
     "keys": "A / D move the paddle. Clear 80 bricks with 3 lives.",
     "blurb": "Breakout-style brick buster.", "src": BRIX},
]


def main():
    out = []
    for r in ROMS:
        data, labels = assemble(r["src"])
        assert len(data) < 3584, r["id"]
        out.append({k: v for k, v in r.items() if k != "src"} | {"bytes": list(data)})
        print(f"{r['id']}: {len(data)} bytes, {len(labels)} labels")
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    js = "// GENERATED by tools/roms.py (original ROMs assembled with tools/c8asm.py). Do not edit.\n"
    js += "window.CHIP8_ROMS = " + json.dumps(out, separators=(",", ":")) + ";\n"
    open(os.path.join(here, "web", "roms.js"), "w").write(js)


if __name__ == "__main__":
    main()
