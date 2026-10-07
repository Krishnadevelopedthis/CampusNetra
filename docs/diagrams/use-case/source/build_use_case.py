"""Generates the Campus Netra UML use case diagram as SVG.

Editable source: change the DATA section below and run
    python build_use_case.py
to rewrite ../campusnetra_use_case_diagram.svg (PNG is exported from the SVG with a browser).

Layout: one column of use cases per actor, each column tied to its actor by a
vertical bus line. Actors inherit upward (Admin -> Facility Manager ->
Technician -> Registered User; Student and Teacher -> Registered User), so each
column lists only the use cases that role adds.
"""
import html
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "campusnetra_use_case_diagram.svg"

# ----------------------------------------------------------------- DATA
ROW = 64            # vertical pitch of use cases
NODE_H = 42
TOP = 330           # y of first row inside the system boundary
FONT = 13.5

# column: (x of base node left edge, width, [(label, row, key)])
COLUMNS = {
    "ru": (330, 230, [
        ("Register Account", 0, "register"),
        ("Login", 1, "login"),
        ("Reset Password", 2, None),
        ("Manage Profile", 3, None),
        ("Report Issue", 4, "report"),
        ("Track My Issues", 5, None),
        ("Confirm Existing Issue", 6, None),
        ("Report Lost or Found Item", 7, None),
        ("Browse Items and Matches", 8, None),
        ("Submit Claim", 9, None),
        ("View Campus Map and Digital Twin", 10, None),
    ]),
    "tech": (940, 230, [
        ("View Assigned Work Orders", 0, None),
        ("Update Work Order Status", 1, "update_wo"),
        ("Conduct Inspection", 2, "inspect"),
        ("View Asset Details", 3, None),
        ("Review Lost and Found Matches and Claims", 4, None),
    ]),
    "fm": (1480, 230, [
        ("Assign Work Order to Technician", 0, None),
        ("Verify and Close Work Order", 1, None),
        ("Schedule Inspection", 2, None),
        ("View Asset Health", 3, None),
        ("Replay Past Campus State", 4, None),
        ("Manage Assets", 5, None),
        ("View Analytics", 6, None),
        ("Run Scenario Simulation", 7, None),
        ("View Predictive Maintenance", 8, None),
        ("Configure SLA Policies", 9, None),
    ]),
    "admin": (1760, 230, [
        ("Manage Users and Roles", 0, None),
        ("Manage Campus Structure", 1, None),
        ("Register IoT Device", 2, None),
        ("View Audit Log", 3, None),
    ]),
}
# IoT use cases (own group at the bottom of the Admin column; vertical chain)
IOT = [("Receive Sensor Telemetry", 5.2, "telemetry"),
       ("Detect Asset Fault", 6.4, "detect"),
       ("Schedule Inspection Automatically", 7.6, "auto")]

# sub use cases to the right of a base use case: (label, x, width, row, key, base key, kind)
SUBS = [
    ("Verify Email Code", 610, 190, 0, "verify", "register", "include"),
    ("Classify Issue", 610, 190, 3.55, "classify", "report", "include"),
    ("Detect Duplicate Issue", 610, 190, 4.45, "dup", "report", "include"),
    ("Request Parts", 1220, 190, 1, "parts", "update_wo", "extend"),
    ("Raise Issue from Critical Failure", 1220, 190, 2, "raise", "inspect", "extend"),
]
# ----------------------------------------------------------------- END DATA

def wrap(text, limit=24):
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > limit and cur:
            lines.append(cur); cur = w
        else:
            cur = (cur + " " + w).strip()
    lines.append(cur)
    return lines

W, H = 2260, 1160
parts = []
def add(s): parts.append(s)

def line(x1, y1, x2, y2, dash=False, width=1.3, marker=None):
    d = ' stroke-dasharray="7 5"' if dash else ""
    m = f' marker-end="url(#{marker})"' if marker else ""
    add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="#222" stroke-width="{width}"{d}{m}/>')

