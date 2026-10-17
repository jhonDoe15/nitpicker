from pathlib import Path

BASE = Path("/srv/data").resolve()


def read(name: str) -> str:
    target = (BASE / name).resolve()
    if not target.is_relative_to(BASE):
        raise ValueError(name)
    return target.read_text()
