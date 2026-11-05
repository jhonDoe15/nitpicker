from shop import limits
from shop.limits import MAX_ITEMS


def test_limit():
    assert len(limits.fill(MAX_ITEMS + 1)) == MAX_ITEMS


def test_pinned_contract():
    assert limits.MAX_ITEMS == 50


def test_trivial_values():
    assert limits.retries() == 1
