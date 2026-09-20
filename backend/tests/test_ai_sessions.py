"""Unit tests for app/ai/sessions.py — pure in-memory logic, no DB/network,
runnable with just `pytest` (no fixtures, no event loop needed since nothing
here is async). See AI_AGENT_PROGRESS.md for why the rest of the spec's 16
test scenarios aren't automated yet — they need an async DB test fixture and
an authenticated TestClient this project doesn't have set up yet.
"""
import time
import uuid

from app.ai import sessions


def _fresh_module_state():
    """Each test gets a clean session store — module-level state otherwise
    leaks between tests in the same process, same as any other singleton."""
    sessions._sessions.clear()  # noqa: SLF001 — intentional test access


def test_new_conversation_gets_a_fresh_id():
    _fresh_module_state()
    user_id = uuid.uuid4()

    conv_id, session = sessions.get_or_create(None, user_id)

    assert conv_id in sessions._sessions
    assert session.user_id == user_id
    assert session.messages == []


def test_existing_conversation_is_resumed_for_the_same_user():
    _fresh_module_state()
    user_id = uuid.uuid4()

    conv_id, session = sessions.get_or_create(None, user_id)
    sessions.append(session, "user", "hello")

    conv_id_2, session_2 = sessions.get_or_create(conv_id, user_id)

    assert conv_id_2 == conv_id
    assert session_2 is session
    assert session_2.messages == [{"role": "user", "content": "hello"}]


def test_session_isolation_between_two_users():
    """Test #15 from the spec: a conversation_id must never hand back
    another user's history."""
    _fresh_module_state()
    user_a = uuid.uuid4()
    user_b = uuid.uuid4()

    conv_id, session_a = sessions.get_or_create(None, user_a)
    sessions.append(session_a, "user", "user A's message")

    # User B presents (or guesses) user A's conversation id.
    conv_id_b, session_b = sessions.get_or_create(conv_id, user_b)

    assert conv_id_b != conv_id, "must not resume someone else's session"
    assert session_b.messages == []
    assert session_b is not session_a


def test_unknown_conversation_id_starts_fresh_instead_of_erroring():
    _fresh_module_state()
    user_id = uuid.uuid4()

    conv_id, session = sessions.get_or_create(uuid.uuid4(), user_id)

    assert session.messages == []
    assert conv_id in sessions._sessions


def test_message_history_is_bounded():
    _fresh_module_state()
    user_id = uuid.uuid4()
    _, session = sessions.get_or_create(None, user_id)

    for i in range(sessions.MAX_MESSAGES + 10):
        sessions.append(session, "user", f"message {i}")

    assert len(session.messages) == sessions.MAX_MESSAGES
    # The oldest messages were dropped, not the newest.
    assert session.messages[-1]["content"] == f"message {sessions.MAX_MESSAGES + 9}"


def test_stale_sessions_are_evicted():
    _fresh_module_state()
    user_id = uuid.uuid4()
    conv_id, session = sessions.get_or_create(None, user_id)

    # Simulate the session having gone idle past the TTL.
    session.last_active = time.monotonic() - sessions.SESSION_TTL_SECONDS - 1

    # Any call to get_or_create runs eviction first.
    sessions.get_or_create(None, uuid.uuid4())

    assert conv_id not in sessions._sessions
