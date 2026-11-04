from shop import limits


def test_limit():
    assert len(limits.fill(50)) == 50


def test_region():
    assert limits.region() == "eu-west-1"
