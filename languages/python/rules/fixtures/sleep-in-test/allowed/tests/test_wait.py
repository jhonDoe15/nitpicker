def test_wait(monkeypatch):
    waited = []
    monkeypatch.setattr("time.sleep", waited.append)
    assert waited == []
