import os
import subprocess

DEADLINE_SECONDS = 30


def run_main(classpath: list[str], base_env: dict[str, str]) -> None:
    env = {**base_env, "CLASSPATH": os.pathsep.join(classpath)}
    subprocess.run(
        ["java", "Main"],
        env=env,
        timeout=DEADLINE_SECONDS,
        check=True,
    )
