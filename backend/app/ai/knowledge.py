"""Centralized CampusNetra Knowledge Map for the AI Agent.

This is what backs "how do I..." / "what is..." / "why is..." questions —
distinct from the tools in app/ai/tools.py, which fetch the AUTHENTICATED
USER's actual data. This module is static knowledge about how the product
itself works; the tools are live data about one person's account. A
question needs one, the other, or (often) both — e.g. "why is my complaint
still pending?" needs this module's status-lifecycle knowledge AND a
get_complaint tool call to see which status theirs is actually in.

Every fact below was verified against the real implementation while
writing this (enum values, thresholds, field names — see the inline
references), not assumed from a typical campus-app description. If a
feature listed here ever changes, this file drifts out of date exactly
like a comment can — it is not re-derived automatically. Whoever changes
the underlying behaviour should update the matching entry here too.

Injected as one rendered text block into the agent's system prompt rather
than retrieved piecemeal per question: CampusNetra's actual feature surface,
summarised, is small enough (see render_knowledge()'s output — a few
hundred words) that a real retrieval step (embeddings, a vector store) would
be more infrastructure than the problem calls for at this scale. If the
product grows enough that this block becomes genuinely large, that's the
point to revisit — not before.
"""
from __future__ import annotations

from app.core.config import settings

# ---------------------------------------------------------------------------
# Structured map — one entry per major feature area. Kept as data (not just
# prose) so a future retrieval step, or a "list what you know about X" tool,
# could consume it directly without re-parsing text.
# ---------------------------------------------------------------------------

