#!/usr/bin/env python3
"""Fit out every room of one or more buildings with the assets a real college
room actually has -- sized by the room's capacity, placed on the floor, the
walls and the ceiling -- using the organization's EXISTING asset categories.

How it differs from scripts/bulk_seed_assets.py: that script creates its own
category codes (FRN, PRJ, ...); this one maps onto the categories already in
the database (furniture, av_equipment, hvac, FAN, LIGHT, it_equipment,
networking, plumbing, fire_safety, electrical, housekeeping, LAB_EQUIPMENT,
CAFETERIA), so reports and the predictive-maintenance admin page group
things the way the rest of the app does. It also gives each asset a purchase
date, warranty, cost and service history, so the predictive-maintenance and
cost screens have something real to show (a share of the electronics are
deliberately past their service date).

Rules of thumb it follows
  * small / low-capacity rooms get few assets, big ones (classrooms, labs,
    staff rooms, halls, auditoria) get many;
  * wall assets sit at a believable height (clock high, socket low, ...) and
    ceiling assets (fans, lights, projector, Wi-Fi, smoke detector) are spread
    so they do not stack on one pin;
  * one room can be marked "minimal" (only fans and lights) to test a sparse
    room -- --minimal-room, default Class-206.

Idempotent: a room that already has any asset is skipped, so it never doubles
up on what you placed by hand, and re-running is safe.

Usage (from the repo root; needs backend/.env with DATABASE_URL):
    python scripts/seed_realistic_assets.py            # dry run, writes nothing
    python scripts/seed_realistic_assets.py --apply    # write it
    python scripts/seed_realistic_assets.py --apply --buildings "Main building"
"""
from __future__ import annotations

import argparse
import asyncio
import math
import os
import random
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
os.chdir(BACKEND)
sys.path.insert(0, str(BACKEND))

from sqlalchemy import text  # noqa: E402

from app.core.database import engine  # noqa: E402

GREEN, YELLOW, DIM, RED, RESET = "\033[32m", "\033[33m", "\033[2m", "\033[31m", "\033[0m"

# ------------------------------------------------------------------ categories
CAT = {
    "furn": "furniture", "av": "av_equipment", "fan": "FAN", "light": "LIGHT", "hvac": "hvac",
    "it": "it_equipment", "net": "networking", "plumb": "plumbing", "fire": "fire_safety",
    "elec": "electrical", "house": "housekeeping", "lab": "LAB_EQUIPMENT", "cafe": "CAFETERIA",
}

# (cost range INR, life months, service interval days or None, warranty months, makers)
CAT_DEFAULTS = {
    "furn":  ((2500, 9000), 144, None, 12, ["Godrej Interio", "Nilkamal", "Featherlite", "Durian"]),
    "av":    ((9000, 85000), 84, 180, 24, ["Epson", "BenQ", "Samsung", "LG", "Bose"]),
    "fan":   ((2200, 4200), 96, 365, 24, ["Havells", "Crompton", "Usha", "Orient"]),
    "light": ((450, 1400), 60, 365, 12, ["Philips", "Syska", "Havells"]),
    "hvac":  ((32000, 55000), 120, 180, 60, ["Daikin", "Voltas", "Blue Star", "LG"]),
    "it":    ((28000, 62000), 60, 180, 36, ["Dell", "HP", "Lenovo"]),
    "net":   ((3500, 22000), 72, 365, 36, ["TP-Link", "Cisco", "D-Link", "Hikvision"]),
    "plumb": ((1800, 9500), 120, 180, 12, ["Hindware", "Jaquar", "Cera"]),
    "fire":  ((1800, 4200), 72, 180, 12, ["Safex", "Ceasefire", "Minimax"]),
    "elec":  ((600, 6500), 96, 365, 12, ["Anchor", "Legrand", "Havells"]),
    "house": ((400, 2500), 48, None, 6, ["Cello", "Nilkamal", "Jaquar"]),
    "lab":   ((4500, 60000), 96, 180, 24, ["Labtech", "Remi", "Olympus"]),
    "cafe":  ((9000, 48000), 96, 180, 24, ["Voltas", "Kent", "Godrej"]),
}

