import subprocess

DEADLINE_SECONDS = 30
ERROR_LIMIT = 4000


def compile_project(args: list[str]) -> str:
    result = subprocess.run(
        args,
        capture_output=True,
        text=True,
        timeout=DEADLINE_SECONDS,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"build failed: {result.stderr[-ERROR_LIMIT:]}")
    return result.stdout
