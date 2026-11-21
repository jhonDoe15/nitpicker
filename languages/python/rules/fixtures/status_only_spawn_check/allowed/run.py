import subprocess

DEADLINE_SECONDS = 30


def run_tool(args: list[str]) -> str:
    result = subprocess.run(
        args,
        capture_output=True,
        text=True,
        timeout=DEADLINE_SECONDS,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    return result.stdout
