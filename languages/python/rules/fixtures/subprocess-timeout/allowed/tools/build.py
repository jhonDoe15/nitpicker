import asyncio
import subprocess

DEADLINE_SECONDS = 30


def compile_assets(args: list[str]) -> str:
    return subprocess.check_output(args, text=True, timeout=DEADLINE_SECONDS)


def convert(args: list[str]) -> bytes:
    with subprocess.Popen(args, stdout=subprocess.PIPE) as process:
        output, _ = process.communicate(timeout=DEADLINE_SECONDS)
        return output


async def render(args: list[str]) -> int:
    process = await asyncio.create_subprocess_exec(*args)
    async with asyncio.timeout(DEADLINE_SECONDS):
        return await process.wait()
