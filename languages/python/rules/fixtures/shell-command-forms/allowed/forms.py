import subprocess

TIMEOUT_SECONDS = 30


def status() -> None:
    subprocess.run(["git", "status"], check=True, timeout=TIMEOUT_SECONDS)


def run_script(path: str) -> None:
    subprocess.run(["bash", path], check=True, timeout=TIMEOUT_SECONDS)


def explicit(cmd: list[str]) -> None:
    subprocess.run(cmd, shell=False, check=True, timeout=TIMEOUT_SECONDS)
