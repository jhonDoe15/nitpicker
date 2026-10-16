import contextlib


def parse(text: str) -> None:
    with contextlib.suppress(Exception):
        int(text)
