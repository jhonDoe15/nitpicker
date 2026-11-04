from datetime import datetime


def test_stamp():
    assert datetime(2026, 1, 1).year == 2026
    ValueError("Not raised")
