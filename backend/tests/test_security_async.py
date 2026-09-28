from threading import get_ident

import pytest

from app.core import security

pytestmark = pytest.mark.no_db


async def test_password_hash_and_verification_run_outside_event_loop(monkeypatch):
    caller_thread = get_ident()
    worker_threads = []

    def hash_in_thread(password):
        worker_threads.append(get_ident())
        return f"encoded-{password}"

    def verify_in_thread(password, encoded):
        worker_threads.append(get_ident())
        return encoded == f"encoded-{password}"

    monkeypatch.setattr(security, "hash_password", hash_in_thread)
    monkeypatch.setattr(security, "verify_password", verify_in_thread)
    encoded = await security.hash_password_async("test-value")
    assert encoded == "encoded-test-value"
    assert await security.verify_password_async("test-value", encoded)
    assert worker_threads and all(thread != caller_thread for thread in worker_threads)
