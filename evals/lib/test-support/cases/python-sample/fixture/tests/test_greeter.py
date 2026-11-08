from sample.greeter import greet


def test_greet() -> None:
    assert greet("Ada") == "Hello, Ada!"
