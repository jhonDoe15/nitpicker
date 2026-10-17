import pytest


def test_none():
    with pytest.raises():
        int("x")


def test_broad():
    with pytest.raises(ValueError):
        int("x")


def test_multiple():
    with pytest.raises(ValueError, match="invalid"):
        text = "x"
        int(text)
