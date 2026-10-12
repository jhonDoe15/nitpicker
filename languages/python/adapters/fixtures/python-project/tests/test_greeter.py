from demo.greeter import greet
from demo.legacy import value


def test_greet():
    assert greet("Ada") == "Hello, Ada!"


def test_value():
    assert value() == 1
