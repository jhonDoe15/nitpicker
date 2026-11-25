import subprocess

DEADLINE_SECONDS = 60


def run_build() -> None:
    subprocess.run(
        ["npm", "run", "build"],
        timeout=DEADLINE_SECONDS,
        check=True,
    )
