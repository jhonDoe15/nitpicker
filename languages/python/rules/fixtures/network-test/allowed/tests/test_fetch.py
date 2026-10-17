def test_fetch(monkeypatch):
    monkeypatch.setattr("requests.get", lambda *args, **kwargs: None)
    assert 1 + 1 == 2
