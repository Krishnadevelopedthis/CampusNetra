from app.core import ratelimit


def setup_function():
    ratelimit.reset()


def test_allows_up_to_limit_then_blocks():
    assert all(ratelimit.allow("k", 3, 60) for _ in range(3))
    assert not ratelimit.allow("k", 3, 60)


def test_keys_are_independent():
    for _ in range(3):
        ratelimit.allow("a", 3, 60)
    assert not ratelimit.allow("a", 3, 60)
    assert ratelimit.allow("b", 3, 60)


def test_window_expires(monkeypatch):
    t = [1000.0]
    monkeypatch.setattr(ratelimit.time, "monotonic", lambda: t[0])
    assert ratelimit.allow("k", 1, 10)
    assert not ratelimit.allow("k", 1, 10)
    t[0] += 11
    assert ratelimit.allow("k", 1, 10)
