"""Image upload endpoint.

Used by complaint reporting, Lost & Found and work-order evidence. Returns the
shape the attachment schemas expect, so the caller passes the response straight
through when creating the parent record.

All images are stored privately in the bucket (never a public bucket URL) and
served back through the /uploads/file/... route below. That route does NOT
require the caller to be logged in -- it takes any relative_path and reads it
straight from private storage. "Private" here means "not reachable through
the public bucket/media mount, no guessable public ACL," not "requires auth
to fetch through this API".

Closing that fully (requiring CurrentUser here) is a bigger change than it
looks: auth in this app is a bearer token in localStorage, not a cookie, and
a plain <img src="/uploads/file/...">  cannot attach an Authorization header
-- every evidence photo, avatar and Lost & Found image currently rendered as
a plain <img> across the app would go blank until each one is rewritten to
fetch through JS and render as a blob URL. That's real, separate frontend
work, tracked but not done here.

What IS done here: identity-verification uploads (ID cards, see
change-name's store_image(..., subdir="identity_verification", private=True)
in auth.py) are refused at this route regardless of auth, full stop. An ID
card is meaningfully more sensitive than an evidence photo -- it's exactly
what item #39 of the security audit calls out by name -- and it already has
a correct, dedicated, admin-only, org-scoped route
(GET /admin/name-change-requests/{request_id}/document). There is no legitimate
reason for that subdirectory to ever come back through this generic,
unauthenticated path, so this closes that one leak completely rather than
leaving it as a "the URL just isn't guessable" hope.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import Response

from app.api.deps import CurrentUser
from app.core.routing import CommitRoute
from app.core.config import settings
from app.services.storage import UploadError, read_private_bytes, store_image

router = APIRouter(route_class=CommitRoute, prefix="/uploads", tags=["Uploads"])

MAX_FILES = 5


def _subdir(purpose: str) -> str:
    if purpose in ("lost", "found"):
        return "lostfound"
    if purpose == "avatar":
        return "avatars"
    return "issues"


def _served_url(relative_path: str) -> str:
    return f"{settings.API_V1_PREFIX}/uploads/file/{relative_path}"


_BLOCKED_PREFIXES = ("identity_verification/", "identity_verification\\")


@router.get("/file/{relative_path:path}")
async def get_uploaded_file(relative_path: str):
    # ID cards never come back through this unauthenticated route -- see the
    # module docstring. They're only ever readable through the admin-only,
    # org-scoped GET /admin/name-change-requests/{request_id}/document.
    if relative_path.startswith(_BLOCKED_PREFIXES):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    try:
        data = await asyncio.to_thread(read_private_bytes, relative_path)
    except UploadError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc))
    return Response(content=data, media_type="image/jpeg")


@router.post("/image", response_model=dict, status_code=status.HTTP_201_CREATED)
async def upload_image(
    user: CurrentUser,
    file: UploadFile = File(...),
    purpose: str = "report",
):
    data = await file.read()
    try:
        stored = await asyncio.to_thread(
            store_image, data, file.filename,
            _subdir(purpose), True,
        )
    except UploadError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))

    return {
        "url": _served_url(stored.url),
        "thumb_url": _served_url(stored.thumb_url),
        "filename": stored.filename,
        "mime_type": stored.mime_type,
        "size_bytes": stored.size_bytes,
        "width": stored.width,
        "height": stored.height,
        "phash": stored.phash,
        "purpose": purpose,
    }


@router.post("/images", response_model=dict, status_code=status.HTTP_201_CREATED)
async def upload_images(
    user: CurrentUser,
    files: list[UploadFile] = File(...),
    purpose: str = "report",
):
    if len(files) > MAX_FILES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Up to {MAX_FILES} images per upload; you sent {len(files)}.")

    uploaded, errors = [], []
    subdir = _subdir(purpose)

    for f in files:
        data = await f.read()
        try:
            stored = await asyncio.to_thread(store_image, data, f.filename, subdir, True)
        except UploadError as exc:
            errors.append({"filename": f.filename, "error": str(exc)})
            continue
        uploaded.append({
            "url": _served_url(stored.url), "thumb_url": _served_url(stored.thumb_url),
            "filename": stored.filename, "mime_type": stored.mime_type,
            "size_bytes": stored.size_bytes, "phash": stored.phash,
            "purpose": purpose,
        })

    if not uploaded and errors:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, errors[0]["error"])

    return {"uploaded": uploaded, "errors": errors,
            "limits": {"max_files": MAX_FILES, "max_mb": settings.MAX_UPLOAD_MB}}
