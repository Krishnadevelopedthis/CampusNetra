"""Image upload endpoint.

Used by complaint reporting, Lost & Found and work-order evidence. Returns the
shape the attachment schemas expect, so the caller passes the response straight
through when creating the parent record.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.api.deps import CurrentUser
from app.core.config import settings
from app.services.storage import UploadError, store_image

router = APIRouter(prefix="/uploads", tags=["Uploads"])

# A phone photo is a few MB; refuse obviously wrong input before reading it all.
MAX_FILES = 5


def _subdir(purpose: str) -> str:
    """Where a given kind of upload lives on disk."""
    if purpose in ("lost", "found"):
        return "lostfound"
    if purpose == "avatar":
        return "avatars"
    return "issues"


@router.post("/image", response_model=dict, status_code=status.HTTP_201_CREATED)
async def upload_image(
    user: CurrentUser,
    file: UploadFile = File(...),
    purpose: str = "report",
):
    """Store one image and return its URLs plus a perceptual hash.

    The hash is what makes duplicate detection and Lost & Found image matching
    work — both already score on it.
    """
    data = await file.read()

    try:
        # Pillow work is CPU-bound; keep it off the event loop.
        stored = await asyncio.to_thread(
            store_image, data, file.filename,
            _subdir(purpose),
        )
    except UploadError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))

    return {
        "url": stored.url,
        "thumb_url": stored.thumb_url,
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
    """Batch variant. Partial failures are reported per file rather than failing
    the whole request — one unreadable photo should not discard the others."""
    if len(files) > MAX_FILES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Up to {MAX_FILES} images per upload; you sent {len(files)}.")

    uploaded, errors = [], []
    subdir = _subdir(purpose)

    for f in files:
        data = await f.read()
        try:
            stored = await asyncio.to_thread(store_image, data, f.filename, subdir)
        except UploadError as exc:
            errors.append({"filename": f.filename, "error": str(exc)})
            continue
        uploaded.append({
            "url": stored.url, "thumb_url": stored.thumb_url,
            "filename": stored.filename, "mime_type": stored.mime_type,
            "size_bytes": stored.size_bytes, "phash": stored.phash,
            "purpose": purpose,
        })

    if not uploaded and errors:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, errors[0]["error"])

    return {"uploaded": uploaded, "errors": errors,
            "limits": {"max_files": MAX_FILES, "max_mb": settings.MAX_UPLOAD_MB}}
