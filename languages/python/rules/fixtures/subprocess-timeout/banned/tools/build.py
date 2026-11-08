import subprocess


def compile_assets(args: list[str]) -> str:
    return subprocess.check_output(args, text=True)
