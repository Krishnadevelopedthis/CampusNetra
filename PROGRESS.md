# Security & Verification Hardening — Progress

Tracks the multi-part request: verified email/phone/name changes, 7-digit
IDs everywhere, and CAPTCHA on login + forgot-password.

Started fresh from the actual `main` branch on 2026-09-12. (A prior chat
session described similar work but nothing from it was ever committed —
this file is the real, checked-in status.)

## Already true before this work started

- Email change already required OTP verification
  (`POST /auth/me/change-email` → `POST /auth/me/verify-email-change`).
- `RegisterRequest.enrollment_no` / `.employee_id` already enforced exactly
  7 digits — but *only* on self-registration.

## Done (backend) — committed

- [x] `core/config.py`: `CAPTCHA_EXPIRE_MINUTES`, `SMS_PROVIDER` slot,
      `NAME_MATCH_THRESHOLD`, `sms_delivers` / `expose_dev_phone_codes`
      properties.
- [x] `core/security.py`: stateless JWT-backed CAPTCHA
      (`create_captcha_token` / `verify_captcha_token`) — no DB table.
- [x] `services/captcha.py`: renders a distorted-text PNG with Pillow
      (already a dependency — no third-party CAPTCHA service/key).
- [x] `services/id_verification.py`: OCR text extraction via `pytesseract`
      (raises `OcrUnavailable` if the package or the `tesseract-ocr`
      binary is missing — callers must catch this and queue for manual
      review, never fail the request) + token-overlap name matching.
- [x] `models/identity.py`: `NameChangeRequest` model, mirroring
      `AccountDeletionRequest`. Registered in `models/__init__.py`.
- [x] `database/migrations/012_name_change_requests.sql`.
- [x] `schemas/auth.py`:
      - `validate_seven_digit_id()` shared helper; `RegisterRequest`
        refactored onto it.
      - `captcha_token` / `captcha_answer` added to `LoginRequest` and
        `ForgotPasswordRequest`.
      - `CaptchaOut`, `RequestPhoneChangeRequest`, `ChangePhoneRequest`,
        `NameChangeRequestOut`, `NameChangeDecisionRequest` added.
      - `UpdateProfileRequest` **no longer accepts `full_name` or `phone`**
        — those now require the verified flows below. Any existing
        frontend code calling `PATCH /auth/me` with those fields will
        get a 422 until the frontend is updated (see "Not done" below).
- [x] `api/v1/auth.py`:
      - `GET /auth/captcha` — returns `{captcha_token, image}` (image is
        a `data:image/png;base64,...` URI, so no extra static route).
      - CAPTCHA now required and checked on `/auth/login` and
        `/auth/forgot-password`.
      - `POST /auth/me/change-phone` / `POST /auth/me/verify-phone-change`
        — reuses the existing, previously-unused `phone_verify`
        `VerificationCode` purpose (no migration needed). No SMS gateway
        is configured (`SMS_PROVIDER=none`), so **the OTP code is
        returned in the response body outside production** exactly like
        the email fallback (`expose_dev_phone_codes`); in production it
        503s until a real provider is wired into a new `services/sms.py`.
      - `POST /auth/me/change-name` (multipart: `new_full_name` form field
        + `id_document` file) — stores the image via the existing
        `services/storage.py` pipeline, OCRs it, and either auto-applies
        the name (score ≥ `NAME_MATCH_THRESHOLD`, default 0.6) or creates
        a pending `NameChangeRequest` and notifies admins.
      - `GET /auth/me/name-change-request` — status of the latest request.
- [x] `api/v1/admin.py`:
      - `UserCreate` / `UserUpdate` both validate `enrollment_no` /
        `employee_id` as exactly 7 digits via the shared helper.
      - `UserUpdate` now also accepts `phone`, `employee_id`,
        `enrollment_no` for editing (previously only settable at
        creation).
      - `GET /admin/name-change-requests`,
        `POST /admin/name-change-requests/{id}/approve`,
        `POST /admin/name-change-requests/{id}/reject` — mirrors the
        existing deletion-request review pattern.
- [x] `requirements.txt`: added `pytesseract`. **The Tesseract binary
      itself is a system package, not pip-installable** — see "Deploy
      notes" below.

## Not done yet — pick up here

### Backend
- [ ] `services/sms.py` — currently there is no real SMS sending path at
      all; `/auth/me/change-phone` only works via the dev-code fallback.
      Needs a provider (Twilio/MSG91/etc.) once one is chosen.
- [ ] No automated tests were added for any of the above. The repo's
      existing test setup (if any) should be checked and extended.
- [ ] `UserOut` needs to be checked against every place that constructs a
      `UserOut` outside of `auth.py`/`admin.py` (e.g. anywhere a user is
      serialized) — `phone_verified_at` was added; nothing else changed
      shape, so this is a quick check rather than a rewrite.

### Frontend (`frontend/src/...`) — none of this is started
- [ ] **Login page**: fetch `GET /auth/captcha` on mount (and on failed
      submit), render the `image` data URI, add an answer input, send
      `captcha_token` + `captcha_answer` with the login request. Re-fetch
      a new captcha after any failed attempt (the token is single-use in
      spirit — a `verify_captcha_token` call always succeeds/fails once
      meaningfully, but nothing stops resubmitting the same token, so the
      frontend should proactively refresh it after each attempt for UX,
      not because the backend requires it).
- [ ] **Forgot-password page**: same captcha widget as login.
- [ ] **Register page**: fix the hint text that says "six digits" for
      enrollment/employee ID — it's validated as 7.
- [ ] **Profile page**: 
      - Email field: already wired to the existing change-email flow —
        confirm nothing broke (it shouldn't have; that code wasn't
        touched).
      - Phone field: needs the two-step OTP UI (request → enter code),
        calling `/auth/me/change-phone` then `/auth/me/verify-phone-change`.
      - Full name field: needs an "upload ID" UI — a file picker plus the
        new name, calling `/auth/me/change-name` (multipart), and showing
        the resulting status (`auto_approved` vs `pending` — poll
        `/auth/me/name-change-request` if pending).
      - **The direct "edit name / edit phone and save" UI must be removed
        or disabled** — `PATCH /auth/me` will now 422 if either field is
        sent, since `UpdateProfileRequest` no longer accepts them.
- [ ] **Admin → Users panel**: 
      - Enforce 7-digit input (maxlength/pattern) on enrollment/employee ID
        fields in the create/edit user forms.
      - Expose phone/employee_id/enrollment_no as editable in the edit-user
        form (backend now accepts them via `UserUpdate`).
      - Add a "Name change requests" review screen (list/approve/reject),
        analogous to the existing "Deletion requests" screen — reuse that
        component's structure if there is one.

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

### A note on process
A recap/tool-output-style document was pasted into this conversation
claiming a *different* set of fixes for the same three issues (a captcha
single-use guard, an ID-number cross-check on top of the name match, a
brute-force counter fix in `consume_verification_code`, an admin
name-change-review widget with a `fetchAuthedBlob` helper, etc.) — all
framed as already done. `git log origin/main` was checked directly before
touching anything, and none of that code exists on the real `main` (still
at `602ebb2` at the time of writing this). None of those unverified changes
were incorporated here. Whoever continues this: verify against the actual
repository state before trusting any pasted summary, including this one.

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
