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

WIDTH = 240
HEIGHT = 70
FONT_SIZE = 40


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
    image = Image.new("RGB", (WIDTH, HEIGHT), (245, 246, 250))
    draw = ImageDraw.Draw(image)

    # Background noise lines, drawn first so the text sits on top of them.
    for _ in range(6):
        x1, y1 = rng.randint(0, WIDTH), rng.randint(0, HEIGHT)
        x2, y2 = rng.randint(0, WIDTH), rng.randint(0, HEIGHT)
        draw.line((x1, y1, x2, y2), fill=(200, 205, 215), width=1)

    font = _load_font(FONT_SIZE)
    char_w = WIDTH // max(len(text), 1)

    # Placed left-to-right with a running cursor, not a fixed i*char_w slot.
    # The old version clamped each glyph independently to [0, WIDTH -
    # rotated.width] -- a bound that depends only on that glyph's own
    # (rotation-inflated) width, not on i. For characters near the end of
    # the string, that ceiling was often *lower* than their nominal slot,
    # so several trailing characters all clamped down to the same x and
    # rendered stacked on top of each other. A monotonically-advancing
    # cursor can't go backwards, so two glyphs can never land on the same
    # spot regardless of how wide rotation makes any one of them.
    cursor_x = 6
    for i, ch in enumerate(text):
        glyph = Image.new("RGBA", (char_w + 20, HEIGHT), (0, 0, 0, 0))
        gdraw = ImageDraw.Draw(glyph)
        color = (
            rng.randint(20, 90), rng.randint(20, 90), rng.randint(90, 160),
        )
        gdraw.text((10, 8), ch, font=font, fill=color)
        angle = rng.uniform(-22, 22)
        rotated = glyph.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)

        x = min(cursor_x, max(0, WIDTH - rotated.width))
        y = int((HEIGHT - rotated.height) / 2 + rng.uniform(-6, 6))
        y = min(max(y, 0), max(0, HEIGHT - rotated.height))
        image.paste(rotated, (x, y), rotated)

        # A little controlled overlap (0.6x) keeps the crowded, hard-to-
        # script-read captcha look without ever regressing the cursor.
        cursor_x = x + max(int(rotated.width * 0.6), 14)

    # A gentle sine-wave warp, then a light blur so edges don't look pasted on.
    warped = Image.new("RGB", image.size, (245, 246, 250))
    pixels = image.load()
    out = warped.load()
    for y in range(HEIGHT):
        shift = int(3 * math.sin(y / 6))
        for x in range(WIDTH):
            src_x = min(max(x + shift, 0), WIDTH - 1)
            out[x, y] = pixels[src_x, y]

    warped = warped.filter(ImageFilter.SMOOTH)

    for _ in range(3):
        x1, y1 = rng.randint(0, WIDTH), rng.randint(0, HEIGHT)
        x2, y2 = rng.randint(0, WIDTH), rng.randint(0, HEIGHT)
        ImageDraw.Draw(warped).line((x1, y1, x2, y2), fill=(160, 165, 180), width=1)

    buf = io.BytesIO()
    warped.save(buf, "PNG")
    return buf.getvalue()
