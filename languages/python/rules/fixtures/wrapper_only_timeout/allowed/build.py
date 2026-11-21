import os
import signal
import subprocess

DEADLINE_SECONDS = 60


def run_build() -> None:
    with subprocess.Popen(["npm", "run", "build"], start_new_session=True) as proc:
        try:
            proc.wait(timeout=DEADLINE_SECONDS)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.wait(timeout=DEADLINE_SECONDS)
            raise
