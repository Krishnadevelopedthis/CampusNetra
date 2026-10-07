"""/health must answer promptly and never hang on a slow dependency."""
import asyncio

import pytest

from app.core import healthcheck


class _Conn:
    def __init__(self, behaviour):
        self.behaviour = behaviour

    async def __aenter__(self):
        await self.behaviour()
        return self

    async def __aexit__(self, *exc):
        return False

    async def execute(self, *_a, **_k):
        return None


class _Engine:
    def __init__(self, behaviour):
        self.behaviour = behaviour
        self.connects = 0

    def connect(self):
        self.connects += 1
        return _Conn(self.behaviour)


@pytest.fixture(autouse=True)
def _clean():
    healthcheck.reset()
    yield
    healthcheck.reset()


async def _ok():
    return None


async def test_up_when_the_round_trip_succeeds(monkeypatch):
    monkeypatch.setattr(healthcheck, "engine", _Engine(_ok))
    assert await healthcheck.database_up() is True


async def test_down_when_the_database_errors(monkeypatch):
    async def boom():
        raise ConnectionError("refused")

    monkeypatch.setattr(healthcheck, "engine", _Engine(boom))
    assert await healthcheck.database_up() is False


async def test_a_hung_database_is_reported_down_instead_of_hanging(monkeypatch):
    async def hang():
        await asyncio.sleep(30)

    monkeypatch.setattr(healthcheck, "DB_PROBE_TIMEOUT", 0.05)
    monkeypatch.setattr(healthcheck, "engine", _Engine(hang))
    assert await asyncio.wait_for(healthcheck.database_up(), timeout=2) is False


async def test_concurrent_callers_share_one_probe(monkeypatch):
    async def slow():
        await asyncio.sleep(0.05)

    eng = _Engine(slow)
    monkeypatch.setattr(healthcheck, "engine", eng)
    results = await asyncio.gather(*(healthcheck.database_up() for _ in range(10)))
    assert results == [True] * 10
    assert eng.connects == 1


async def test_good_result_is_cached_but_bad_one_expires_quickly(monkeypatch):
    eng = _Engine(_ok)
    monkeypatch.setattr(healthcheck, "engine", eng)
    await healthcheck.database_up()
    await healthcheck.database_up()
    assert eng.connects == 1                      # second call served from cache

    async def boom():
        raise ConnectionError("down")

    healthcheck.reset()
    eng2 = _Engine(boom)
    monkeypatch.setattr(healthcheck, "engine", eng2)
    monkeypatch.setattr(healthcheck, "DOWN_CACHE_SECONDS", 0.0)
    await healthcheck.database_up()
    await healthcheck.database_up()
    assert eng2.connects == 2                     # a failure is re-probed at once
