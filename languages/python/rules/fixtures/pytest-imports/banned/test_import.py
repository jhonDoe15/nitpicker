from pytest import raises


def test_import():
    with raises(ValueError, match="invalid"):
        int("x")
