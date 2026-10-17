import os

from client import connect


def main() -> tuple[str, str]:
    return connect(os.environ["API_TOKEN"], os.environ["API_PASSWORD"])
