import subprocess
from pathlib import Path

TIMEOUT_SECONDS = 30


def run(command: list[str], directory: Path) -> None:
    subprocess.run(command, check=True, timeout=TIMEOUT_SECONDS)
    subprocess.run(
        ["ls", *sorted(str(item) for item in directory.glob("*.log"))],
        check=True,
        timeout=TIMEOUT_SECONDS,
    )
    subprocess.run("ls -l", shell=True, check=True, timeout=TIMEOUT_SECONDS)
