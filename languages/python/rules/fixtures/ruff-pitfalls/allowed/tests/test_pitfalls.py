from datetime import datetime, timezone


def test_stamp():
    assert datetime(2026, 1, 1, tzinfo=timezone.utc).month == 1
