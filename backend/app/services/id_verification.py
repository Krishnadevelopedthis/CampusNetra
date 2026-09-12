"""Matching a claimed full name against the name printed on an uploaded ID card.

Uses pytesseract (a thin wrapper around the Tesseract OCR binary) when it is
available. Neither the Python package nor the system binary is a hard
requirement to run the server: if either is missing, extraction raises
OcrUnavailable and the caller queues the request for a human to look at
instead of blocking the feature entirely.

This is deliberately best-effort. OCR on a photographed ID card is noisy —
glare, skew, low resolution — so a low match score is a reason to have a
person look, not a reason to hard-reject the request.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass

from PIL import Image

# Words too common on an ID card to help identify the holder, and single
# letters produced by OCR splitting a word.
_STOPWORDS = {
    "the", "of", "and", "govt", "government", "india", "card", "id",
    "identity", "student", "employee", "staff", "college", "university",
    "school", "institute", "name", "no", "number", "valid", "issued",
}


class OcrUnavailable(Exception):
    """Raised when Tesseract (the package or the system binary) isn't installed."""


def extract_text(image_bytes: bytes) -> str:
    try:
        import pytesseract
    except ImportError as exc:
        raise OcrUnavailable("pytesseract is not installed") from exc

    try:
        image = Image.open(io.BytesIO(image_bytes))
        image.load()
    except Exception as exc:  # noqa: BLE001 - any decode failure is the same to us
        raise ValueError("That file could not be read as an image.") from exc

    try:
        return pytesseract.image_to_string(image)
    except Exception as exc:  # noqa: BLE001 - covers the Tesseract binary missing
        raise OcrUnavailable("Tesseract OCR binary is not installed") from exc


def _tokens(text: str) -> set[str]:
    words = re.findall(r"[A-Za-z]+", text.lower())
    return {w for w in words if len(w) > 1 and w not in _STOPWORDS}


@dataclass
class NameMatchResult:
    score: float  # 0.0–1.0: fraction of the claimed name's tokens found on the ID
    matched_tokens: list[str]
    missing_tokens: list[str]
    ocr_excerpt: str  # short, for an admin reviewing the queued request


def match_name(claimed_name: str, ocr_text: str) -> NameMatchResult:
    claimed_tokens = _tokens(claimed_name)
    id_tokens = _tokens(ocr_text)

    if not claimed_tokens:
        return NameMatchResult(0.0, [], [], ocr_text[:300])

    matched = sorted(t for t in claimed_tokens if t in id_tokens)
    missing = sorted(t for t in claimed_tokens if t not in id_tokens)
    score = len(matched) / len(claimed_tokens)

    return NameMatchResult(
        score=round(score, 2),
        matched_tokens=matched,
        missing_tokens=missing,
        ocr_excerpt=ocr_text.strip()[:300],
    )
