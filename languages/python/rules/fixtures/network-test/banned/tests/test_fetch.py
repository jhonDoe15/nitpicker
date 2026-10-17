import requests


def test_fetch():
    assert requests.get("https://example.com", timeout=10).ok