KNOWLEDGE_MAP: dict[str, dict] = {
    "complaints": {
        "what": (
            "Report a facility problem (a broken projector, an AC not working, a "
            "leaking pipe). Title + description are required; location (campus/"
            "building/floor/room/asset) is optional but strongly recommended — "
            "without it, whoever picks it up has to guess where to go."
        ),
        "who": ["student", "teacher", "technician", "facility_manager", "admin", "super_admin"],
        "where": "\"Report an Issue\" in the app, or ask the AI Assistant to file one",
        "required_fields": ["title", "description"],
        "optional_fields": [
            "campus/building/floor/room/asset (the more specific, the faster it's "
            "actioned)", "category (auto-detected by AI if omitted)",
            "priority (auto-detected by AI if omitted)", "photos", "anonymous flag",
        ],
        "workflow": [
            "reported (just filed)", "triaged (category/priority confirmed)",
            "assigned (a technician is on it)", "in_progress",
            "on_hold (waiting on parts/access/etc.)", "resolved (fix applied)",
            "verified (reporter or manager confirmed the fix)", "closed",
            "rejected / duplicate (folded into an existing report of the same issue)",
        ],
        "sla": (
            "Each issue category has its own resolution-time target. If an issue "
            "is still open past that target, it's marked SLA-breached — this "
            "surfaces on manager/admin dashboards, not something students/teachers "
            "see directly, but it's why some issues get escalated priority."
        ),
        "classification": (
            "AI (or a deterministic fallback if AI is unavailable) auto-picks a "
            "category and priority from the title/description — the reporter can "
            "override either."
        ),
        "duplicates": (
            "New reports are checked against recent open issues; a likely duplicate "
            "is flagged with a suggestion to upvote the existing one instead of "
            "filing a second."
        ),
        "tracking": "\"Track Complaints\" shows status, assignment, and history for the reporter's own reports.",
        "common_problems": [
            "\"Why is my complaint still pending?\" — check its actual current "
            "status via get_complaint rather than assuming; \"reported\"/\"triaged\" "
            "genuinely can sit briefly before assignment, especially outside "
            "business hours.",
            "\"Can I report without knowing the room?\" — yes, location is optional, "
            "though it slows down routing.",
        ],
    },
    "lost_found": {
        "what": (
            "Report something lost, or something found, so the two sides of the "
            "ledger can be matched automatically."
        ),
        "who": ["everyone — same roles as complaints"],
        "where": "\"Lost & Found\" in the app",
        "required_fields": ["kind (lost or found)", "title", "occurred_at (when it went missing/was found)"],
        "optional_fields": ["description", "colour", "brand", "distinguishing marks",
                             "location", "photos", "contact preference"],
        "workflow": ["open", "matched (a candidate found)", "claim_pending",
                     "claimed", "returned", "archived", "expired"],
        "matching": (
            "Every new report is compared against open items on the opposite side "
            "(a new \"found\" against existing \"lost\" reports and vice versa) by "
            "image similarity, description, category, location and timing. A match "
            "at or above 80% confidence sends a notification; the reporter reviews "
            "and either confirms or dismisses each suggested match — nothing is "
            "auto-returned without that confirmation."
        ),
        "common_problems": [
            "\"I found something, what do I do?\" — file it as kind=found with "
            "whatever description/photo is available; the system does the matching "
            "against lost reports automatically, no need to search manually first "
            "(though search_lost_found exists for someone who wants to check first).",
        ],
    },
    "campus_structure": {
        "what": "The physical hierarchy every complaint, asset and Lost & Found location hangs off: Campus -> Building -> Floor -> Room -> Asset.",
        "who": ["everyone views it; only technician/facility_manager/admin/super_admin edit the structure itself"],
        "where": "Digital Twin (\"Campus Map\") for browsing/visualising; Admin -> Campus & Buildings for editing the structure",
        "notes": "An asset's live condition (healthy/warning/fault/under_maintenance/inspection_required) drives its colour on the Digital Twin.",
    },
    "digital_twin": {
        "what": (
            "A live, walk-in 3D view of the whole campus — an outdoor map (when the "
            "campus has a set/cropped location) that drills into buildings, floors, "
            "rooms, and down to individual assets, all coloured by real-time "
            "condition or by complaint density (\"heatmap\" toggle)."
        ),
        "who": ["everyone views; technician/facility_manager/admin can place/move assets"],
        "where": "\"Campus Map\"",
        "workflow": [
            "Outdoor 3D map (if geolocated) or an abstract 3D layout otherwise",
            "click a building -> its floors stacked",
            "click a floor -> its rooms laid out",
            "click a room -> the room itself, walls/ceiling included, with every "
            "asset shown at its real placed position — click empty floor/wall/"
            "ceiling space to place new equipment there",
        ],
        "common_problems": [
            "\"Where's the campus map option?\" — Admin -> \"Campus & Buildings\" -> "
            "\"Edit location\" is where the outdoor map's search-and-crop tool lives, "
            "not the Campus Map page itself, which only displays whatever's been set there.",
        ],
    },
    "notifications": {
        "what": "In-app alerts for things relevant to the user — a complaint status change, a Lost & Found match, an SLA warning for managers, etc.",
        "who": ["everyone — scoped to their own account"],
        "where": "the notification bell in the app header",
        "notes": "Each has a read/unread state and, where relevant, a link straight to the thing it's about (the complaint, the matched item).",
    },
    "dashboards": {
        "what": "A role-appropriate summary screen.",
        "who": ["everyone, but the content differs by role"],
        "roles": {
            "student/teacher": "their own recent reports and their statuses",
            "technician/facility_manager/admin": "campus-wide open-issue counts, SLA breaches, unhealthy assets, recent activity",
        },
        "where": "the home page after login",
    },
    "profile_and_account": {
        "what": "Personal account settings — name, email, phone, password.",
        "who": ["everyone, for their own account"],
        "where": "Profile / Settings",
        "workflow": {
            "change_email": (
                "enter the new address -> a verification code is emailed to it "
                "(via whichever email provider is configured) -> enter that code to "
                "confirm -> the change takes effect only then. A live countdown "
                "shows how long the code is valid for, and it can be resent after a "
                "short cooldown."
            ),
            "change_phone": "same shape as email, but the code arrives by SMS instead.",
            "forgot_password": (
                "works by either email OR phone (not both at once) — a reset code "
                "goes to whichever was chosen, then a new password is set using "
                "that code."
            ),
        },
        "common_problems": [
            "\"I didn't get the code\" — depends entirely on whether the "
            "organization has a working email/SMS provider configured; this is an "
            "admin-side configuration issue, not something the user can fix themselves.",
        ],
    },
    "qr_scanner": {
        "what": (
            "The asset QR scanner. Once signed in, a round QR-code button floats at "
            "the bottom-right of the app, just above the AI Assistant button. Tap it, "
            "allow camera access, and point the back camera at the QR sticker on a "
            "physical asset (a projector, an AC, a fan). CampusNetra then opens "
            "\"Report an Issue\" with that asset's campus, building, floor, room and "
            "asset already filled in, so the person only has to describe the problem "
            "and add a photo. The QR contains just a link to the asset, not its data, "
            "so it stays correct even if the asset is later moved to another room."
        ),
        "who": ["everyone who is signed in"],
        "where": (
            "the floating QR button; the \"Report a complaint\" button on an asset "
            "opened from the Campus Map does the same thing without scanning"
        ),
        "workflow": [
            "tap the QR button", "allow the camera", "point it at the asset's QR code",
            "the report form opens pre-filled for that asset", "describe the problem and submit",
        ],
        "notes": (
            "Only QR codes made by CampusNetra for this campus work; any other QR code "
            "shows \"not a recognised CampusNetra asset code\". The scanner prefers the "
            "back camera and falls back to whatever camera the device has. Camera access "
            "needs the browser's permission. If the user is signed out, they sign in first "
            "and then scan again. Managers and admins create the QR stickers under "
            "Administration -> Assets -> \"Create Asset QR\": search for the asset, "
            "preview it, download the QR image and print it for the physical asset."
        ),
        "common_problems": [
            "\"The scanner does not open the camera\" — the browser's camera permission "
            "was denied; allow it in the browser's site settings and try again.",
            "\"It says not recognised\" — that QR was not generated by CampusNetra, or "
            "belongs to another organisation's asset.",
        ],
    },
    "assets": {
        "what": (
            "Every piece of equipment (projector, AC, fan, lab machine) is an asset with "
            "a unique tag, a place in the Campus -> Building -> Floor -> Room hierarchy, "
            "and a live condition: healthy, warning, fault, under_maintenance, "
            "inspection_required, or decommissioned. The condition follows the "
            "complaint and work-order lifecycle automatically; an asset only returns to "
            "healthy once no other open complaint references it."
        ),
        "who": ["technician, facility_manager, admin, super_admin (the Assets pages); everyone can report against an asset"],
        "where": "\"Assets\" in the sidebar; admins also use Administration -> Asset Registry",
        "notes": (
            "Managers and admins add and edit assets in the Asset Registry, pick a room "
            "to manage its assets, and can replace a dead unit with a new one while the "
            "asset keeps its place, tag and QR code."
        ),
    },
    "work_orders": {
        "what": (
            "A work order is the repair job created from a complaint. When a manager "
            "marks a complaint Assigned, a work order is created with the complaint's "
            "room, asset and priority, and a technician is suggested by matching their "
            "specialisation and how much open work they already have. The technician "
            "accepts it, starts the work, records notes, evidence photos, parts and cost, "
            "and marks it completed; the manager then verifies and closes it."
        ),
        "who": ["technician (their own), facility_manager, admin, super_admin"],
        "where": "\"My Work Orders\" / \"Work Orders\", and the \"Work Board\" for a column view",
        "workflow": [
            "open", "assigned", "accepted", "in_progress",
            "awaiting_parts / on_hold (paused)", "completed (the complaint becomes resolved)",
            "verified", "closed", "cancelled",
        ],
        "notes": "Each work order has an SLA time and is flagged when overdue. Staff can see the history of every step.",
    },
    "inspections": {
        "what": (
            "Scheduled or triggered checks of a room or asset, done as a checklist. Each "
            "item is pass, fail, needs attention or not applicable. A critical failure "
            "automatically raises a complaint so the problem is repaired. Inspections are "
            "also scheduled automatically when sensors confirm something looks wrong."
        ),
        "who": ["technician, facility_manager, admin, super_admin"],
        "where": "\"Inspections\"; admins edit the checklist templates under Administration -> Inspection Checklists",
        "workflow": ["scheduled", "in_progress", "submitted", "approved", "overdue", "cancelled"],
    },
    "iot_health": {
        "what": (
            "Live equipment health from ESP32 sensor devices. An admin registers a device "
            "under Administration -> Health, then assigns it to the room it is installed "
            "in. Its readings arrive continuously; a problem is only acted on after it is "
            "confirmed over several readings, so one noisy reading does not raise an alarm. "
            "A confirmed problem records a health event, marks the asset warning or fault on "
            "the Digital Twin and schedules an inspection. When readings return to normal the "
            "asset recovers on its own. Sensors never create a work order directly; a work "
            "order appears only if the inspection fails."
        ),
        "who": ["admin and super_admin manage devices; staff see the effects on assets and the Digital Twin"],
        "where": "Administration -> Health",
    },
    "predictive_maintenance": {
        "what": (
            "Flags assets likely to fail soon, before they break. Each asset gets a risk "
            "score from five weighted factors: fault history 35%, age 20%, service overdue "
            "20%, time between failures 15%, warranty status 10%. Assets at or above the "
            "0.40 threshold are listed for attention. An asset that is already in fault is "
            "not shown as a prediction, because the problem is present, not predicted."
        ),
        "who": ["admin and super_admin"],
        "where": "Administration -> Predictive Maintenance",
    },
    "analytics_and_simulation": {
        "what": (
            "Analytics shows hotspots, assets that keep failing, team performance and "
            "maintenance cost. Simulation is a what-if tool: enter a number of imaginary "
            "complaints (for example a surge after a storm) to see the projected workload, "
            "technician capacity and SLA impact. Simulated data never touches the live "
            "campus, the Digital Twin or the real analytics."
        ),
        "who": ["facility_manager, admin, super_admin"],
        "where": "\"Analytics\" and \"Simulation\" in the sidebar",
    },
    "event_replay": {
        "what": (
            "Event Replay rebuilds how the whole campus looked at any past moment, step "
            "by step, from the recorded history of asset state changes."
        ),
        "who": ["technician, facility_manager, admin, super_admin"],
        "where": "\"Event Replay\" in the sidebar",
    },
    "search_history_settings": {
        "what": (
            "The search box in the header finds complaints, assets and Lost & Found items "
            "(managers can also find users). History lists the signed-in user's own "
            "activity. Settings holds the theme (light, dark, or match the device) and "
            "notification choices. The Help page explains the basics. The sidebar can be "
            "collapsed to icons, and has a light/dark theme switch at the bottom."
        ),
        "who": ["everyone, for their own account"],
        "where": "header search, \"History\", \"Settings\", \"Help & Support\"",
    },
    "sign_in_and_security": {
        "what": (
            "Sign-in needs email and password plus a picture captcha that CampusNetra "
            "generates itself, with no third-party captcha service. Students, teachers and "
            "technicians sign in on their own role tab. After repeated wrong passwords the "
            "account is locked for a while. Only one active session is allowed per account, "
            "and changing the password signs out every device. New accounts verify their "
            "email with a code, and a forgotten password is reset with a code sent by email "
            "or SMS."
        ),
        "who": ["everyone"],
        "where": "Login, Register, Forgot password",
        "common_problems": [
            "\"Wrong email or password\" — check the role tab and the password; use "
            "\"Forgot password\" to reset it.",
            "\"I did not get the code\" — wait a few minutes and check spam; a new code can be "
            "requested only a few times in a short window.",
        ],
    },
    "roles": {
        "student": "reports complaints and Lost & Found items, tracks their own",
        "teacher": "same access as student",
        "technician": "works assigned complaints as work orders, updates their status; can place/move Digital Twin assets",
        "facility_manager": "campus-wide dashboards, SLA analytics, asset/campus structure management, all of technician's access",
        "admin": "everything facility_manager has, plus user/org management and platform configuration",
        "super_admin": "platform-wide administration across organizations",
    },
}


