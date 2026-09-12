"""Image upload handling: validation, EXIF stripping, thumbnails, perceptual hash.

Files are re-encoded rather than stored as received. That normalises the format,
drops EXIF (campus photos routinely carry GPS coordinates), and guarantees the
bytes on disk are actually an image rather than something that merely claimed to be.
"""
from __future__ import annotations

import io
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import settings

ALLOWED = {"image/jpeg", "image/png", "image/webp", "image/gif"}
# Longest edge; keeps a phone photo useful without storing 12 megapixels.
MAX_EDGE = 1600
THUMB_EDGE = 400
JPEG_QUALITY = 85


@dataclass
class StoredImage:
    url: str
    thumb_url: str
    filename: str
    mime_type: str
    size_bytes: int
    width: int
    height: int
    phash: str


class UploadError(Exception):
    """Raised for anything the caller should see as a 400."""


def _upload_root() -> Path:
    root = Path(settings.UPLOAD_DIR).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _private_root() -> Path:
    """Where files that must never be served as static content live.

    The whole upload directory is mounted at /media with no authentication,
    which is right for a photo of a broken tap and wrong for a photo of
    somebody's ID card. This is a sibling of that directory rather than a
    folder inside it, so there is no arrangement of the mount that reaches it.
    """
    root = _upload_root().parent / "private-uploads"
    root.mkdir(parents=True, exist_ok=True)
    return root


def private_file(relative_path: str) -> Path:
    """Turn a stored private path into a file on disk, or raise UploadError.

    The value comes from our own database, which is still not a reason to open
    whatever it names: it is resolved and checked to sit inside the private
    root before anything is read.
    """
    root = _private_root()
    candidate = (root / relative_path).resolve()
    if not candidate.is_relative_to(root) or not candidate.is_file():
        raise UploadError("That document is no longer available.")
    return candidate


def compute_phash(image: Image.Image, hash_size: int = 8) -> str:
    """Perceptual hash (DCT-based).

    Resistant to rescaling, re-compression and small colour shifts, which is what
    matters when the same fault is photographed twice on different phones.
    Implemented directly rather than pulling in a dependency for ~15 lines.
    """
    # 32x32 greyscale, then keep the low-frequency DCT corner.
    img = image.convert("L").resize((hash_size * 4, hash_size * 4), Image.Resampling.LANCZOS)
    pixels = np.asarray(img, dtype=np.float64)

    # 2D DCT-II via the orthonormal basis; scipy is not a dependency here.
    n = pixels.shape[0]
    k = np.arange(n)
    basis = np.cos(np.pi * (2 * k[:, None] + 1) * k[None, :] / (2 * n))
    basis[0] *= 1 / np.sqrt(2)
    dct = basis @ pixels @ basis.T

    low = dct[:hash_size, :hash_size]
    # The DC term encodes overall brightness, not structure — exclude it from the
    # median so a uniformly lighter copy still hashes the same.
    median = np.median(low.flatten()[1:])
    bits = (low > median).flatten()

    return f"{int(''.join('1' if b else '0' for b in bits), 2):0{hash_size * hash_size // 4}x}"


def store_image(
    data: bytes, original_name: Optional[str] = None, subdir: str = "issues",
    private: bool = False,
) -> StoredImage:
    """Validate, normalise and persist one image. Raises UploadError on bad input.

    A private image is written outside the directory served at /media, and its
    url/thumb_url come back as bare relative paths rather than links — there is
    no address that serves them, only a route that checks who is asking.
    """
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    if not data:
        raise UploadError("The uploaded file is empty.")
    if len(data) > max_bytes:
        raise UploadError(
            f"Image is {len(data) / 1024 / 1024:.1f} MB; the limit is {settings.MAX_UPLOAD_MB} MB.")

    # Identify from content, never from the filename or the client's Content-Type.
    try:
        probe = Image.open(io.BytesIO(data))
        probe.verify()
    except (UnidentifiedImageError, OSError):
        raise UploadError("That file is not a readable image.")

    image = Image.open(io.BytesIO(data))
    detected = Image.MIME.get(image.format or "", "")
    if detected not in ALLOWED:
        raise UploadError(
            f"{image.format or 'That format'} is not supported. Use JPEG, PNG, WebP or GIF.")

    # Honour EXIF orientation before dropping EXIF, so the image stays upright.
    image = ImageOps.exif_transpose(image)
    phash = compute_phash(image)

    if image.mode in ("RGBA", "LA", "P"):
        # Flatten transparency onto white; JPEG has no alpha channel.
        background = Image.new("RGB", image.size, (255, 255, 255))
        rgba = image.convert("RGBA")
        background.paste(rgba, mask=rgba.split()[-1])
        image = background
    else:
        image = image.convert("RGB")

    # ImageOps.contain scales up as well as down, so a small photo was being
    # enlarged to the cap — a 320px snapshot stored as a blurry 1600px file that
    # is bigger than the original and no more detailed. Only ever shrink.
    def _fit(img, edge):
        if max(img.size) <= edge:
            return img.copy()
        return ImageOps.contain(img, (edge, edge), Image.Resampling.LANCZOS)

    full = _fit(image, MAX_EDGE)
    thumb = _fit(image, THUMB_EDGE)

    # Random name: the client's filename is untrusted and could traverse paths.
    stamp = datetime.now(timezone.utc).strftime("%Y/%m")
    stem = f"{uuid.uuid4().hex}{secrets.token_hex(4)}"
    folder = (_private_root() if private else _upload_root()) / subdir / stamp
    folder.mkdir(parents=True, exist_ok=True)

    full_path = folder / f"{stem}.jpg"
    thumb_path = folder / f"{stem}_thumb.jpg"

    # Re-encoding is what actually strips EXIF; save() carries nothing over.
    full.save(full_path, "JPEG", quality=JPEG_QUALITY, optimize=True)
    thumb.save(thumb_path, "JPEG", quality=80, optimize=True)

    rel = f"{subdir}/{stamp}/{stem}"
    return StoredImage(
        url=f"{rel}.jpg" if private else f"/media/{rel}.jpg",
        thumb_url=f"{rel}_thumb.jpg" if private else f"/media/{rel}_thumb.jpg",
        filename=original_name or f"{stem}.jpg",
        mime_type="image/jpeg",
        size_bytes=full_path.stat().st_size,
        width=full.width,
        height=full.height,
        phash=phash,
    )
