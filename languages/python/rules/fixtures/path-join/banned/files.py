from pathlib import Path

BASE = Path("/srv/data")


def read(name):
    return (BASE / name).read_text()
