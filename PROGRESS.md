# Security & Verification Hardening — Progress

Tracks: verified email/phone/name changes, 7-digit IDs everywhere, and
CAPTCHA on login + forgot-password — plus two unrelated fixes (S3 upload
persistence, campus map floor-count reset, loader animation) that landed
in the same window from a separate report.

Verified directly against `origin/main` (`git log`/`git show`, not any
pasted summary) up through `10879ca`; this commit adds the one piece that
really was still missing.

## Already true before this work started
- Email change already required OTP verification.
- `RegisterRequest.enrollment_no`/`.employee_id` already enforced exactly
  7 digits — but only on self-registration.

## Done (backend)
- `core/config.py`: `CAPTCHA_EXPIRE_MINUTES`, `SMS_PROVIDER` slot,
  `NAME_MATCH_THRESHOLD`, `sms_delivers`/`expose_dev_phone_codes`.
- `core/security.py`: stateless JWT CAPTCHA, **plus single-use
  enforcement** (`_spent_captchas`) — a solved image no longer covers
  unlimited password guesses.
- `services/id_verification.py`: OCR + name matching, **plus
  `contains_identifier()`** — the account's own enrollment/employee number
  must also appear on the card, not just a matching name.
- `models/identity.py` + `database/migrations/012_name_change_requests.sql`:
  `NameChangeRequest`, mirroring `AccountDeletionRequest`.
- `schemas/auth.py`: `validate_seven_digit_id()`; captcha fields on
  `LoginRequest`/`ForgotPasswordRequest`; phone-change and name-change
  schemas. `UpdateProfileRequest` no longer accepts `full_name`/`phone`.
- `api/v1/auth.py`: `GET /auth/captcha`; captcha required on login/forgot-
  password; `POST /auth/me/change-phone` + `/verify-phone-change`; `POST
  /auth/me/change-name` (multipart) — requires both a confident name match
  *and* the ID-number match before auto-applying; upload stored privately.
- `api/v1/admin.py`: `UserCreate`/`UserUpdate` enforce 7 digits;
  `UserUpdate` accepts phone/employee_id/enrollment_no; `GET
  /admin/name-change-requests`, `.../approve`, `.../reject`, `GET
  .../{id}/document` (private ID photo, same-organisation admins only).
- `services/storage.py`: `store_image(..., private=True)` → a
  `private-uploads/` directory that's a *sibling* of the `/media`-served
  one, not a subfolder — no mount arrangement exposes it. Extended to work
  on both local and S3 backends via `read_private_bytes()`.
- `services/auth.py`: fixed a real brute-force hole — the wrong-code
  `attempts` counter was incremented on the same DB transaction a bad code
  then rolled back, so it never actually moved. Now an atomic
  `UPDATE ... SET attempts = attempts + 1` on its own connection.
- `requirements.txt`: `pytesseract` (Tesseract's binary is a separate
  system package) + `boto3` (lazy-imported, not a hard dependency locally).

## Done (frontend)
- **Login / Forgot password**: `features/auth/useCaptcha.js` +
  `CaptchaField` in `features/auth/LoginParts.jsx`, wired into both pages
  and `lib/auth.js`'s `login()`. The dead `useLoginForm.js` hook (never
  wired to anything — `Login.jsx` didn't use it) was deleted.
- **Register**: enrollment/employee ID hint fixed "six digits" → "seven".
- **Profile**: phone via request → OTP → confirm; full name via an
  ID-upload flow; shows "In review" instead of allowing a second submit
  while one is pending. `PATCH /auth/me` no longer used for name/phone.
- **Admin → Users**: create/edit forms take 7-digit IDs and expose
  phone/enrollment/employee_id for editing. **"Name change requests"
  review widget** (this commit) — mirrors the existing "Account deletion
  requests" one: previous → requested name, match score, OCR excerpt, and
  the ID photo via a new `fetchAuthedBlob()` helper in `lib/api.js` (a
  private document needs an `Authorization` header a plain `<img>` can't
  send, so it's fetched and shown as a revoked-on-unmount object URL).
- `components/ui/BrandLoader.jsx`: eye-motif loading animation, wired into
  `App.jsx`'s boot-loading states. Blink `transform-origin` fixed (was
  pivoting 80 units from the actual pupil inside an already-translated
  group).
