import pytest


def test_import():
    with pytest.raises(ValueError, match="invalid"):
        int("x")
