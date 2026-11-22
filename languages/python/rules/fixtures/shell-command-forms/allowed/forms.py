import os
import signal
import subprocess

TIMEOUT_SECONDS = 30


def status() -> None:
    subprocess.run(["git", "status"], check=True, timeout=TIMEOUT_SECONDS)


def run_script(path: str) -> None:
    with subprocess.Popen(["bash", path], start_new_session=True) as proc:
        try:
            proc.wait(timeout=TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.wait(timeout=TIMEOUT_SECONDS)
            raise


def explicit(cmd: list[str]) -> None:
    subprocess.run(cmd, shell=False, check=True, timeout=TIMEOUT_SECONDS)
