"""Renders a distorted-text CAPTCHA image.

Pillow is already a dependency (see services/storage.py), so this needs no
new package and no third-party CAPTCHA service or API key. The image is
returned as PNG bytes; the answer never leaves the server in the clear — see
core/security.py's create_captcha_token/verify_captcha_token for how it's
checked.
"""
from __future__ import annotations

import io
import math
import random

from PIL import Image, ImageDraw, ImageFilter

WIDTH = 260
HEIGHT = 70
FONT_SIZE = 34


def _load_font(size: int):
    from PIL import ImageFont

    # A handful of common system paths; falls back to Pillow's bitmap default
    # (still legible, just not distorted-looking) if none are present.
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def render_captcha_png(text: str) -> bytes:
    """Draws `text` with per-character rotation, noise lines and a blur pass."""
    rng = random.Random()
    width = WIDTH
    image = Image.new("RGB", (width, HEIGHT), (245, 246, 250))
    draw = ImageDraw.Draw(image)

    # Background noise lines, drawn first so the text sits on top of them.
    for _ in range(6):
        x1, y1 = rng.randint(0, width), rng.randint(0, HEIGHT)
        x2, y2 = rng.randint(0, width), rng.randint(0, HEIGHT)
        draw.line((x1, y1, x2, y2), fill=(200, 205, 215), width=1)

    font = _load_font(FONT_SIZE)

    # Placed left-to-right with a running cursor, not a fixed i*char_w slot,
    # and each glyph fully clears the previous one's actual drawn width
    # before the next is placed -- no overlap, regardless of rotation. The
    # distortion (rotation, jitter, warp, noise lines) still makes it hard
    # to script-read; it just no longer makes it hard for a human to read
    # either, which is what actually matters for a login captcha.
    #
    # Each glyph is drawn on a canvas sized to its own ink (via textbbox),
    # not a fixed WIDTH/len slot or the full image HEIGHT -- rotating a
    # mostly-empty tall canvas inflates its bounding box far past the
    # actual character, which was pushing the cursor (and later characters)
    # off the right edge and forcing them to clamp back on top of each other.
    cursor_x = 6
    for ch in text:
        bbox = font.getbbox(ch)
        glyph_w = max(bbox[2] - bbox[0], 1) + 10
        glyph_h = max(bbox[3] - bbox[1], 1) + 10
        glyph = Image.new("RGBA", (glyph_w, glyph_h), (0, 0, 0, 0))
        gdraw = ImageDraw.Draw(glyph)
        color = (
            rng.randint(20, 90), rng.randint(20, 90), rng.randint(90, 160),
        )
        gdraw.text((5 - bbox[0], 5 - bbox[1]), ch, font=font, fill=color)
        angle = rng.uniform(-14, 14)
        rotated = glyph.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)

        x = cursor_x
        y = int((HEIGHT - rotated.height) / 2 + rng.uniform(-4, 4))
        y = min(max(y, 0), max(0, HEIGHT - rotated.height))
        image.paste(rotated, (x, y), rotated)

        # Next glyph starts only once this one's own drawn box has fully
        # cleared, plus a small gap -- guarantees no two characters ever
        # share a column, however wide rotation makes either of them.
        cursor_x = x + rotated.width + 4

    # However wide the distorted text ends up, the canvas fits it -- rather
    # than clamping the last character(s) back to a fixed width and
    # reintroducing the exact overlap this function exists to prevent.
    if cursor_x + 6 > width:
        width = cursor_x + 6
        wider = Image.new("RGB", (width, HEIGHT), (245, 246, 250))
        wider.paste(image, (0, 0))
        image = wider

    # A gentle sine-wave warp, then a light blur so edges don't look pasted on.
    warped = Image.new("RGB", image.size, (245, 246, 250))
    pixels = image.load()
    out = warped.load()
    for y in range(HEIGHT):
        shift = int(3 * math.sin(y / 6))
        for x in range(width):
            src_x = min(max(x + shift, 0), width - 1)
            out[x, y] = pixels[src_x, y]

    warped = warped.filter(ImageFilter.SMOOTH)

    for _ in range(3):
        x1, y1 = rng.randint(0, width), rng.randint(0, HEIGHT)
        x2, y2 = rng.randint(0, width), rng.randint(0, HEIGHT)
        ImageDraw.Draw(warped).line((x1, y1, x2, y2), fill=(160, 165, 180), width=1)

    buf = io.BytesIO()
    warped.save(buf, "PNG")
    return buf.getvalue()
