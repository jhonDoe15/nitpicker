import os
import subprocess

DEADLINE_SECONDS = 30


def run_main(classpath: list[str]) -> None:
    subprocess.run(
        ["java", "-cp", os.pathsep.join(classpath), "Main"],
        timeout=DEADLINE_SECONDS,
        check=True,
    )
