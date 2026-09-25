"""Image upload endpoint.

Used by complaint reporting, Lost & Found and work-order evidence. Returns the
shape the attachment schemas expect, so the caller passes the response straight
through when creating the parent record.

All images are stored privately in the bucket (never a public bucket URL) and
served back through the /uploads/file/... route below, which now requires
CurrentUser -- fetching one of these paths without being logged in gets a 401,
not the file. Auth in this app is a bearer token in localStorage, not a
cookie, so a plain <img src="/uploads/file/...">  cannot carry it; every
evidence photo, avatar and Lost & Found image is now fetched through JS
(useAuthedImage / fetchAuthedBlob, frontend/src/hooks/useAuthedImage.js,
frontend/src/lib/api.js) with the Authorization header and rendered from the
resulting blob: URL instead of a plain src.

This still isn't per-record authorization (any logged-in user can fetch any
non-ID-card path once authenticated) -- it closes the "fully public, path
just isn't guessable" gap, which is what made this a real leak. Per-object
scoping (only the reporter, an assigned technician, or staff can fetch a
given evidence photo) is a further-out, separate change layered on top of
this, not attempted here.

Identity-verification uploads (ID cards, see change-name's
store_image(..., subdir="identity_verification", private=True) in auth.py)
are refused at this route regardless of auth, full stop -- unchanged from
before. An ID card is meaningfully more sensitive than an evidence photo --
it's exactly what item #39 of the security audit calls out by name -- and it
already has a correct, dedicated, admin-only, org-scoped route
(GET /admin/name-change-requests/{request_id}/document). There is no
legitimate reason for that subdirectory to ever come back through this
generic path, ID-card block stays on top of the new auth requirement.
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
async def get_uploaded_file(user: CurrentUser, relative_path: str):
    # ID cards never come back through this route regardless of auth -- see
    # the module docstring. They're only ever readable through the
    # admin-only, org-scoped GET /admin/name-change-requests/{request_id}/document.
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
