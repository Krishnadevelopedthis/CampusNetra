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