- `components/ui/Avatar`: fixed a stuck-on-initials bug — a failed image
  load's `failed` flag never reset when `src` changed, so one transient
  blip permanently hid a perfectly good `avatar_url`.
- `AdminCampus.jsx`: no longer sends a fabricated `floors_count` when
  editing an existing building (only when creating one).

## Done — uploads & campus map (separate report, same window)
- **Uploaded photos disappearing over time** — real: `services/storage.py`
  only wrote to local disk, and this repo has no `Dockerfile` (built for a
  buildpack-style host), most of which wipe local disk on redeploy/restart.
  Fixed with a pluggable backend, `STORAGE_BACKEND=local|s3` (default
  `local`, so nothing breaks unconfigured). **Scanned the diff for
  hardcoded secrets — none; everything reads from env vars with
  empty-string defaults.** Still needs a real bucket (Cloudflare R2 /
  Backblaze B2 both have workable free tiers) configured via those env
  vars on whichever host runs this — the code change alone persists
  nothing yet.
- **Campus map "no buildings positioned"** — `campus_overview` never
  returned a building's `floors_count`; editing re-saved the form with a
  default of `1`, silently resetting it. Fixed both sides. **Not confirmed
  as the full explanation** — if buildings still don't show up, check
  whether `map_x`/`map_y` (0–1, no visual picker) were left blank.

## Not done yet
- `services/sms.py` — no real SMS path; phone-change OTP only works via
  the dev-code-in-response fallback until a provider is chosen.
- No automated tests added for any of the above.
- No `Dockerfile`; Tesseract's system binary must be installed separately
  wherever this runs (degrades gracefully to manual review without it).
- `STORAGE_BACKEND=s3` needs real bucket credentials set on the host, or
  uploads keep using local disk.

## A note on process — corrected
An earlier version of this file (committed at `10879ca`) said a pasted
recap's claims about a captcha single-use guard, an ID-number cross-check,
and a verification-attempts-counter fix "don't exist on the real main."
That was wrong, or at least stale by the time it was written: `git log`
against the live repo shows all three genuinely landed, authored by Hardik
Mandal, before either of the two `Claude`-authored commits that follow
them in this same history. The one part of that recap that really was
unpushed — the admin review widget — is the piece this commit adds.

### Deploy notes (matters wherever this actually runs)
- No `Dockerfile` exists in this repo — it looks like it's meant for a
  buildpack-style host (Render/Railway/etc., matching the SMTP-vs-HTTP-API
  comment already in `config.py`). **Tesseract OCR needs its system
  binary installed on whatever host runs the backend** — that's outside
  what `requirements.txt` can do. If the host doesn't support a system
  package/buildpack for this, `services/id_verification.py` degrades
  gracefully (`OcrUnavailable` → every name-change request queues for
  manual admin review instead of auto-approving), so the feature still
  works, just without the auto-approve shortcut.

## Design notes for whoever (human or Claude) continues this

- CAPTCHA is deliberately stateless (JWT, no DB row) — don't add a table
  for it.
- Phone-change reuses the `phone_verify` `VerificationCode.purpose` value,
  which existed in the DB check constraint but was never used by any
  code path. No new purpose/migration was needed.
- Name-change is *not* OTP-based — there's nothing to send a code to. It's
  modeled after `AccountDeletionRequest`: a request row, an OCR-derived
  confidence score, auto-decide above a threshold, else a human decides.
  Don't try to force it into the OTP flow shape.
- `UpdateProfileRequest` losing `full_name`/`phone` is an intentional
  breaking change to the API contract — the frontend absolutely needs the
  two items above done together, or profile editing partially breaks.

## Addendum — eye loader + avatar-persistence fix (separate small ask)

Two independent, additive UI fixes layered on top of the work above — no
overlap with the identity-verification/CAPTCHA changes, safe to read on
their own:

