"""Generates the Campus Netra DFD Level 0 (context diagram) as SVG.

Notation: Yourdon-DeMarco (external entity = rectangle, process = circle, flow = labelled arrow).
Editable source: change ENTITIES / FLOWS below and run  python build_dfd_level0.py
The label of every flow sits ON its own arrow, so direction and label can never be confused.
"""
import html
import math
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "campusnetra_dfd_level_0.svg"

W, H = 2000, 1440
CX, CY, R = 1000, 720, 205

# key: (label, x, y, width, height)
ENTITIES = {
    "ST":  ("Student / Teacher", 250, 320, 340, 80),
    "TE":  ("Technician", 250, 1120, 340, 80),
    "FM":  ("Facility Manager", 1750, 320, 340, 80),
    "AD":  ("Admin", 1750, 1120, 340, 80),
    "AI":  ("AI Model Service", 1000, 80, 300, 80),
    "IOT": ("IoT Device (ESP32)", 800, 1350, 270, 70),
    "EM":  ("Email Service", 1200, 1350, 250, 70),
}
# (from, to, lines of label, side offset in px, position along the arrow 0..1)
FLOWS = [
    ("ST", "SYS", ["Registration details, login credentials,", "issue details and photos, lost/found", "reports, claims, profile updates"], 82, 0.36),
    ("SYS", "ST", ["Authentication result, issue status,", "notifications, campus and digital twin", "view, lost/found matches"], -82, 0.64),
    ("TE", "SYS", ["Login credentials, work order status updates,", "resolution notes and evidence,", "parts requests, inspection results"], -82, 0.36),
    ("SYS", "TE", ["Assigned work orders, asset", "information, inspection tasks,", "SLA due times"], 82, 0.64),
    ("FM", "SYS", ["Assignment and verification decisions,", "inspection schedules, SLA policies,", "simulation parameters"], -82, 0.36),
    ("SYS", "FM", ["Analytics and SLA reports, predictive", "maintenance forecast, event replay,", "asset health"], 82, 0.64),
    ("AD", "SYS", ["User and role changes, campus structure", "and asset data, IoT device registration"], 82, 0.36),
    ("SYS", "AD", ["Audit log, system reports"], -82, 0.64),
    ("AI", "SYS", ["Category, priority, confidence"], -90, 0.36),
    ("SYS", "AI", ["Issue text and photo", "for classification"], 90, 0.64),
    ("IOT", "SYS", ["Sensor telemetry (current, fan", "rotation, light level, temperature)"], 0, 0.45),
    ("SYS", "EM", ["Verification codes,", "notification emails"], 0, 0.55),
]
# ----------------------------------------------------------------- END DATA

parts = []
def add(s): parts.append(s)

def box_edge(ex, ey, ew, eh, ox, oy, dx, dy):
    """Where the ray (ox,oy)+t*(dx,dy) first meets the rectangle centred at (ex,ey)."""
    x1, x2, y1, y2 = ex - ew / 2, ex + ew / 2, ey - eh / 2, ey + eh / 2
    tmin, tmax = -1e9, 1e9
    for o, d, lo, hi in ((ox, dx, x1, x2), (oy, dy, y1, y2)):
        if abs(d) < 1e-9:
            if o < lo or o > hi: return None
            continue
        ta, tb = (lo - o) / d, (hi - o) / d
        if ta > tb: ta, tb = tb, ta
        tmin, tmax = max(tmin, ta), min(tmax, tb)
    return tmin if tmin <= tmax else None

pos = {k: (v[1], v[2]) for k, v in ENTITIES.items()}
pos["SYS"] = (CX, CY)

def flow_line(a, b, off):
    """Straight arrow between two shapes, shifted sideways by `off` px."""
    (ax, ay), (bx, by) = pos[a], pos[b]
    ent_a = a != "SYS"
    ent = a if ent_a else b
    exy = pos[ent]
    ex, ey, ew, eh = exy[0], exy[1], ENTITIES[ent][3], ENTITIES[ent][4]
    # unit direction centre -> entity, and its normal
    ux, uy = ex - CX, ey - CY
    n = math.hypot(ux, uy); ux, uy = ux / n, uy / n
    px, py = -uy, ux
    # circle end of this lane
    d = off
    cxp = CX + px * d + ux * math.sqrt(max(R * R - d * d, 0))
    cyp = CY + py * d + uy * math.sqrt(max(R * R - d * d, 0))
    # entity end: ray from the circle point towards the entity, stopped at the rectangle edge
    t = box_edge(ex, ey, ew, eh, cxp, cyp, ux, uy)
    exp_, eyp = cxp + ux * t, cyp + uy * t
    return ((exp_, eyp), (cxp, cyp)) if ent_a else ((cxp, cyp), (exp_, eyp))

def label(lines, x, y):
    import textwrap
    lines = textwrap.wrap(' '.join(lines), 30)
    lh = 16
    w = max(len(l) for l in lines) * 6.4 + 12
    h = len(lines) * lh + 8
    add(f'<rect x="{x - w/2:.1f}" y="{y - h/2:.1f}" width="{w:.1f}" height="{h:.1f}" fill="#fff" stroke="none"/>')
    for i, l in enumerate(lines):
        add(f'<text x="{x:.1f}" y="{y - h/2 + 18 + i*lh - 4:.1f}" font-size="12.5" text-anchor="middle" fill="#111">{html.escape(l)}</text>')

# lines first (so labels sit on top of them)
placed = []
for a, b, lines, off, frac in FLOWS:
    (x1, y1), (x2, y2) = flow_line(a, b, off)
    add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="#222" stroke-width="1.5" marker-end="url(#arrow)"/>')
    placed.append((lines, x1 + (x2 - x1) * frac, y1 + (y2 - y1) * frac))
for lines, x, y in placed:
    label(lines, x, y)

# process circle
add(f'<circle cx="{CX}" cy="{CY}" r="{R}" fill="#fff" stroke="#222" stroke-width="2"/>')
add(f'<text x="{CX}" y="{CY - 8}" font-size="24" text-anchor="middle" font-weight="bold">0</text>')
add(f'<text x="{CX}" y="{CY + 22}" font-size="22" text-anchor="middle">Campus Netra</text>')
# entities
for k, (name, x, y, w, h) in ENTITIES.items():
    add(f'<rect x="{x - w/2}" y="{y - h/2}" width="{w}" height="{h}" fill="#fff" stroke="#222" stroke-width="2"/>')
    add(f'<text x="{x}" y="{y + 6}" font-size="17" text-anchor="middle">{html.escape(name)}</text>')

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Arial, Helvetica, sans-serif">'
       '<defs><marker id="arrow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse">'
       '<path d="M0 1 L12 6 L0 11 Z" fill="#222"/></marker></defs>'
       f'<rect width="{W}" height="{H}" fill="#fff"/>' + "".join(parts) + '</svg>')
OUT.write_text(svg, encoding="utf-8")
print("wrote", OUT)
