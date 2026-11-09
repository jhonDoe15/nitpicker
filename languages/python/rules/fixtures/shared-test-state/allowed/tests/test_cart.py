import pytest


@pytest.fixture
def seen():
    return []


def test_adds(seen):
    seen.append("a")
    assert seen == ["a"]
