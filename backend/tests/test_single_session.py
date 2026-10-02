"""The single-active-session rule and the messages a signed-out device sees."""
import uuid
from types import SimpleNamespace

from app.services import auth as auth_service
from app.services import removal


def _user(session_id):
    return SimpleNamespace(session_id=session_id)


def test_token_with_current_session_id_is_valid():
    sid = uuid.uuid4()
    assert auth_service.token_matches_session(_user(sid), str(sid))


def test_token_from_a_previous_session_is_rejected():
    assert not auth_service.token_matches_session(_user(uuid.uuid4()), str(uuid.uuid4()))


def test_token_without_session_id_is_rejected_once_account_has_a_session():
    assert not auth_service.token_matches_session(_user(uuid.uuid4()), None)


def test_legacy_tokens_work_until_the_account_signs_in_again():
    assert auth_service.token_matches_session(_user(None), None)
    assert auth_service.token_matches_session(_user(None), str(uuid.uuid4()))


def test_each_end_reason_has_its_own_message_and_code():
    replaced = auth_service.session_error("replaced").detail
    password = auth_service.session_error("password_changed").detail
    unknown = auth_service.session_error(None).detail
    assert replaced["code"] == "session_replaced" and "another device" in replaced["message"]
    assert "password" in password["message"].lower()
    assert unknown["code"] == "session_ended"
    assert len({replaced["message"], password["message"], unknown["message"]}) == 3


def test_removal_summary_lists_only_what_went_along():
    assert removal.describe({"work_orders": 2, "attachments": 0, "timeline_entries": 1}) == \
        "2 work orders, 1 timeline entry"
    assert removal.describe({"photos": 0}) == ""
