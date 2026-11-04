from datetime import datetime, timezone


def test_fixed():
    assert datetime(2026, 1, 1, tzinfo=timezone.utc).month == 1
