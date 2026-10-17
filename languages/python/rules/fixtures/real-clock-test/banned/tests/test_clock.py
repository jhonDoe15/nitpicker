from datetime import datetime


def test_now():
    assert datetime.now().year > 2000
