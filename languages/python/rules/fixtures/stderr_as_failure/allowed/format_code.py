import subprocess

DEADLINE_SECONDS = 30


def format_code(target: str) -> str:
    result = subprocess.run(
        ["formatter", "--check", target],
        capture_output=True,
        text=True,
        timeout=DEADLINE_SECONDS,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    return result.stdout
