import subprocess
from pathlib import Path

DEADLINE_SECONDS = 30


def lint_sources(candidates: list[Path]) -> None:
    existing = [str(item) for item in candidates if item.exists()]
    if not existing:
        return
    subprocess.run(
        ["linter", "--dir", ",".join(existing)],
        timeout=DEADLINE_SECONDS,
        check=True,
    )