- **`components/ui/BrandLoader.jsx` (new)**: full-page loading animation
  based on the Uiverse.io "Nawsome" CSS loader (see `styles/index.css`,
  the `.pl__*` rules), with the original's two hand-tick arrows replaced by
  an eye at the centre — "Netra" is Sanskrit/Hindi for "eye". Wired into
  `App.jsx`'s `RequireAuth`/`PublicOnly` boot-loading states in place of the
  plain `Spinner` that was there before. `Spinner` is untouched and still
  used for the route-level `Suspense` fallback and everywhere else.
- **Avatar-persistence bug, fixed**: `components/ui/Avatar` tracked an
  `onError` image-load failure in a `failed` flag that never reset when
  `src` changed. One failed load (e.g. a transient blip during the
  `user: null → new user` re-render that happens across logout/login)
  permanently stuck the avatar on its initials fallback — even once a
  perfectly good `avatar_url` came back from the server. The upload itself
  was never the bug; `avatar_url` was always persisted correctly via
  `PATCH /auth/me`. Fixed with `useEffect(() => setFailed(false), [src])`.

## Addendum — photo persistence, campus map, and loader animation (this session)

Three separate reports, verified and fixed independently in this session
(started from the real `main` @ `602ebb2` — confirmed via `git log
origin/main`, not assumed from any pasted summary).

- **Uploaded photos disappearing over time** — confirmed real. Root cause:
  `services/storage.py` only ever wrote uploads to local disk
  (`UPLOAD_DIR`), and this repo has no `Dockerfile`, meaning it's built for
  a buildpack-style host (Render/Railway/etc.) — most of which wipe local
  disk on every redeploy or restart. Fixed by adding a pluggable
  S3-compatible backend:
  - `core/config.py`: `STORAGE_BACKEND` (already existed as an unused enum
    value — nothing ever implemented the "s3" branch) now has real
    `S3_BUCKET`/`S3_REGION`/`S3_ENDPOINT_URL`/`S3_ACCESS_KEY_ID`/
    `S3_SECRET_ACCESS_KEY`/`S3_PUBLIC_BASE_URL` settings behind it, plus a
    validator that refuses to boot with `STORAGE_BACKEND=s3` and no
    credentials.
  - `services/storage.py`: rewritten so `store_image()` only produces bytes
    and hands them to `_write_object()`/`_read_object()`/`_public_url()` —
    local-disk or S3, everything above that line is unaware which one is
    active. `private_file()` kept (local-only) for any caller that
    specifically wants a `FileResponse` path; new `read_private_bytes()`
    works with either backend.
  - `requirements.txt`: added `boto3` (only imported lazily, so it's not a
    hard dependency for local-only deployments).
  - `api/v1/admin.py`'s ID-card-serving route switched from
    `FileResponse(private_file(...))` to `Response(read_private_bytes(...))`
    so it works on both backends.
  - **This is necessary but not sufficient** — `STORAGE_BACKEND` still
    defaults to `"local"`. Nothing actually persists until an S3-compatible
    bucket (Cloudflare R2 / Backblaze B2 both have workable free tiers) is
    configured via the new env vars on whatever host runs this.

- **Campus map "No buildings positioned"** — found and fixed one confirmed,
  real bug: `campus_overview` (`api/v1/campus.py`) never selected/returned a
  building's `floors_count`. `AdminCampus.jsx`'s edit-building form is
  populated straight from that overview response, and its save payload
  defaulted `floors_count` to `1` when the field was missing — so **every
  edit to an existing building, including just adding map coordinates,
  silently reset its floor count back to 1**. Fixed on both sides:
  `campus_overview` now selects and returns `floors_count`; `update_building`
  now applies `payload.model_dump(exclude_unset=True)` instead of a full
  dump, and the frontend's `body()` helper no longer sends a fabricated
  `floors_count` at all when editing (only when creating).
  **Not fully confirmed as the cause of this specific report** — could not
  inspect the live database. If buildings still don't appear after this
  ships, the next thing to check is whether `map_x`/`map_y` were actually
  left blank when the buildings were created (the 0–1 coordinate fields have
  no visual picker and are easy to skip).

