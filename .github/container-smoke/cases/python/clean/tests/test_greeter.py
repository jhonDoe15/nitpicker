from demo.greeter import greet
from demo.legacy import clamp, value


def test_greet():
    assert greet("Ada") == "Hi, Ada!"


def test_value():
    assert value() == 1


def test_clamp():
    assert clamp(3) == 3
