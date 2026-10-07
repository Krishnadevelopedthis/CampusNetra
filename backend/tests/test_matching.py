"""Lost & Found scoring: unrelated items must not look like matches."""
import random
import statistics
from datetime import datetime, timedelta

from app.ai.duplicates import hamming_similarity
from app.ai.matching import (
    IMAGE_NOISE_FLOOR, NO_EVIDENCE_CAP, NOTIFY_THRESHOLD, SUGGEST_THRESHOLD,
    image_score, score_pair,
)

T0 = datetime(2026, 10, 1, 10)


def _phash(rng):
    return "".join(rng.choice("0123456789abcdef") for _ in range(16))


def _flip(h, bits, rng):
    n = int(h, 16)
    for b in rng.sample(range(64), bits):
        n ^= 1 << b
    return f"{n:016x}"


def _item(**kw):
    base = dict(id="x", title="Wallet", description="", category_id="c1", building_id="b1",
                room_id="r1", occurred_at=T0, image_phash=None, brand=None, colour=None,
                distinguishing_marks=None, zone_code=None, latitude=None, longitude=None, ai_tags=[])
    base.update(kw)
    return base


def test_unrelated_photos_score_near_zero_not_fifty_percent():
    rng = random.Random(7)
    raw = [hamming_similarity(_phash(rng), _phash(rng)) for _ in range(500)]
    assert 0.45 < statistics.mean(raw) < 0.55          # why the old figure was ~50%
    scored = [image_score(_item(image_phash=_phash(rng)), _item(image_phash=_phash(rng)))
              for _ in range(500)]
    assert statistics.mean(scored) < 0.05
    assert IMAGE_NOISE_FLOOR > 0.55


def test_identical_photo_scores_full():
    h = _phash(random.Random(1))
    assert image_score(_item(image_phash=h), _item(image_phash=h)) == 1.0


def test_missing_photo_is_unknown_not_zero():
    assert image_score(_item(), _item(image_phash="ab" * 8)) is None


def test_place_time_and_category_alone_are_not_suggested():
    rng = random.Random(2)
    lost = _item(title="Blue umbrella", image_phash=_phash(rng))
    found = _item(title="Red phone charger", image_phash=_phash(rng), occurred_at=T0 + timedelta(hours=1))
    score, _ = score_pair(lost, found)
    assert score <= NO_EVIDENCE_CAP < SUGGEST_THRESHOLD


def test_genuine_text_match_is_suggested_and_strong():
    lost = _item(title="Black leather wallet", brand="Fossil", colour="black",
                 description="black leather wallet with cards")
    found = _item(title="Black wallet found", brand="Fossil", colour="black",
                  description="found a black leather wallet", occurred_at=T0 + timedelta(hours=5))
    score, _ = score_pair(lost, found)
    assert score >= NOTIFY_THRESHOLD


def test_genuinely_similar_photo_counts():
    rng = random.Random(4)
    h = _phash(rng)
    lost = _item(title="Black wallet", colour="black", image_phash=h)
    found = _item(title="Black wallet found", colour="black", image_phash=_flip(h, 8, rng),
                  occurred_at=T0 + timedelta(hours=5))
    score, factors = score_pair(lost, found)
    assert factors.image > 0.5 and score >= SUGGEST_THRESHOLD


def test_found_before_lost_is_still_vetoed():
    lost = _item(title="Black wallet", colour="black", brand="Fossil")
    found = _item(title="Black wallet", colour="black", brand="Fossil", occurred_at=T0 - timedelta(days=3))
    assert score_pair(lost, found)[0] == 0.0
