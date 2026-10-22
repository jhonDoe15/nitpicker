import subprocess
from pathlib import Path


def run(command: list[str], directory: Path) -> None:
    subprocess.run(command, check=True)
    subprocess.run(
        ["ls", *sorted(str(item) for item in directory.glob("*.log"))], check=True
    )
    subprocess.run("ls -l", shell=True, check=True)
