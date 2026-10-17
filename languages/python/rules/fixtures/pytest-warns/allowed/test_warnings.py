import pytest


def test_matched():
    with pytest.warns(UserWarning, match="old"):
        int("1")
