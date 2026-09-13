"""Image upload handling: validation, EXIF stripping, thumbnails, perceptual hash.

Files are re-encoded rather than stored as received. That normalises the format,
drops EXIF (campus photos routinely carry GPS coordinates), and guarantees the
bytes on disk are actually an image rather than something that merely claimed to be.

Where the bytes end up is a separate concern, handled by the backend functions
near the bottom of this file (_write_object / _read_object / _public_url).
STORAGE_BACKEND="local" writes to UPLOAD_DIR on this machine's own disk, which
most PaaS hosts wipe on every redeploy — fine for local dev, silently data-
losing in most production deployments. STORAGE_BACKEND="s3" persists to any
S3-compatible bucket instead. Everything above the backend functions is
unaware of which one is active.
"""
from __future__ import annotations

import io
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
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

    A private image is stored under a "private/" prefix that is never reachable
    through the public /media mount (or, on S3, never given a public ACL), and
    its url/thumb_url come back as bare relative paths rather than links — there
    is no address that serves them directly, only a route that checks who is
    asking (see private_file / read_private_bytes below).
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

    def _encode(img: Image.Image, quality: int) -> bytes:
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=quality, optimize=True)
        return buf.getvalue()

    full_bytes = _encode(full, JPEG_QUALITY)
    thumb_bytes = _encode(thumb, 80)

    # Random name: the client's filename is untrusted and could traverse paths.
    stamp = datetime.now(timezone.utc).strftime("%Y/%m")
    stem = f"{uuid.uuid4().hex}{secrets.token_hex(4)}"
    rel = f"{subdir}/{stamp}/{stem}"

    _write_object(f"{rel}.jpg", full_bytes, private=private)
    _write_object(f"{rel}_thumb.jpg", thumb_bytes, private=private)

    return StoredImage(
        url=f"{rel}.jpg" if private else _public_url(f"{rel}.jpg"),
        thumb_url=f"{rel}_thumb.jpg" if private else _public_url(f"{rel}_thumb.jpg"),
        filename=original_name or f"{stem}.jpg",
        mime_type="image/jpeg",
        size_bytes=len(full_bytes),
        width=full.width,
        height=full.height,
        phash=phash,
    )


def private_file(relative_path: str) -> Path:
    """Turn a stored private path into a *local* file on disk, or raise UploadError.

    Only meaningful when STORAGE_BACKEND="local" — callers serving a private
    upload (e.g. an ID card) should generally prefer read_private_bytes()
    below, which works with either backend. This is kept for any caller that
    specifically wants FileResponse-style streaming from local disk.
    """
    if settings.STORAGE_BACKEND != "local":
        raise UploadError(
            "This deployment stores files remotely; use read_private_bytes() instead."
        )
    root = _private_root()
    candidate = (root / relative_path).resolve()
    if not candidate.is_relative_to(root) or not candidate.is_file():
        raise UploadError("That document is no longer available.")
    return candidate


def read_private_bytes(relative_path: str) -> bytes:
    """The bytes of a private upload, regardless of which backend stored it.

    The value comes from our own database, which is still not a reason to open
    whatever it names: on the local backend the resolved path is checked to
    sit inside the private root before anything is read.
    """
    try:
        return _read_object(relative_path, private=True)
    except FileNotFoundError:
        raise UploadError("That document is no longer available.")


# --------------------------------------------------------------------------
# Storage backends. Everything above this line only knows "write these bytes
# under this key" / "read the bytes back" — it never touches a filesystem or
# an S3 client directly.
# --------------------------------------------------------------------------

def _upload_root() -> Path:
    root = Path(settings.UPLOAD_DIR).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _private_root() -> Path:
    """Where local-backend files that must never be served as static content live.

    The whole upload directory is mounted at /media with no authentication,
    which is right for a photo of a broken tap and wrong for a photo of
    somebody's ID card. This is a sibling of that directory rather than a
    folder inside it, so there is no arrangement of the mount that reaches it.
    """
    root = _upload_root().parent / "private-uploads"
    root.mkdir(parents=True, exist_ok=True)
    return root


@lru_cache
def _s3_client():
    import boto3

    return boto3.client(
        "s3",
        region_name=settings.S3_REGION or None,
        endpoint_url=settings.S3_ENDPOINT_URL or None,
        aws_access_key_id=settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
    )


def _s3_key(relative_path: str, private: bool) -> str:
    return f"{'private' if private else 'public'}/{relative_path}"


def _write_object(relative_path: str, data: bytes, private: bool) -> None:
    if settings.STORAGE_BACKEND == "s3":
        # No ACL is set here on purpose: every AWS S3 bucket created since
        # April 2023 has ACLs disabled by default (put_object with ACL=
        # "public-read" fails outright with AccessControlListNotSupported),
        # and several S3-compatible providers never supported per-object
        # ACLs at all. Public read access for the "public/" prefix is
        # granted once, at the bucket level, via a bucket policy — see the
        # example in backend/.env.example. Private objects (ID cards) are
        # never touched by that policy and stay reachable only through
        # read_private_bytes()'s authenticated route.
        _s3_client().put_object(
            Bucket=settings.S3_BUCKET,
            Key=_s3_key(relative_path, private),
            Body=data,
            ContentType="image/jpeg",
        )
        return

    root = _private_root() if private else _upload_root()
    path = (root / relative_path).resolve()
    if not path.is_relative_to(root):
        raise UploadError("Invalid storage path.")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def _read_object(relative_path: str, private: bool) -> bytes:
    if settings.STORAGE_BACKEND == "s3":
        client = _s3_client()
        try:
            obj = client.get_object(
                Bucket=settings.S3_BUCKET, Key=_s3_key(relative_path, private),
            )
            return obj["Body"].read()
        except client.exceptions.NoSuchKey:
            raise FileNotFoundError(relative_path)

    root = _private_root() if private else _upload_root()
    path = (root / relative_path).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise FileNotFoundError(relative_path)
    return path.read_bytes()


def _public_url(relative_path: str) -> str:
    if settings.STORAGE_BACKEND == "s3":
        key = _s3_key(relative_path, private=False)
        base = settings.S3_PUBLIC_BASE_URL.rstrip("/")
        if base:
            return f"{base}/{key}"
        # No S3_PUBLIC_BASE_URL configured: fall back to a URL the bucket
        # itself will actually answer, rather than a host-less "/key" path
        # that resolves against nothing. Endpoint-style providers (R2, B2,
        # Spaces) serve a bucket at <endpoint>/<bucket>/<key>; plain AWS S3
        # serves it at <bucket>.s3.<region>.amazonaws.com/<key>.
        if settings.S3_ENDPOINT_URL:
            endpoint = settings.S3_ENDPOINT_URL.rstrip("/")
            return f"{endpoint}/{settings.S3_BUCKET}/{key}"
        region = settings.S3_REGION if settings.S3_REGION not in ("", "auto") else "us-east-1"
        return f"https://{settings.S3_BUCKET}.s3.{region}.amazonaws.com/{key}"
    return f"/media/{relative_path}"

