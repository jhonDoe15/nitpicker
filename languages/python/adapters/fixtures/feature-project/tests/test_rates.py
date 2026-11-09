from app.features.billing._rates import rate


def test_rate() -> None:
    assert rate() == 1
