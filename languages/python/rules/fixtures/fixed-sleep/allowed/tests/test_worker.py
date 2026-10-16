import time


def start() -> list[str]:
    return ["started"]


def wait_until(ready: object, timeout: float = 5) -> None:
    deadline = time.monotonic() + timeout
    while not ready:
        if time.monotonic() > deadline:
            raise TimeoutError
        time.sleep(0.05)


def test_worker_starts() -> None:
    events = start()
    wait_until(events)
    assert events == ["started"]