# ------------------------------------------------------------------ geometry
# x = across the room, y = depth (0 = front wall with the board, 1 = back).
ZONES = {
    "all":    (0.10, 0.10, 0.90, 0.90),
    "main":   (0.12, 0.30, 0.88, 0.90),     # student seating
    "front":  (0.12, 0.08, 0.88, 0.24),
    "tbl":    (0.45, 0.08, 0.55, 0.12),     # teacher's / instructor's table
    "chr":    (0.45, 0.16, 0.55, 0.20),     # ... and chair
    "back":   (0.12, 0.84, 0.88, 0.95),
    "left":   (0.04, 0.12, 0.14, 0.92),
    "right":  (0.86, 0.12, 0.96, 0.92),
    "center": (0.35, 0.35, 0.65, 0.65),
    "corner": (0.04, 0.90, 0.10, 0.96),
    "ceil_f": (0.25, 0.25, 0.75, 0.75),     # ceiling fans
    "ceil_l": (0.15, 0.05, 0.85, 0.95),     # lights
    "ceil_c": (0.48, 0.48, 0.52, 0.52),     # one fitting at the middle
    "ceil_p": (0.48, 0.38, 0.52, 0.42),     # projector
    "ceil_w": (0.48, 0.62, 0.52, 0.66),     # Wi-Fi access point
}