def render_knowledge() -> str:
    """Compact text form injected into the agent's system prompt."""
    lines: list[str] = []
    for section_name, section in KNOWLEDGE_MAP.items():
        if section_name == "roles":
            # Flat name -> description map, not the what/who/where shape
            # every other section uses — rendered on its own rather than
            # forced through the generic path below.
            lines.append("- Roles and what each can do:")
            for role, desc in section.items():
                lines.append(f"  {role}: {desc}")
            continue

        what = section.get("what", "")
        who = section.get("who")
        where = section.get("where")
        line = f"- {what}"
        if who:
            line += f" Who: {', '.join(who) if isinstance(who, list) else who}."
        if where:
            line += f" Where: {where}."
        lines.append(line)

        for key in ("required_fields", "common_problems"):
            value = section.get(key)
            if value:
                lines.append(f"  {key.replace('_', ' ')}: {'; '.join(value)}")

        # "workflow" is a plain ordered list of stages for most sections, but
        # a name -> description map for profile_and_account (change_email,
        # change_phone, forgot_password aren't sequential stages of one
        # thing) — each rendered the way that shape actually reads.
        workflow = section.get("workflow")
        if isinstance(workflow, list):
            lines.append(f"  workflow: {'; '.join(workflow)}")
        elif isinstance(workflow, dict):
            for k, v in workflow.items():
                lines.append(f"  {k}: {v}")

        for key in ("sla", "classification", "duplicates", "matching", "notes"):
            value = section.get(key)
            if value:
                lines.append(f"  {value}")

        roles_detail = section.get("roles")
        if isinstance(roles_detail, dict):
            for k, v in roles_detail.items():
                lines.append(f"  {k}: {v}")

    return "\n".join(lines)


SUPPORT_FALLBACK = (
    f"I don't have enough verified information to answer that accurately. "
    f"For anything I can't confirm, contact {settings.SUPPORT_EMAIL}."
)
