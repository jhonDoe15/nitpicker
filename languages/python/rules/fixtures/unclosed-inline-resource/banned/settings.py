import json
from pathlib import Path
from urllib.request import urlopen


def load(path: str) -> dict[str, object]:
    return json.load(open(path, encoding="utf-8"))


def first(path: Path) -> str:
    return path.open(encoding="utf-8").readline()


def page(url: str) -> bytes:
    return urlopen(url, timeout=10).read()
