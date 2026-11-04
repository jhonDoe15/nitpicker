from core import Engine


def test_start():
    assert Engine().start() == 1