- **Eye loader looked static** — confirmed real bug, not a missing feature:
  `.pl__eye-lid` (styles/index.css) sits inside an SVG group already
  transformed with `translate(80,80)`, so its own `transform-origin: 80px
  80px` was pivoting the blink scale around a point 80 units away from the
  actual pupil — the animation was running, just invisibly. Changed to
  `transform-origin: 0 0`, correct for that group's local coordinate space.
  Also redrew the eye in `BrandLoader.jsx` to match the actual logo mark's
  almond-eye + roofline shape (`components/Logo.jsx`) instead of a generic
  eye glyph, per the request to look more "real" and on-brand.

(The note on process a pasted recap's claims here has already been
corrected above — see "A note on process — corrected." Leaving one
version, not two, since they disagree and the corrected one is right.)

---

## Session addendum (continuing from commit 10879ca)

Verified `main` was at `10879ca` before touching anything — that commit
already contains the S3 storage backend, the `floors_count` reset fix, and
the loader-blink fix described above. A later chat transcript (pasted into
a different session, not this repo) claimed additional S3 fixes — removing
a broken `ACL="public-read"` write, a fallback public-URL builder, and env
docs — had been "verified" but that session ran out of turns before
committing them. None of that was actually on `main`; confirmed by reading
`storage.py` directly rather than trusting the transcript. Same caution as
last time: verify against the real repo, not a pasted summary, including
this one.

What was actually still missing, now fixed here:

- **`services/storage.py`: removed `ACL="public-read"` from the S3
  `put_object` call.** Every AWS bucket created since April 2023 has ACLs
  disabled by default, so this failed outright on any bucket someone
  actually created recently. Public access for the `public/` prefix should
  come from a bucket policy instead (example added to `.env.example`).
  Private objects (ID cards) were never affected — they were never given a
  public ACL — but the code path that could is gone entirely now, not just
  unused.
- **`services/storage.py`: `_public_url()` no longer returns a broken
  host-less path when `S3_PUBLIC_BASE_URL` is blank.** It now falls back to
  `<endpoint>/<bucket>/<key>` when `S3_ENDPOINT_URL` is set (R2/B2/Spaces),
  or `https://<bucket>.s3.<region>.amazonaws.com/<key>` for plain AWS S3.
  Verified against a mocked S3 client for all three cases (explicit base
  URL, endpoint fallback, AWS default fallback) plus confirmed the
  `put_object` call no longer carries an `ACL` kwarg.
- **`backend/.env.example`: added the S3 section that was missing
  entirely** — what each `S3_*` var does, which are required once
  `STORAGE_BACKEND=s3` is set, endpoint examples for R2/B2/Spaces, and the
  bucket-policy JSON needed for public reads (scoped to `public/*` only).
  `boto3` was already in `requirements.txt` from the earlier commit — that
  part didn't need redoing.
- **Campus map "No buildings positioned" — this was NOT actually fixed
  yet**, despite being described as done in the pasted transcript.
  `CampusMap.jsx` still filtered out any building missing `map_x`/`map_y`
  and showed the empty state as soon as zero buildings had coordinates,
  even if buildings existed. Added `layoutBuildings()`: buildings without
  coordinates are now auto-arranged in a grid (columns = ceil(sqrt(n)))
  instead of being dropped, so the map shows every building that exists.
  Buildings an admin has actually positioned keep their exact spot
  untouched — only the ones missing coordinates get the auto grid. A note
  appears above the map naming how many buildings are auto-positioned and
  pointing to Campus Management for exact placement. The empty state now
  only shows when there are truly zero buildings, with different copy
  ("No buildings yet — add one in Campus Management") since "no buildings
  positioned" was misleading once auto-layout exists.
- **Removed `frontend/dist/` from git tracking.** It was committed as a
  build artifact despite `dist/` being in `.gitignore` (four files,
  tracked since an old commit before the ignore rule existed). Left the
  ignore rule as-is; just untracked the files with `git rm --cached`.

