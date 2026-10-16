import time


def start() -> list[str]:
    return ["started"]


def test_worker_starts() -> None:
    events = start()
    time.sleep(1)
    assert events == ["started"]
