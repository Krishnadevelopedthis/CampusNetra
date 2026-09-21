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
