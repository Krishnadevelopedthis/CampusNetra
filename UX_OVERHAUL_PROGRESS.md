# CampusNetra UX/Feature Overhaul — Progress

Tracks the 40-item spec (logo cleanup → global search → profile/OTP →
Lost & Found workflow → campus map → responsiveness/accessibility/security
audit). Work happens **1–2 items at a time**, verified against a fresh
`git clone` + `npm run build`/`eslint` each session — not against memory of
a previous summary. Update this file at the end of every session before
stopping, even if a change is only partially done.

Numbering below matches the original spec's numbered sections exactly, so
either doc can be cross-referenced by number.

## Session log
- **Session 1**: synced to latest `origin/main` (`85be98a`), confirmed the
  10-minute inactivity timeout from the previous session (`319cc7c`) is
  safely merged in. Implemented item **#34**. Investigated and left notes
  for **#1** and **#22** (see below) rather than guessing at a UI bug I
  can't see rendered.
- **Session 2** (this one, same conversation as Session 1 — re-verify
  `origin/main` at the *start* of any future session regardless, per "How
  to resume" below): replaced the removed sidebar AI Assistant with a
  floating chat-bubble widget per the user's explicit follow-up request
  (not originally item #34's literal ask, but directly requested after
  #34 landed). Also implemented item **#12** (table density had no real
  effect anywhere).

## Done
- **#34 — Remove AI Assistant from sidebar.** (as before)
- **Floating AI Assistant widget** (follow-up to #34, user-requested):
  replaced the deleted side-drawer panel with
  `frontend/src/features/assistant/AssistantWidget.jsx` — a self-contained
  floating action button fixed to the bottom-right corner (`bottom-5
  right-4` on mobile, `bottom-6 right-6` on desktop, `z-40`, clear of the
  toast layer at `z-50`). Clicking it opens the chat: an anchored card
  above the button on desktop (`sm:` and up), a near-full-height bottom
  sheet on mobile — the standard Intercom/Crisp-style pattern the request
  asked for. Recovered the original panel's chat logic verbatim from git
  history (`git show` on the commit that last had it) rather than
  reinventing it — same `POST /ai/assistant` call, same suggestions/typing
  indicator/message bubbles, same `Escape`-to-close and focus handling,
  now just presented as a corner widget instead of a full-height drawer.
  No backend changes; `backend/app/api/v1/ai.py`'s `/assistant` route was
  never touched by the #34 removal. Mounted once in `AppLayout.jsx`
  (authenticated shell only, matching where it lived before) with no
  props — it owns its own open/closed state. Body-scroll is locked while
  open (matches the existing `Modal` component's convention) so the
  mobile bottom-sheet doesn't fight the page behind it for scroll.
  Build + lint clean.
- **#12 — Table density**: the Settings page control existed and *saved*
  correctly (`PATCH /auth/me` → `preferences.display.density`), but
  nothing ever read it — a real dead toggle, exactly as the spec
  describes. Fixed by applying it the same way the adjacent
  `reduce_motion` setting already does it (a global attribute on
  `<html>`), which turned out to have the *same* underlying bug:
  `Settings.jsx`'s effect only ran while that page itself was mounted, so
  even reduced motion silently stopped applying the moment you navigated
  away. Fixed both together:
  - `App.jsx`: new effect syncing `document.documentElement`'s
    `reduce-motion` class and `data-density` attribute from the actual
    *saved* `user.preferences.display` — runs app-wide, on boot/login, not
    just while Settings is open.
  - `Settings.jsx`: kept its own local-`prefs`-driven version of the same
    effect for **live preview** while editing, before the Save button is
    clicked (this was the existing, deliberate behavior for
    `reduce_motion` — "a preference about discomfort should take effect
    the moment it is set" — now extended to density too).
  - `styles/index.css`: `html[data-density="compact"] .table:not(.table-compact) tbody td/tr`
    — reuses the compact padding values the codebase already had (a
    `.table-compact` class was already hand-applied to a handful of
    always-dense metadata tables in Analytics/Admin pages). The `:not()`
    deliberately leaves those alone — they're an intentional "always
    dense" design choice, not something the user's "Comfortable" pick
    should override — while every *other* `.table` in the app (issue
    lists, work-order lists, asset lists, etc.) now actually responds to
    the setting.
  Build clean; lint clean (confirmed the 4 pre-existing `Settings.jsx`
  warnings — unused `Bell`/`SUPPORT_EMAIL`/`user` param, one stale
  eslint-disable — predate this change by diffing against `git stash`).

## Needs a screenshot / clarification before touching (do NOT guess-fix these)
- **#1 — Logo duplicate text / duplicated "1"**: `components/Logo.jsx` and
  `logo-dark.svg`/`logo-light.svg` were inspected — the SVGs contain no
  `<text>` elements and no stray "1" character; `<Logo>` renders exactly
  one icon (`LogoMark`) + one "Campus Netra" text label, used consistently
  via the same shared component in `AppLayout.jsx`, `landing/Navbar.jsx`,
  `landing/Footer.jsx`, `features/auth/AuthShell.jsx`, and
  `pages/errors/ErrorPage.jsx` — i.e. it's already a single unified
  component everywhere, not several inconsistent ones. Whatever duplicate
  text/stray "1" the spec describes isn't visible from the source alone —
  it may be a runtime rendering artifact (e.g. two `<Logo>` instances
  overlapping at a specific breakpoint, or a leftover browser-tab
  favicon/title issue) that needs an actual screenshot of the bug to
  diagnose correctly instead of guessing and possibly breaking the
  already-correct shared-component structure.
- **#22 — "Affected Thumb" field**: repo-wide case-insensitive grep across
  frontend + backend for `affected.thumb`/`affectedthumb` found nothing.
  Either it's already been renamed/removed by an earlier session, or the
  actual on-screen label differs from this exact wording. Needs the exact
  page/screen it appears on (or a screenshot) before searching further —
  grepping for guessed variations risks missing it entirely or editing the
  wrong field.

## Not started (grouped by area, roughly spec order)

### Layout / navigation
- #2 Search bar / sidebar height alignment
- #3 + #4 Global search (Complaints + Lost & Found, single search bar,
  result-type separation, loading/empty/error states)
- #5 Notification panel + popover responsiveness/positioning audit
- #6 Contextual search scoping on My Profile

### Profile
- #7 Display full registration data on My Profile — start by diffing
  `RegisterRequest` schema (`backend/app/schemas/auth.py`) against what
  `pages/Profile.jsx` currently renders
- #8 OTP verification for name/phone/email updates — phone-change OTP
  flow already exists (see prior `PROGRESS.md`: "Profile: phone via
  request → OTP → confirm"); check whether email-change already has the
  same, and whether name-change (OCR-based, also already partially built
  per `PROGRESS.md`) needs the OTP step added on top of the existing ID-match step
- #9 Name-change ID card verification + name-field validation — `services/id_verification.py`
  and `POST /auth/me/change-name` already exist per prior `PROGRESS.md`;
  audit against this spec's exact requirements (OCR-confidence rejection
  message, numeric/special-character rejection) rather than rebuilding
- #10 ID card OCR — extract course/class/etc, not just name — extend
  `services/id_verification.py`
- #11 Profile picture persistence — likely already fixed as part of the
  Backblaze/R2 storage work earlier this session (images now come from
  `/api/v1/uploads/file/...`, not a bucket URL or wiped local disk) —
  verify specifically for avatars (`purpose=avatar` in `uploads.py`)
  rather than assuming

### Settings
- #13 Full settings audit — notification toggles (in-app vs email) tied
  to real backend events

### Reports
- #14 Weekly summary PDF + email
- #15 Request a copy of data (export)
- #16 Delete account flow

### Complaint reporting
- #17 Campus → Building → Floor → Room → Asset navigation switch
- #18 "Not Sure / Other" manual location entry path
- #19 Evidence/photo upload on report flow + success popup with complaint number
- #20 `CN` + 9-alphanumeric complaint ID format (backend-generated)
- #21 Complaint detail page + status timeline driven by real history, not
  hardcoded stages

### Lost & Found
- #23 KPI card hierarchy (primary + 2 secondary)
- #24 Detail view with image carousel/zoom
- #25 `LF` + alphanumeric identifiers
- #26 Contact disclosure (authorized parties only)
- #27 Match/claim workflow
- #28 Handover declaration form

### Cross-cutting
- #29 KPI card visual hierarchy audit (Dashboard/Reports/Complaints/L&F/SLA)
- #30 + #31 Campus map: click-through details + health/fault status per building/floor/room
- #32 Duplicate/similar-fault admin merge workflow
- #33 Class/lab health status summary
- #35 + #36 New "History" sidebar page, clickable through to original records
- #37 Responsive audit at the specific listed breakpoints
- #38 Accessibility audit
- #39 Security audit (IDOR checks on profile/complaint/L&F endpoints,
  server-side enforcement of everything currently only checked client-side)
- #40 Final regression pass across all of the above

## How to resume
Pick 1–2 unstarted items (prefer ones in the same area to avoid
re-reading unrelated code each time), re-clone/pull `origin/main` fresh
first — don't assume a prior session's file reads are still current, this
repo has multiple sessions/tools committing to it directly. Update this
file's "Session log" and move the item(s) from "Not started" to "Done"
(or to the "needs clarification" list, with the specific missing
information named) before ending the session.