def grid(n: int, rect: tuple) -> list[tuple[float, float]]:
    x0, y0, x1, y1 = rect
    w, h = max(x1 - x0, 0.01), max(y1 - y0, 0.01)
    cols = max(1, min(n, round(math.sqrt(n * w / h))))
    rows = math.ceil(n / cols)
    return [
        (round(x0 + w * ((i % cols) + 0.5) / cols, 5), round(y0 + h * ((i // cols) + 0.5) / rows, 5))
        for i in range(n)
    ]


def along_wall(n: int, height: float, x0: float, x1: float) -> list[tuple[float, float]]:
    if n == 1:
        return [(round((x0 + x1) / 2, 5), round(height, 5))]
    return [(round(x0 + (x1 - x0) * i / (n - 1), 5), round(height, 5)) for i in range(n)]


# An item: (key, name, category, qty, surface, at)
#   floor/ceiling: at = zone name from ZONES
#   wall_*:        at = (height 0..1, x_from, x_to)
def I(key, name, cat, qty, surface, at):
    return (key, name, cat, max(0, int(qty)), surface, at)


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


# ------------------------------------------------------------------ room plans
def plan_classroom(cap: int):
    cap = cap or 60
    return [
        I("BNCH", "Student Bench", "furn", clamp(round(cap / 5), 8, 18), "floor", "main"),
        I("TBL", "Teacher's Table", "furn", 1, "floor", "tbl"),
        I("CHR", "Teacher's Chair", "furn", 1, "floor", "chr"),
        I("DBD", "Digital Board", "av", 1, "wall_front", (0.50, 0.72, 0.72)),
        I("WB", "Whiteboard", "furn", 1, "wall_front", (0.50, 0.25, 0.25)),
        I("PRJ", "Projector", "av", 1, "ceiling", "ceil_p"),
        I("SPK", "Wall Speaker", "av", 2, "wall_front", (0.80, 0.08, 0.92)),
        I("FAN", "Ceiling Fan", "fan", clamp(round(cap / 15), 3, 6), "ceiling", "ceil_f"),
        I("TUBE", "Tube Light", "light", clamp(round(cap / 8), 6, 10), "ceiling", "ceil_l"),
        I("WIFI", "Wi-Fi Router", "net", 1, "ceiling", "ceil_w"),
        I("CCTV", "CCTV Security Camera", "net", 1, "wall_back", (0.85, 0.50, 0.50)),
        I("SMK", "Smoke Detector", "fire", 1, "ceiling", "ceil_c"),
        I("FEX", "Fire Extinguisher", "fire", 1, "wall_back", (0.35, 0.88, 0.88)),
        I("SWB", "Electrical Switch Board", "elec", 2, "wall_left", (0.45, 0.15, 0.30)),
        I("SKT", "Power Socket", "elec", 2, "wall_right", (0.30, 0.20, 0.70)),
        I("CLK", "Wall Clock", "elec", 1, "wall_back", (0.80, 0.20, 0.20)),
        I("NTB", "Notice Board", "furn", 1, "wall_right", (0.55, 0.50, 0.50)),
        I("BIN", "Dustbin", "house", 1, "floor", "corner"),
    ]


def plan_minimal(cap: int):
    return [
        I("FAN", "Ceiling Fan", "fan", 2, "ceiling", "ceil_f"),
        I("TUBE", "Tube Light", "light", 2, "ceiling", "ceil_l"),
    ]


def plan_office(cap: int, name: str = ""):
    cap = cap or 10
    seats = clamp(round(cap / 3), 2, 14)
    return [
        I("DESK", "Office Desk", "furn", seats, "floor", "main"),
        I("CHR", "Office Chair", "furn", seats, "floor", "main"),
        I("CAB", "Filing Cabinet", "furn", clamp(round(seats / 2), 1, 6), "floor", "left"),
        I("CUP", "Steel Cupboard", "furn", clamp(round(seats / 3), 1, 4), "floor", "back"),
        I("SOFA", "Visitor Sofa", "furn", 1 if cap >= 8 else 0, "floor", "right"),
        I("PC", "Desktop Computer", "it", clamp(round(seats * 0.8), 1, 12), "floor", "main"),
        I("PRN", "Printer", "it", clamp(round(cap / 20) + 1, 1, 3), "floor", "right"),
        I("AC", "Air Conditioner", "hvac", clamp(round(cap / 15) + 1, 1, 4), "wall_back", (0.82, 0.15, 0.85)),
        I("FAN", "Ceiling Fan", "fan", clamp(round(cap / 8) + 1, 2, 5), "ceiling", "ceil_f"),
        I("TUBE", "Tube Light", "light", clamp(round(cap / 5) + 2, 4, 10), "ceiling", "ceil_l"),
        I("WIFI", "Wi-Fi Router", "net", 1, "ceiling", "ceil_w"),
        I("CCTV", "CCTV Security Camera", "net", 1, "wall_back", (0.90, 0.94, 0.94)),
        I("SMK", "Smoke Detector", "fire", 1, "ceiling", "ceil_c"),
        I("FEX", "Fire Extinguisher", "fire", 1, "wall_back", (0.35, 0.94, 0.94)),
        I("SKT", "Power Socket", "elec", clamp(seats, 2, 8), "wall_left", (0.30, 0.10, 0.90)),
        I("SWB", "Electrical Switch Board", "elec", 2, "wall_right", (0.45, 0.20, 0.35)),
        I("UPS Power Backup", "UPS Power Backup", "elec", 1, "floor", "corner"),
        I("CLK", "Wall Clock", "elec", 1, "wall_front", (0.80, 0.50, 0.50)),
        I("WB", "Notice Board", "furn", 1, "wall_front", (0.55, 0.25, 0.25)),
        I("BIN", "Dustbin", "house", 2, "floor", "corner"),
        I("WC", "Water Dispenser", "plumb", 1 if cap >= 8 else 0, "floor", "center"),
    ]


def plan_lab(cap: int, name: str = ""):
    cap = cap or 40
    computer = "computer" in name.lower()
    n = clamp(round(cap * 0.8), 10, 40)
    base = [
        I("BNCH", "Lab Workbench", "furn", clamp(round(n / 2), 6, 20), "floor", "main"),
        I("STL", "Lab Stool", "furn", n, "floor", "main"),
        I("TBL", "Instructor Table", "furn", 1, "floor", "tbl"),
        I("CHR", "Instructor Chair", "furn", 1, "floor", "chr"),
        I("DBD", "Digital Board", "av", 1, "wall_front", (0.50, 0.65, 0.65)),
        I("WB", "Whiteboard", "furn", 1, "wall_front", (0.50, 0.25, 0.25)),
        I("PRJ", "Projector", "av", 1, "ceiling", "ceil_p"),
        I("FAN", "Ceiling Fan", "fan", clamp(round(cap / 10), 4, 8), "ceiling", "ceil_f"),
        I("TUBE", "Tube Light", "light", clamp(round(cap / 4), 8, 14), "ceiling", "ceil_l"),
        I("WIFI", "Wi-Fi Router", "net", 1, "ceiling", "ceil_w"),
        I("CCTV", "CCTV Security Camera", "net", 2, "wall_back", (0.85, 0.20, 0.80)),
        I("SMK", "Smoke Detector", "fire", 2, "ceiling", "ceil_c"),
        I("FEX", "Fire Extinguisher", "fire", 2, "wall_back", (0.35, 0.05, 0.95)),
        I("SWB", "Electrical Switch Board", "elec", 3, "wall_left", (0.45, 0.15, 0.85)),
        I("SKT", "Power Socket", "elec", clamp(round(n / 2), 6, 14), "wall_right", (0.30, 0.08, 0.92)),
        I("CLK", "Wall Clock", "elec", 1, "wall_back", (0.80, 0.50, 0.50)),
        I("UPS Power Backup", "UPS Power Backup", "elec", 1, "floor", "corner"),
        I("BIN", "Dustbin", "house", 2, "floor", "corner"),
    ]
    if computer:
        return base + [
            I("PC", "Desktop Computer", "it", n, "floor", "main"),
            I("SW", "Internet Network Switch", "net", 2, "wall_back", (0.55, 0.30, 0.70)),
            I("AC", "Air Conditioner", "hvac", 2, "wall_back", (0.82, 0.10, 0.90)),
        ]
    return base + [
        I("SINK", "Lab Sink", "plumb", 2, "floor", "left"),
        I("FUME", "Fume Hood", "lab", 1 if cap >= 40 else 0, "floor", "right"),
        I("MIC", "Microscope", "lab", clamp(round(n / 2), 4, 12), "floor", "main"),
        I("BAL", "Weighing Scale (Lab)", "lab", 3, "floor", "back"),
        I("EYE", "Eye Wash Station", "fire", 1, "wall_left", (0.45, 0.50, 0.50)),
        I("FAID", "First Aid Box", "fire", 1, "wall_right", (0.50, 0.50, 0.50)),
    ]


def plan_hall(cap: int, name: str = ""):
    cap = cap or 100
    seats = clamp(round(cap * 0.5), 30, 60)
    return [
        I("BNCH", "Lecture Bench", "furn", seats, "floor", "main"),
        I("PODM", "Podium", "furn", 1, "floor", "tbl"),
        I("TBL", "Speaker's Table", "furn", 1, "floor", "chr"),
        I("DBD", "Digital Screen", "av", 1, "wall_front", (0.55, 0.50, 0.50)),
        I("PRJ", "Projector", "av", 2, "ceiling", "ceil_p"),
        I("SPK", "Wall Speaker", "av", 4, "wall_front", (0.80, 0.05, 0.95)),
        I("MIC", "Wireless Microphone", "av", 2, "floor", "front"),
        I("AC", "Air Conditioner", "hvac", clamp(round(cap / 40), 2, 4), "wall_back", (0.82, 0.15, 0.85)),
        I("FAN", "Ceiling Fan", "fan", clamp(round(cap / 15), 4, 8), "ceiling", "ceil_f"),
        I("TUBE", "Tube Light", "light", clamp(round(cap / 8), 8, 14), "ceiling", "ceil_l"),
        I("WIFI", "Wi-Fi Router", "net", 2, "ceiling", "ceil_w"),
        I("CCTV", "CCTV Security Camera", "net", 2, "wall_back", (0.85, 0.20, 0.80)),
        I("SMK", "Smoke Detector", "fire", 2, "ceiling", "ceil_c"),
        I("FEX", "Fire Extinguisher", "fire", 2, "wall_back", (0.35, 0.05, 0.95)),
        I("SWB", "Electrical Switch Board", "elec", 2, "wall_left", (0.45, 0.15, 0.30)),
        I("CLK", "Wall Clock", "elec", 1, "wall_back", (0.80, 0.50, 0.50)),
        I("BIN", "Dustbin", "house", 2, "floor", "corner"),
    ]


def plan_auditorium(cap: int, name: str = ""):
    cap = cap or 80
    mini = "mini" in name.lower()
    return [
        I("CHR", "Auditorium Chair", "furn", clamp(round(cap * (0.8 if mini else 0.9)), 30, 70), "floor", "main"),
        I("STG", "Stage Platform", "furn", 1, "floor", "front"),
        I("PODM", "Podium", "furn", 1, "floor", "tbl"),
        I("DBD", "Projection Screen", "av", 1, "wall_front", (0.55, 0.50, 0.50)),
        I("PRJ", "Projector", "av", 1 if mini else 2, "ceiling", "ceil_p"),
        I("SPK", "Public Address Speaker", "av", 4 if mini else 6, "wall_front", (0.80, 0.05, 0.95)),
        I("MIC", "Wireless Microphone", "av", 2 if mini else 4, "floor", "front"),
        I("MIX", "Audio Mixer (Sound Console)", "av", 1, "floor", "back"),
        I("SPOT", "Stage Spot Light", "light", 4 if mini else 8, "ceiling", "ceil_f"),
        I("AC", "Air Conditioner", "hvac", 4 if mini else 6, "wall_back", (0.82, 0.08, 0.92)),
        I("FAN", "Ceiling Fan", "fan", 6 if mini else 8, "ceiling", "ceil_f"),
        I("TUBE", "Tube Light", "light", 8 if mini else 12, "ceiling", "ceil_l"),
        I("WIFI", "Wi-Fi Router", "net", 2, "ceiling", "ceil_w"),
        I("CCTV", "CCTV Security Camera", "net", 2 if mini else 3, "wall_back", (0.85, 0.10, 0.90)),
        I("SMK", "Smoke Detector", "fire", 3, "ceiling", "ceil_c"),
        I("FEX", "Fire Extinguisher", "fire", 3, "wall_back", (0.35, 0.05, 0.95)),
        I("EXIT", "Emergency Exit Sign", "elec", 2, "wall_back", (0.85, 0.05, 0.95)),
        I("SWB", "Electrical Switch Board", "elec", 3, "wall_left", (0.45, 0.15, 0.85)),
        I("UPS Power Backup", "UPS Power Backup", "elec", 1, "floor", "corner"),
        I("BIN", "Dustbin", "house", 3, "floor", "corner"),
    ]


def plan_library(cap: int, name: str = ""):
    cap = cap or 80
    return [
        I("SHF", "Bookshelf", "furn", clamp(round(cap / 6), 6, 16), "floor", "left"),
        I("TBL", "Reading Table", "furn", clamp(round(cap / 10), 4, 10), "floor", "main"),
        I("CHR", "Reading Chair", "furn", clamp(round(cap / 4), 12, 30), "floor", "main"),
        I("DESK", "Librarian Desk", "furn", 1, "floor", "tbl"),
        I("PC", "Catalogue Computer", "it", 3, "floor", "front"),
        I("PRN", "Printer", "it", 1, "floor", "right"),
        I("AC", "Air Conditioner", "hvac", 2, "wall_back", (0.82, 0.25, 0.75)),
        I("FAN", "Ceiling Fan", "fan", clamp(round(cap / 12), 4, 8), "ceiling", "ceil_f"),
        I("TUBE", "Tube Light", "light", clamp(round(cap / 6), 8, 14), "ceiling", "ceil_l"),
        I("WIFI", "Wi-Fi Router", "net", 2, "ceiling", "ceil_w"),
        I("CCTV", "CCTV Security Camera", "net", 2, "wall_back", (0.85, 0.20, 0.80)),
        I("SMK", "Smoke Detector", "fire", 2, "ceiling", "ceil_c"),
        I("FEX", "Fire Extinguisher", "fire", 2, "wall_back", (0.35, 0.05, 0.95)),
        I("SWB", "Electrical Switch Board", "elec", 2, "wall_right", (0.45, 0.20, 0.40)),
        I("SKT", "Power Socket", "elec", 6, "wall_left", (0.30, 0.10, 0.90)),
        I("CLK", "Wall Clock", "elec", 1, "wall_front", (0.80, 0.50, 0.50)),
        I("WC", "Water Dispenser", "plumb", 1, "floor", "corner"),
        I("BIN", "Dustbin", "house", 2, "floor", "corner"),
    ]


def plan_washroom(cap: int, name: str = ""):
    cap = cap or 15
    girls = "girl" in name.lower() or "ladies" in name.lower() or "women" in name.lower()
    stalls = clamp(round(cap / 5), 2, 5)
    return [
        I("BSN", "Wash Basin", "plumb", stalls, "wall_back", (0.55, 0.10, 0.60)),
        I("WC", "Western Toilet", "plumb", stalls, "floor", "main"),
        I("URN", "Urinal", "plumb", 0 if girls else stalls, "wall_left", (0.45, 0.20, 0.80)),
        I("TAP", "Water Tap", "plumb", stalls, "wall_back", (0.62, 0.10, 0.60)),
        I("FLSH", "Flush Tank", "plumb", stalls, "wall_right", (0.75, 0.15, 0.85)),
        I("GEY", "Water Geyser", "plumb", 1, "wall_front", (0.75, 0.50, 0.50)),
        I("MIR", "Mirror", "house", max(1, stalls - 1), "wall_back", (0.82, 0.10, 0.60)),
        I("SOAP", "Soap Dispenser", "house", stalls, "wall_back", (0.68, 0.10, 0.60)),
        I("DRY", "Hand Dryer", "elec", 1, "wall_front", (0.55, 0.20, 0.20)),
        I("EXH", "Exhaust Fan", "fan", 2, "wall_front", (0.85, 0.30, 0.70)),
        I("LIGHT", "LED Light", "light", clamp(stalls, 2, 4), "ceiling", "ceil_l"),
        I("BIN", "Dustbin", "house", 2, "floor", "corner"),
        I("SKT", "Power Socket", "elec", 1, "wall_left", (0.30, 0.50, 0.50)),
    ]


def plan_cafeteria(cap: int, name: str = ""):
    cap = cap or 80
    tables = clamp(round(cap / 6), 6, 16)
    return [
        I("TBL", "Dining Table", "furn", tables, "floor", "main"),
        I("CHR", "Dining Chair", "furn", tables * 4, "floor", "main"),
        I("CNTR", "Serving Counter", "cafe", 1, "floor", "front"),
        I("FRG", "Refrigerator", "cafe", 2, "floor", "left"),
        I("STV", "Gas Stove", "cafe", 3, "floor", "right"),
        I("MWV", "Microwave Oven", "cafe", 1, "floor", "right"),
        I("WPR", "Water Purifier", "plumb", 2, "wall_left", (0.45, 0.30, 0.70)),
        I("SINK", "Kitchen Sink", "plumb", 2, "floor", "back"),
        I("EXH", "Exhaust Fan", "fan", 2, "wall_front", (0.85, 0.20, 0.80)),
        I("FAN", "Ceiling Fan", "fan", clamp(round(cap / 12), 4, 8), "ceiling", "ceil_f"),
        I("TUBE", "Tube Light", "light", clamp(round(cap / 8), 8, 12), "ceiling", "ceil_l"),
        I("CCTV", "CCTV Security Camera", "net", 2, "wall_back", (0.85, 0.20, 0.80)),
        I("SMK", "Smoke Detector", "fire", 2, "ceiling", "ceil_c"),
        I("FEX", "Fire Extinguisher", "fire", 2, "wall_back", (0.35, 0.05, 0.95)),
        I("SWB", "Electrical Switch Board", "elec", 2, "wall_left", (0.45, 0.10, 0.30)),
        I("CLK", "Wall Clock", "elec", 1, "wall_back", (0.80, 0.50, 0.50)),
        I("BIN", "Dustbin", "house", 4, "floor", "corner"),
    ]


def plan_store(cap: int, name: str = ""):
    return [
        I("RACK", "Storage Rack", "furn", 4, "floor", "left"),
        I("CUP", "Steel Cupboard", "furn", 1, "floor", "right"),
        I("LIGHT", "Tube Light", "light", 1, "ceiling", "ceil_c"),
        I("FAN", "Ceiling Fan", "fan", 1, "ceiling", "ceil_f"),
        I("FEX", "Fire Extinguisher", "fire", 1, "wall_back", (0.35, 0.50, 0.50)),
        I("SWB", "Electrical Switch Board", "elec", 1, "wall_left", (0.45, 0.50, 0.50)),
    ]


def plan_utility(cap: int, name: str = ""):
    cap = cap or 30
    return [
        I("SOFA", "Seating Bench", "furn", clamp(round(cap / 6), 3, 6), "floor", "main"),
        I("TBL", "Common Table", "furn", clamp(round(cap / 10), 2, 4), "floor", "center"),
        I("TV", "Wall Mounted TV", "av", 1, "wall_front", (0.55, 0.50, 0.50)),
        I("FAN", "Ceiling Fan", "fan", clamp(round(cap / 10), 2, 4), "ceiling", "ceil_f"),
        I("TUBE", "Tube Light", "light", clamp(round(cap / 6), 3, 6), "ceiling", "ceil_l"),
        I("WIFI", "Wi-Fi Router", "net", 1, "ceiling", "ceil_w"),
        I("CCTV", "CCTV Security Camera", "net", 1, "wall_back", (0.85, 0.50, 0.50)),
        I("FEX", "Fire Extinguisher", "fire", 1, "wall_back", (0.35, 0.90, 0.90)),
        I("SWB", "Electrical Switch Board", "elec", 1, "wall_left", (0.45, 0.50, 0.50)),
        I("BIN", "Dustbin", "house", 1, "floor", "corner"),
    ]


def plan_other(cap: int, name: str = ""):
    cap = cap or 20
    gym = "gym" in name.lower()
    items = [
        I("BNCH", "Bench", "furn", clamp(round(cap / 4), 2, 6), "floor", "left"),
        I("TBL", "Table", "furn", 2, "floor", "main"),
        I("FAN", "Ceiling Fan", "fan", clamp(round(cap / 8), 2, 4), "ceiling", "ceil_f"),
        I("TUBE", "Tube Light", "light", clamp(round(cap / 5), 3, 6), "ceiling", "ceil_l"),
        I("FEX", "Fire Extinguisher", "fire", 1, "wall_back", (0.35, 0.90, 0.90)),
        I("SWB", "Electrical Switch Board", "elec", 1, "wall_left", (0.45, 0.50, 0.50)),
        I("CLK", "Wall Clock", "elec", 1, "wall_front", (0.80, 0.50, 0.50)),
        I("BIN", "Dustbin", "house", 1, "floor", "corner"),
    ]
    if gym:
        items += [I("TT", "Table Tennis Table", "furn", 1, "floor", "center"),
                  I("CAR", "Carrom Board", "furn", 2, "floor", "right"),
                  I("CHSS", "Chess Table", "furn", 2, "floor", "back")]
    return items


def pick_plan(kind: str, name: str, cap: int, minimal: bool):
    if minimal:
        return plan_minimal(cap)
    n = (name or "").lower()
    if "staff" in n or kind == "office":
        return plan_office(cap, name)
    if kind == "classroom":
        return plan_classroom(cap)
    if kind == "laboratory":
        return plan_lab(cap, name)
    if kind == "lecture_hall":
        return plan_hall(cap, name)
    if kind == "auditorium":
        return plan_auditorium(cap, name)
    if kind == "library":
        return plan_library(cap, name)
    if kind == "washroom":
        return plan_washroom(cap, name)
    if kind == "cafeteria":
        return plan_cafeteria(cap, name)
    if kind == "store":
        return plan_store(cap, name)
    if kind == "utility":
        return plan_utility(cap, name)
    return plan_other(cap, name)


# ------------------------------------------------------------------ rows
def slug(code: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "-", code.upper()).strip("-")


def legacy_tag(code: str, key: str, i: int, qty: int) -> str:
    """The cryptic tag the first version of this script gave (kept only so those
    rows can be renamed in place with --rename-existing)."""
    return f"{slug(code)}-{key}-{i:02d}" if qty > 1 else f"{slug(code)}-{key}"


def build_rows(room, plan, cat_ids, today):
    rows = []
    for key, name, cat, qty, surface, at in plan:
        if qty <= 0:
            continue
        if surface.startswith("wall_"):
            height, x0, x1 = at
            positions = along_wall(qty, height, x0, x1)
        else:
            positions = grid(qty, ZONES[at])
        (cost_lo, cost_hi), life, svc, warranty, makers = CAT_DEFAULTS[cat]
        for i, (px, py) in enumerate(positions, start=1):
            label = f"{name} {i}" if qty > 1 else name
            tag = f"{room['code']} {label}"          # e.g. "Class-201 Student Bench 7"
            old_tag = legacy_tag(room["code"], key, i, qty)
            rnd = random.Random(old_tag)               # same dates/costs as the first run
            purchased = today - timedelta(days=rnd.randint(120, 2100))
            cost = round(rnd.uniform(cost_lo, cost_hi) / 50) * 50
            last_service = None
            if svc:
                last_service = datetime.now(timezone.utc) - timedelta(days=rnd.randint(15, int(svc * 1.5)))
            maker = rnd.choice(makers)
            rows.append({
                "rid": room["id"], "cat": cat_ids[CAT[cat]], "tag": tag, "old_tag": old_tag,
                "name": label,
                "px": px, "py": py, "surface": surface,
                "maker": maker, "purchased": purchased,
                "model": f"{(maker or 'GEN')[:3].upper()}-{key}{rnd.randint(100, 999)}",
                "serial": f"SN{purchased.year}{rnd.randint(1000000, 9999999)}",
                "warranty_months": warranty or None,
                "warranty_expiry": (purchased + timedelta(days=30 * warranty)) if warranty else None,
                "cost": cost, "svc": svc, "life": life, "last_service": last_service,
                "amc": round(cost * rnd.uniform(0.03, 0.08)) if svc else None,
            })
    return rows


INSERT = text(
    "INSERT INTO assets (id, room_id, category_id, tag, name, manufacturer, model, serial_no, state, pos_x, pos_y, surface, "
    "purchase_date, warranty_months, warranty_expiry, cost, service_interval_days, expected_life_months, "
    "last_service_at, annual_maintenance_cost) "
    "VALUES (gen_random_uuid(), :rid, :cat, :tag, :name, :maker, :model, :serial, 'healthy', :px, :py, :surface, "
    ":purchased, :warranty_months, :warranty_expiry, :cost, :svc, :life, :last_service, :amc) "
    "ON CONFLICT (tag) DO NOTHING"
)


RENAME = text("UPDATE assets SET tag = :tag, name = :name WHERE tag = :old AND room_id = :rid")


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--buildings", nargs="*", help="Exact building names (default: every building)")
    ap.add_argument("--minimal-room", default="Class-206",
                    help="Room code that gets only fans and lights (default Class-206; '' for none)")
    ap.add_argument("--apply", action="store_true", help="Write changes (default is a dry run)")
    ap.add_argument("--rename-existing", action="store_true",
                    help="Give assets created by the first run readable names/tags instead of adding any")
    args = ap.parse_args()
    today = date.today()
    print(f"{DIM}Mode: {'APPLYING' if args.apply else 'dry run (pass --apply to write)'}{RESET}\n")

    grand = 0
    async with engine.begin() as conn:
        bq = ("SELECT b.id, b.name, c.organization_id FROM buildings b JOIN campuses c ON c.id = b.campus_id "
              + ("WHERE b.name = ANY(:n) " if args.buildings else "") + "ORDER BY b.name")
        buildings = (await conn.execute(text(bq), {"n": args.buildings} if args.buildings else {})).mappings().all()
        if not buildings:
            print(f"{RED}No buildings found.{RESET}")
            return 1

        cat_cache: dict = {}
        for b in buildings:
            org = b["organization_id"]
            if org not in cat_cache:
                got = {r["code"]: r["id"] for r in (await conn.execute(
                    text("SELECT id, code FROM asset_categories WHERE organization_id = :o"), {"o": org})).mappings()}
                missing = [c for c in CAT.values() if c not in got]
                if missing:
                    print(f"{RED}Organization {org} is missing categories: {missing}{RESET}")
                    return 1
                cat_cache[org] = got

            rooms = (await conn.execute(text(
                "SELECT r.id, r.code, r.name, r.kind::text AS kind, r.capacity, f.level FROM rooms r "
                "JOIN floors f ON f.id = r.floor_id WHERE f.building_id = :b ORDER BY f.level, r.code"),
                {"b": b["id"]})).mappings().all()
            if not rooms:
                print(f"=== {b['name']}: no rooms yet, nothing to do ===\n")
                continue

            print(f"=== {b['name']} ===")
            subtotal = 0
            for room in rooms:
                if args.rename_existing:
                    minimal = bool(args.minimal_room) and room["code"] == args.minimal_room
                    plan = pick_plan(room["kind"], room["name"], room["capacity"], minimal)
                    rows = build_rows(room, plan, cat_cache[org], today)
                    tags = [r["tag"] for r in rows]
                    if len(set(tags)) != len(tags):
                        print(f"{RED}  {room['code']}: duplicate new tags, skipped{RESET}")
                        continue
                    n = 0
                    if args.apply:
                        for r in rows:
                            res = await conn.execute(RENAME, {"old": r["old_tag"], "tag": r["tag"], "name": r["name"], "rid": r["rid"]})
                            n += res.rowcount
                    else:
                        n = len(rows)
                    subtotal += n
                    continue
                have = (await conn.execute(text("SELECT count(*) FROM assets WHERE room_id = :r"),
                                           {"r": room["id"]})).scalar()
                if have:
                    print(f"  - {room['code']}: already has {have} asset(s), skipped")
                    continue
                minimal = bool(args.minimal_room) and room["code"] == args.minimal_room
                plan = pick_plan(room["kind"], room["name"], room["capacity"], minimal)
                rows = build_rows(room, plan, cat_cache[org], today)
                if args.apply and rows:
                    await conn.execute(INSERT, rows)
                subtotal += len(rows)
                tag = " (MINIMAL: fans + lights only)" if minimal else ""
                print(f"  + F{room['level']} {room['code']:<18} {room['kind']:<12} cap {str(room['capacity'] or '-'):>4}"
                      f"  -> {len(rows):>3} assets{tag}")
            print(f"  {GREEN}{b['name']}: {subtotal} assets{RESET}\n")
            grand += subtotal

        if args.apply:
            real = (await conn.execute(text("SELECT count(*) FROM assets"))).scalar()
            print(f"{GREEN}Done. Planned {grand}; assets table now holds {real}.{RESET}")
            if real != grand:
                print(f"{YELLOW}Counts differ -- some tags collided and were skipped; investigate.{RESET}")
        else:
            print(f"{DIM}Would add {grand} assets. Re-run with --apply to write.{RESET}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