Verified: backend imports cleanly (`python -m py_compile` equivalent via
`ast.parse` across `app/`), the S3 URL-fallback and ACL-removal logic
tested directly against a mocked `boto3` client (all cases pass), frontend
`npm run build` succeeds, and `npm run lint` reports only pre-existing
warnings (0 errors), none in `CampusMap.jsx`.

Not done / still open:
- `STORAGE_BACKEND` still defaults to `"local"` — nothing persists to S3
  until an actual bucket + credentials are set via the new env vars on
  whatever host runs this (Render's env settings, not committed anywhere).
- The bucket policy documented in `.env.example` still needs to be applied
  by hand on whichever bucket is actually used; this repo can't do that.
- No automated test suite exists in this repo (`backend/` has no
  `test_*.py` files), so all verification above was manual/scripted rather
  than via `pytest`.

## Addendum 3 — Resend misdiagnosis fix, and a real 3D campus map

Two new, unrelated reports this round: (1) `/auth/me/change-email` returning
503 "Resend rejected the API key" even with a correct `RESEND_API_KEY`, and
(2) a request to actually build the 3D campus map — `three` had been sitting
in `package.json` as a dependency since some earlier point, unused anywhere
in the codebase. Checked directly rather than assuming either was already
handled; neither was.

- **Resend 503 despite a correct key — found and fixed the actual bug.**
  `_send_resend()`'s status-code handling checked `if resp.status_code in
  (401, 403): return "...rejected the API key..."` *before* the branch meant
  to catch domain-verification failures, which Resend also reports as 403.
  Every 403 was swallowed by the first branch, so an unverified sending
  domain — the far more likely cause once a key is confirmed correct, and
  the default `RESEND_FROM` here is `noreply@campusnetra.dpdns.org`, a
  domain that would need its own DNS records verified with Resend — got
  reported as a bad API key. Reordered so 401 alone means "bad key", 403 (or
  any status whose message mentions "domain"/"verify") gets the accurate
  domain-verification message with the DNS/onboarding@resend.dev guidance.
  Also fixed `_no_sender_error()`, which hardcoded "SMTP_FROM" in its
  message even when called from the Resend path (should say `RESEND_FROM`).
  Verified against a mocked Resend API: a 403 domain-not-verified response no
  longer mentions the API key at all; a genuine 401 still does.
  **If the 503 persists after this**: it means the domain genuinely isn't
  verified yet — check the Resend dashboard's Domains tab, or switch
  `RESEND_FROM` to `onboarding@resend.dev` as a temporary unblock (Resend
  only allows that address to send to the account owner's own inbox, so it
  only works for testing, not real users).

- **3D campus map — actually built, not just a dependency.** New
  `frontend/src/features/campus3d/Campus3DView.jsx` using
  `@react-three/fiber` + `@react-three/drei` (added as dependencies; `three`
  itself was already there but unused). Buildings render as extruded boxes —
  height scaled to floor count, colour following the exact same rule as the
  2D map (condition colour or heat colour, same legend), same world
  positions via the existing `map_x`/`map_y` fields and `layoutBuildings()`
  auto-layout — so 2D and 3D always agree on where a building sits. Orbit
  controls for rotate/pan/zoom, a ground grid, code labels billboarded to
  face the camera, and a hover contract identical to the 2D view's
  (`onHover(building-with-heat | null)`) so the existing info panel below the
  map works unchanged for both. `CampusMap.jsx` gained a 2D/3D toggle next to
  the existing condition/heat one; clicking a building in 3D opens its first
  floor in the Digital Twin, same as clicking a room chip does in 2D.
  `Campus3DView` is lazy-loaded (`React.lazy`) into its own chunk — it pulls
  in three.js, which is a genuinely large dependency — so people who never
  open the 3D view never download it; confirmed as a separate ~970 kB chunk
  in the build output, not merged into the main bundle.

Verified: backend `email.py` change compiles, imports, and its Resend
status-code logic was tested directly against a mocked Resend API (403
domain-error case and 401 bad-key case both produce the correct, distinct
message — this is the fix that actually matters here, so it got an explicit
test rather than just "the file imports"). Frontend builds and lints clean;
the 3D chunk code-splits as intended. No headless-browser/WebGL renderer was
available in this environment to smoke-test the actual Three.js scene
mounting, so the 3D view's runtime behavior (not just its build) is unverified
beyond careful review against the react-three-fiber/drei v8/v9 APIs used —
worth an actual click-through in a browser before calling this fully done.

Not done / still open:
- The 3D scene has not been visually verified in a real browser.
- Nothing about the S3/storage or floors_count items from addenda 1–2 was
  touched this round; they stand as previously verified.

## Addendum 4 — full building → floor → room → asset drilldown, real report PDFs

Follow-up request: make building clicks (2D and 3D) open a real drilldown
instead of jumping straight to a floor, give buildings actual architectural
detail (windows) rather than plain colour blocks, add a 3D per-room view
with an asset table, and make the asset report actually downloadable.

- **Building → floor → room drilldown**: new
  `frontend/src/features/campus3d/BuildingDrilldown.jsx`, two chained
  Modals (floor picker, then room picker) fed entirely from data already
  loaded by the campus overview query — no new endpoints needed. Wired into
  both `Campus3DView`'s building click and the 2D SVG map's building-shell
  click (`CampusMap.jsx`'s `BuildingBlock` gained an `onOpenBuilding` prop
  on its outer `<g>`; existing room-chip clicks still `stopPropagation()`
  so they keep going straight to `/twin/:floorId` unchanged — this is an
  addition, not a replacement, for the 2D view).
- **Windows on 3D buildings**: found this already in progress in
  `Campus3DView.jsx`'s working tree when this round started (a `WindowGrid`
  helper, neutral wall colour, status colour moved to a roof cap + base
  ring instead of tinting the whole volume, a base plinth) — reviewed it,
  it's sound, kept it as-is rather than redoing it.
- **Real 3D room view**: new `frontend/src/features/campus3d/RoomScene3D.jsx`
  + new page `frontend/src/pages/RoomView3D.jsx` at route `/rooms/:roomId`.
  Renders the room as a floor + four low walls (open-topped, so the default
  orbit angle can actually see into it) sized to the room's own aspect
  ratio (derived from its `boundary` bounding box — the boundary itself is
  in floor-plan coordinates and not usable directly, only its aspect ratio
  is). Assets are placed using their real `pos_x`/`pos_y` (the same
  room-local 0..1 convention the existing 2D floor plan already uses per
  `FloorPlan.jsx`), coloured by condition, clickable through to
  `/assets/:id`. Below the 3D view, a full data table (tag, name, category,
  manufacturer/model, condition, warranty, cost) sourced from
  `GET /campus/rooms/{id}` + `GET /campus/rooms/{id}/assets` +
  `GET /campus/asset-categories` — all pre-existing endpoints, nothing
  added on the backend. Route gated the same as `/assets/:id` and `/twin`
  (technician/facility_manager/admin/super_admin) — students/teachers can
  still browse the floor/room picker to see names and condition, but the
  "open" action is disabled for them with an inline explanation, since cost
  and maintenance data isn't shown to non-staff anywhere else in the app
  either; extending that boundary to a new page seemed like the wrong place
  to quietly change it.
- **Downloadable asset report**: `AssetDetail.jsx` gained a "Download
  report" button that builds a real PDF client-side (specification,
  lifecycle/cost, full maintenance history, condition history) using
  `jspdf` (newly installed). Import is dynamic (`await import('jspdf')`
  inside the click handler) rather than static — a static import pulled
  jsPDF's ~390KB into the AssetDetail page chunk itself (17KB → 402KB),
  which every staff member visiting any asset would pay for whether or not
  they ever click the button; lazy-loading brought the page chunk back to
  ~12KB and put jsPDF in its own chunk that only loads on click. Verified
  the actual jsPDF calls used (multi-line text, coloured text, right-aligned
  columns, page-break handling) against a real jsPDF instance in Node —
  produces a valid PDF, not just "the import resolves".

Verified this round: `npm run build` and `npm run lint` clean (0 errors,
only pre-existing warnings, none in touched files) after all of the above;
confirmed via the build's own chunk-size output that `Campus3DView`,
`RoomScene3D`, and `jspdf` are each separate lazy chunks, and that three.js
itself is now a single chunk shared between the two 3D features rather than
duplicated. The jsPDF report-building calls were exercised directly in Node
against the real library (not mocked) and produce a valid PDF buffer.

Not done / still open:
- Still no headless browser available in this environment — none of the
  three 3D scenes (campus view, per-room view) or the drilldown modals have
  been clicked through in an actual browser this round either. Build/lint
  passing and library calls checked directly is real signal, but it is not
  the same as having looked at it.
- The generated PDF's actual visual layout (column alignment, page breaks
  on assets with long maintenance histories) hasn't been eyeballed as a
  rendered document, only confirmed to generate without throwing.

## Addendum 5 — admin review widget for name-change requests

The one piece flagged as still missing after everything above: the
backend has had approve/reject endpoints for name-change requests since
early in this file's history, but the admin panel had no screen to use
them from. Added, mirroring the existing "Account deletion requests"
widget: previous → requested name, match score, OCR excerpt, and the
submitted ID photo via a new `fetchAuthedBlob()` helper in `lib/api.js`
(the photo is private now, not on the public `/media` mount, so a plain
`<img src>` can't attach the `Authorization` header an authenticated
fetch can). `npm run build` verified clean at the time this was written,
against `main` @ `10879ca` — rebased onto everything above without
conflict in the actual code (`lib/api.js`, `AdminUsers.jsx`), only in
this file, since both sides had been narrating the same stretch of time.

## Addendum 6 — Financo/GreenSpring retheme (light + dark)

Request: restyle the whole app to match two reference screenshots — a
light fintech dashboard (warm off-white, black primary actions, one vivid
orange accent) for light mode, and a dark course-platform (near-black
ground, bright lime accent, violet secondary) for dark mode — without
touching functionality, and with working hover states and responsiveness.

Found `frontend/src/styles/theme.css` already rewritten for exactly this,
sitting uncommitted in the sandbox — not something built this round.
Reviewed it rather than redoing it: every color in `tailwind.config.js`
already resolves to a CSS variable defined there per theme (light block in
`:root`, dark block in `:root[data-theme='dark']`), so a theme really is
just a value swap — no component needs to know which theme is active. The
existing `.btn-*` classes in `index.css` already use the `-600`/`-700`
token steps for base/hover, so hover states come along for free and read
as "the same color, slightly deeper" rather than a different color
entirely. `AuthShell.jsx` (Login/Register/Forgot-password) already
matches the reference's split dark-panel/white-form layout, responsively
(`md:grid`, stacks on mobile). Semantic status colors (success/warning/
danger/info) were deliberately left unchanged — they were already
accessible and match on both old and new looks.

What was actually still broken: a handful of hardcoded hex colors outside
the token system, which a value-swap in `theme.css` can't reach because
they're not variables:
- `AdminOverview.jsx` and `AdminPredictive.jsx`: a `<Metric accent="#1e1b4b">`
  each — the old indigo primary, verbatim, sitting next to the new warm
  palette. Changed to `accent="rgb(var(--c-primary))"`, which *is* a
  variable reference, so it now actually follows the active theme instead
  of being frozen on the old brand.
- `ColorThemeSwitcher.jsx` (the per-user custom-accent picker, separate
  from light/dark mode): its "Reset" button and hex-input placeholder were
  both still `#1e1b4b`. Changed to `#f4602a` — the new light-theme accent
  — so resetting your personal accent color returns you to the actual
  current brand default, not the retired one.
- Left the semantic chart-color hex codes alone
  (`#10b981`/`#f59e0b`/`#ef4444`/`#3b82f6`/`#8b5cf6`) across
  `AdminSystem.jsx`/`AdminAI.jsx`/`AdminLostFound.jsx`/`WorkOrderBoard.jsx`
  — checked each against the token values and they already match
  success/warning/danger/info/twin-inspection exactly, so there was
  nothing to fix there.
- `npm install` was needed before any of this would build — `node_modules`
  in this sandbox predated the 3D/PDF dependencies from Addenda 3–4.

Verified: `npm run build` succeeds (jsdom/jspdf/three chunks all present,
same chunk-size warning as noted in Addendum 4, unrelated to this change).
No component logic, routes, API calls, or data flow were touched — every
edit in this addendum is either a CSS variable file or a color-prop value.

Not done / still open:
- **Not visually verified in an actual browser** — no headless
  browser/screenshot tool available in this environment, same limitation
  noted for the 3D work in Addendum 3–4. The build compiling and the token
  chain being traced by hand is real signal, but isn't the same as having
  looked at both themes rendered.
- Responsiveness: `AuthShell` and the core `.btn`/`.widget`/`.input`
  classes are responsive by construction (Tailwind utility breakpoints
  already in use throughout). No page-by-page audit was done this round to
  confirm every one of the ~40 pages behaves well at narrow widths — that
  needs an actual pass in a browser, ideally alongside the visual
  verification above.
- The credit-card-style visual metaphor, colored wallet chips, and budget
  progress-bar treatments from the Financo reference don't have a direct
  equivalent built yet on any CampusNetra page — those were style
  *references*, and nothing in this repo's actual content (buildings,
  assets, work orders) maps onto "cards" or "wallets" literally. Worth a
  human decision on which dashboard widgets, if any, should adopt that
  denser card treatment, rather than guessing.

