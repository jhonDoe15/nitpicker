import warnings

import pytest


def test_broad():
    with pytest.warns(UserWarning):
        warnings.warn("old")


def test_multiple():
    with pytest.warns(UserWarning, match="old"):
        text = "x"
        warnings.warn(text)
