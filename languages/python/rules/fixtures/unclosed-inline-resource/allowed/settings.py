import json
from contextlib import closing
from pathlib import Path
from urllib.request import urlopen


def load(path: str) -> dict[str, object]:
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def first(path: Path) -> str:
    return path.read_text(encoding="utf-8").splitlines()[0]


def page(url: str) -> bytes:
    with closing(urlopen(url, timeout=10)) as response:
        return response.read()
