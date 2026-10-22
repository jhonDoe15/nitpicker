import subprocess


def status() -> None:
    subprocess.run(["git", "status"], check=True)


def run_script(path: str) -> None:
    subprocess.run(["bash", path], check=True)


def explicit(cmd: list[str]) -> None:
    subprocess.run(cmd, shell=False, check=True)
