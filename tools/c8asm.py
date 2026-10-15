#!/usr/bin/env python3
"""Tiny two-pass CHIP-8 assembler (stdlib). Used by tools/roms.py to generate web/roms.js.

Syntax: one instruction per line, ';' comments, 'label:' definitions,
'DB 0x80, 0x80' raw bytes. Mnemonics follow Cowgod's reference
(CLS RET JP CALL SE SNE LD ADD OR AND XOR SUB SHR SUBN SHL RND DRW SKP SKNP).
"""
import re


def _num(tok, labels):
    tok = tok.strip()
    if tok in labels:
        return labels[tok]
    if tok.lower().startswith("0x"):
        return int(tok, 16)
    if tok.lower().startswith("0b"):
        return int(tok, 2)
    if re.fullmatch(r"-?\d+", tok):
        v = int(tok)
        return v & 0xFF if v < 0 else v
    raise ValueError(f"bad number/label: {tok!r}")


def _reg(tok):
    m = re.fullmatch(r"[vV]([0-9a-fA-F])", tok.strip())
    return int(m.group(1), 16) if m else None


def assemble(src, origin=0x200):
    lines = []
    for raw in src.splitlines():
        line = raw.split(";", 1)[0].strip()
        if not line:
            continue
        while ":" in line.split()[0] if line.split() else False:
            lab, line = line.split(":", 1)
            lines.append(("label", lab.strip()))
            line = line.strip()
            if not line:
                break
        if line:
            lines.append(("ins", line))
    # pass 1: sizes
    labels, pc = {}, origin
    for kind, val in lines:
        if kind == "label":
            labels[val] = pc
        else:
            op = val.split(None, 1)[0].upper()
            if op == "DB":
                pc += len([x for x in val.split(None, 1)[1].split(",") if x.strip()])
            else:
                pc += 2
    out = bytearray()
    for kind, val in lines:
        if kind == "label":
            continue
        parts = val.split(None, 1)
        op = parts[0].upper()
        args = [a.strip() for a in parts[1].split(",")] if len(parts) > 1 else []
        if op == "DB":
            out += bytes(_num(a, labels) & 0xFF for a in args if a)
            continue
        out += _encode(op, args, labels).to_bytes(2, "big")
    return bytes(out), labels


def _encode(op, a, L):
    r = [_reg(x) for x in a]
    n = lambda i: _num(a[i], L)
    if op == "CLS": return 0x00E0
    if op == "RET": return 0x00EE
    if op == "JP":
        if len(a) == 2 and r[0] == 0: return 0xB000 | (n(1) & 0xFFF)
        return 0x1000 | (n(0) & 0xFFF)
    if op == "CALL": return 0x2000 | (n(0) & 0xFFF)
    if op in ("SE", "SNE"):
        x = r[0]
        if r[1] is not None:
            return (0x5000 if op == "SE" else 0x9000) | x << 8 | r[1] << 4
        return (0x3000 if op == "SE" else 0x4000) | x << 8 | (n(1) & 0xFF)
    if op == "LD":
        d, s = a[0].upper(), a[1].upper()
        if d == "I": return 0xA000 | (n(1) & 0xFFF)
        if d == "DT": return 0xF015 | r[1] << 8
        if d == "ST": return 0xF018 | r[1] << 8
        if d == "F": return 0xF029 | r[1] << 8
        if d == "B": return 0xF033 | r[1] << 8
        if d == "[I]": return 0xF055 | r[1] << 8
        x = r[0]
        if s == "DT": return 0xF007 | x << 8
        if s == "K": return 0xF00A | x << 8
        if s == "[I]": return 0xF065 | x << 8
        if r[1] is not None: return 0x8000 | x << 8 | r[1] << 4
        return 0x6000 | x << 8 | (n(1) & 0xFF)
    if op == "ADD":
        if a[0].upper() == "I": return 0xF01E | r[1] << 8
        if r[1] is not None: return 0x8004 | r[0] << 8 | r[1] << 4
        return 0x7000 | r[0] << 8 | (n(1) & 0xFF)
    alu = {"OR": 1, "AND": 2, "XOR": 3, "SUB": 5, "SHR": 6, "SUBN": 7, "SHL": 0xE}
    if op in alu:
        y = r[1] if len(r) > 1 and r[1] is not None else r[0]
        return 0x8000 | r[0] << 8 | y << 4 | alu[op]
    if op == "RND": return 0xC000 | r[0] << 8 | (n(1) & 0xFF)
    if op == "DRW": return 0xD000 | r[0] << 8 | r[1] << 4 | (n(2) & 0xF)
    if op == "SKP": return 0xE09E | r[0] << 8
    if op == "SKNP": return 0xE0A1 | r[0] << 8
    raise ValueError(f"unknown op {op} {a}")
