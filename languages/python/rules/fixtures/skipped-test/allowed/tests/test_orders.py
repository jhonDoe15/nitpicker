import sys

import pytest


@pytest.mark.skipif(sys.platform == "win32", reason="posix only")
def test_total():
    assert 1 + 1 == 2


def test_other():
    if sys.platform == "win32":
        pytest.skip("posix only")
    assert 1 + 1 == 2