def text(x, y, s, size=FONT, anchor="middle", weight="normal", fill="#111"):
    add(f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" text-anchor="{anchor}" font-weight="{weight}" fill="{fill}">{html.escape(s)}</text>')

def ellipse_node(cx, cy, w, label):
    add(f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{w/2:.1f}" ry="{NODE_H/2+4:.1f}" fill="#fff" stroke="#222" stroke-width="1.3"/>')
    ls = wrap(label, 27 if w >= 220 else 22)
    y0 = cy - (len(ls) - 1) * 8 + 5
    for i, l in enumerate(ls):
        text(cx, y0 + i * 16, l, size=12.5)

def actor(cx, y, label, sub=None):
    r = 9
    add(f'<circle cx="{cx}" cy="{y+r}" r="{r}" fill="#fff" stroke="#222" stroke-width="1.5"/>')
    line(cx, y + 2 * r, cx, y + 2 * r + 26, width=1.5)
    line(cx - 17, y + 2 * r + 9, cx + 17, y + 2 * r + 9, width=1.5)
    line(cx, y + 2 * r + 26, cx - 14, y + 2 * r + 46, width=1.5)
    line(cx, y + 2 * r + 26, cx + 14, y + 2 * r + 46, width=1.5)
    for i, l in enumerate(label.split("\n")):
        text(cx, y + 2 * r + 64 + i * 16, l, size=13.5, weight="bold")
    if sub:
        text(cx, y + 2 * r + 64 + len(label.split("\n")) * 16, sub, size=11.5, fill="#444")

nodes = {}   # key -> (cx, cy, w)
def row_y(r): return TOP + r * ROW + NODE_H / 2

# ---- boundary
BX1, BY1, BX2, BY2 = 300, 262, 2060, 1100
add(f'<rect x="{BX1}" y="{BY1}" width="{BX2-BX1}" height="{BY2-BY1}" fill="#fff" stroke="#222" stroke-width="1.6"/>')
text(BX1 + 14, BY1 + 24, "Campus Netra", size=16, anchor="start", weight="bold")

# ---- columns, buses, nodes
col_x = {}
for name, (x, w, items) in COLUMNS.items():
    col_x[name] = (x, w)
    ys = [row_y(r) for _, r, _ in items]
    bus_x = x - 22
    line(bus_x, BY1, bus_x, max(ys))                      # from the actor above down the bus
    for label, r, key in items:
        cy = row_y(r)
        line(bus_x, cy, x, cy)                              # tick to the use case
        ellipse_node(x + w / 2, cy, w, label)
        if key: nodes[key] = (x + w / 2, cy, w)

# IoT chain in the admin column
ax, aw = col_x["admin"]
sep_y = TOP + 4.45 * ROW
line(ax - 40, sep_y, ax + aw + 30, sep_y, dash=True, width=1)
text(ax - 36, sep_y + 18, "IoT telemetry", size=11.5, anchor="start", weight="bold", fill="#444")
for label, r, key in IOT:
    cy = row_y(r)
    ellipse_node(ax + aw / 2, cy, aw, label)
    nodes[key] = (ax + aw / 2, cy, aw)

# ---- sub use cases
for label, x, w, r, key, base, kind in SUBS:
    cy = row_y(r)
    ellipse_node(x + w / 2, cy, w, label)
    nodes[key] = (x + w / 2, cy, w)
    bcx, bcy, bw = nodes[base]
    right_of_base = bcx + bw / 2
    tag = "«include»" if kind == "include" else "«extend»"
    if kind == "include":
        # base -> sub, arrow at the sub
        line(right_of_base - 6, bcy + (cy - bcy) * 0.15, x + 2, cy - (cy - bcy) * 0.0, dash=True, marker="open")
    else:
        # sub -> base, arrow at the base
        line(x - 2, cy, right_of_base + 2, bcy, dash=True, marker="open")
    mx = (right_of_base + x) / 2
    my = (bcy + cy) / 2 + (17 if cy > bcy + 1 else -7)
    text(mx, my, tag, size=11.5, fill="#222")

# IoT vertical relations
def vrel(a, b, kind):
    ax_, ay, aw_ = nodes[a]; bx_, by, bw_ = nodes[b]
    top, bot = (ay + NODE_H / 2 + 4, by - NODE_H / 2 - 4)
    if kind == "include":      # a -> b (downwards)
        line(ax_, top, bx_, bot, dash=True, marker="open")
        text(ax_ + 14, (top + bot) / 2 + 4, "«include»", size=11.5, anchor="start")
    else:                      # a extends b: arrow from a (below) up to b
        line(ax_, ay - NODE_H / 2 - 4, bx_, by + NODE_H / 2 + 4, dash=True, marker="open")
        text(ax_ + 14, (top + bot) / 2 + 4, "«extend»", size=11.5, anchor="start")
vrel("telemetry", "detect", "include")
ax_, ay, _ = nodes["auto"]; bx_, by, _ = nodes["detect"]
line(ax_, ay - NODE_H / 2 - 4, bx_, by + NODE_H / 2 + 4, dash=True, marker="open")
text(ax_ + 14, (ay + by) / 2 + 4, "«extend»", size=11.5, anchor="start")

# ---- actors (top row) and generalisations
RU_X = col_x["ru"][0] - 22
TE_X = col_x["tech"][0] - 22
FM_X = col_x["fm"][0] - 22
AD_X = col_x["admin"][0] - 22
AY = 120
actor(RU_X, AY, "Registered User")
actor(TE_X, AY, "Technician")
actor(FM_X, AY, "Facility Manager")
actor(AD_X, AY, "Admin")
actor(90, 40, "Student")
actor(90, 150, "Teacher")
# actor bus lines already start at the boundary top (BY1); connect heads to boundary
for x in (RU_X, TE_X, FM_X, AD_X):
    line(x, AY + 94, x, BY1)

def gen(x1, y1, x2, y2):
    line(x1, y1, x2, y2, width=1.3, marker="tri")
gen(TE_X - 26, AY + 24, RU_X + 28, AY + 24)       # Technician -> Registered User
gen(FM_X - 26, AY + 24, TE_X + 28, AY + 24)       # Facility Manager -> Technician
gen(AD_X - 26, AY + 24, FM_X + 28, AY + 24)       # Admin -> Facility Manager
gen(90 + 22, 40 + 28, RU_X - 28, AY + 14)         # Student -> Registered User
gen(90 + 22, 150 + 28, RU_X - 28, AY + 30)        # Teacher -> Registered User

# ---- external actors (bottom)
def ext_actor(cx, y, label, sub, key, gutter_x):
    actor(cx, y, label, sub)
    nx, ny, nw = nodes[key]
    line(cx, y - 2, cx, ny)                           # vertical in the gutter
    line(cx, ny, nx + nw / 2, ny)                     # tick into the use case

AI_X = 822
EM_X = 872
nxc, nyc, nwc = nodes["classify"]
nxv, nyv, nwv = nodes["verify"]
actor(EM_X, 1118, "Email\nService", "«external»")
line(EM_X, 1116, EM_X, nyv)
line(EM_X, nyv, nxv + nwv / 2, nyv)
actor(AI_X - 40, 1196, "AI Model\nService", "«external»")
line(AI_X, 1194, AI_X, nyc)
line(AI_X, nyc, nxc + nwc / 2, nyc)
nxt, nyt, nwt = nodes["telemetry"]
IOT_X = 2160
actor(IOT_X, nyt - 38, "IoT Device\n(ESP32)", "«external»")
line(nxt + nwt / 2, nyt, IOT_X - 14, nyt)
H = 1330
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Arial, Helvetica, sans-serif">',
       '<defs>',
       '<marker id="open" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="10" markerHeight="10" orient="auto"><path d="M1 1 L11 6 L1 11" fill="none" stroke="#222" stroke-width="1.4"/></marker>',
       '<marker id="tri" viewBox="0 0 14 14" refX="13" refY="7" markerWidth="12" markerHeight="12" orient="auto"><path d="M1 1 L13 7 L1 13 Z" fill="#fff" stroke="#222" stroke-width="1.4"/></marker>',
       '</defs>', f'<rect width="{W}" height="{H}" fill="#fff"/>'] + parts + ['</svg>']
OUT.write_text("\n".join(svg), encoding="utf-8")
print("wrote", OUT)
