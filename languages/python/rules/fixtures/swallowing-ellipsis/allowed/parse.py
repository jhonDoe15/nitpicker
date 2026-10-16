import contextlib


def parse(text: str) -> None:
    with contextlib.suppress(ValueError):
        int(text)