## Addendum 7 — rounded corners + glass surfaces

Request: rounder corners and a subtle glass effect on every button and
dashboard box, app-wide. Same approach as the retheme in Addendum 6 —
edited the shared classes in `index.css` (and `Modal` in
`components/ui/index.jsx`, the one surface styled inline rather than
through a shared class) rather than touching individual pages, so it
applies everywhere those classes are used without hunting through ~40
files.

- `.widget` (every dashboard card): `rounded-xl` → `rounded-2xl`;
  background is now `bg-surface/75 backdrop-blur-xl` instead of solid, with
  a slightly brighter hairline border and a soft two-layer shadow so the
  translucency reads as depth rather than looking washed out. Table-header
  corner-matching and `.ai-surface` updated to the same radius so nothing
  pokes a square corner out through the new rounder card edge.
- Buttons: base radius `rounded-lg` → `rounded-xl`. Solid buttons
  (primary/dark/danger) stay fully opaque on purpose — a translucent CTA
  loses contrast against whatever's behind it, which matters more than
  matching the glass trend on the one button per screen meant to stand
  out. They get a soft colour-matched glow shadow instead of transparency.
  `.btn-secondary`/`.btn-ghost` aren't full-strength actions, so they get
  the actual glass treatment (translucent + blurred).
- `.input` rounded up to `rounded-lg` (was the Tailwind default `rounded`,
  4px) and lightly translucent, but not blurred as heavily as buttons/cards
  — legibility of what you're typing matters more here.
- `Modal`: was already `rounded-2xl` with real elevation (correctly, since
  it's genuinely floating) — added `bg-surface/90 backdrop-blur-2xl` on
  top of what was there, kept high opacity since modal content needs to
  stay readable over whatever's behind it.

Worth knowing: the app's background is a flat colour, not an image or
busy layout, so `backdrop-blur` mostly isn't visibly *blurring* anything
underneath on most pages — the glass look here is coming from
translucency + the bright edge highlight + the shadow, not from blur
distortion. It'll be more visible where cards sit over the 3D campus
view or stack over each other (modals, dropdowns).

Not verified in a rendered browser, same limitation as Addendum 6.

Whoever picks this up next: the lesson isn't "trust this file either" —
it's `git log origin/main` and read the actual diff before believing any
status report, including this one.
