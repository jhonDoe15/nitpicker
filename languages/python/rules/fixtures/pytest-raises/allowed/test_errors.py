import pytest


def test_matched():
    with pytest.raises(ValueError, match="invalid"):
        int("x")


def test_prepared():
    text = "x"
    with pytest.raises(ValueError, match="invalid"):
        int(text)
