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
from typing import Optional
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


def _alnum(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", text).upper()


def contains_identifier(ocr_text: str, identifier: str) -> bool:
    """Whether the card shows the number the account already carries.

    A name match says nothing about whose card it is — a photo of somebody
    else's ID carries their name just as plainly as their own. The enrolment
    or employee number on the account is what ties the document to the person
    asking, so it has to be on the card too.

    Punctuation and spacing come off both sides first: OCR routinely reads
    "21/43210" or "2143 210" for what is printed as 2143210.
    """
    wanted = _alnum(identifier)
    if not wanted:
        return False
    return wanted in _alnum(ocr_text)


@dataclass
class NameMatchResult:
    score: float  # 0.0–1.0: fraction of the claimed name's tokens found on the ID
    matched_tokens: list[str]
    missing_tokens: list[str]
    ocr_excerpt: str  # short, for an admin reviewing the queued request


# Best-effort label -> value extraction for the fields spec #10 asks for
# beyond a name/ID match: course, class/section, department. There is no
# fixed layout across institution ID cards the way there is for a 7-digit
# enrollment number, so this only looks for an explicit label on the same
# line and grabs what follows it -- a card that never prints "Course:" or
# equivalent simply yields nothing for that field, which is the honest
# result rather than guessing from unlabelled text.
_FIELD_PATTERNS = {
    "course": r"(?:course|programme|program|degree)\s*[:\-]\s*([A-Za-z0-9 .&/]{2,60})",
    "class": r"(?:class|section|semester|sem)\s*[:\-]\s*([A-Za-z0-9 .\-]{1,20})",
    "department": r"(?:department|dept|branch)\s*[:\-]\s*([A-Za-z0-9 .&/]{2,60})",
}


def extract_fields(ocr_text: str) -> dict[str, str]:
    """Pull whatever labelled fields are readable off the card, for the
    caller to show the person as "we also found this" -- never written to
    the profile without their own confirmation (see the name-change flow,
    which surfaces these alongside its auto-approve/queue decision but
    never applies them itself).
    """
    found: dict[str, str] = {}
    for key, pattern in _FIELD_PATTERNS.items():
        match = re.search(pattern, ocr_text, re.IGNORECASE)
        if not match:
            continue
        value = match.group(1).strip().splitlines()[0].strip(" .:-")
        if value:
            found[key] = value[:80]
    return found


def extract_id_number(ocr_text: str) -> Optional[str]:
    """Best-effort pull of a 7-digit enrollment/employee number from OCR
    text, matching the exact format the app enforces everywhere else.

    Not a substitute for `contains_identifier` (which checks against the
    account's *known* number) -- this is for surfacing to an admin
    reviewing a pending name-change request as extra context, since right
    now they see the OCR excerpt but nothing pulled out of it.
    """
    match = re.search(r"\b\d{7}\b", ocr_text)
    return match.group(0) if match else None


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
