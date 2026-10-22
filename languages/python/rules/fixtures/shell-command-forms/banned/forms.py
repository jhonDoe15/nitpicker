import asyncio
import os
import pty
import subprocess


def via_sh(cmd: str) -> None:
    subprocess.run(["sh", "-c", cmd], check=True)


def via_flag(cmd: str, *, use_shell: bool) -> None:
    subprocess.run(cmd, shell=use_shell, check=True)


def via_kwargs(cmd: str) -> None:
    subprocess.run(cmd, check=True, **{"shell": True})


async def via_asyncio(cmd: str) -> None:
    await asyncio.create_subprocess_shell(cmd)


def via_pty(cmd: str) -> int:
    return pty.spawn(["bash", "-c", cmd])


def via_exec(cmd: str) -> None:
    os.execvp("sh", ["sh", "-c", cmd])


def via_spawn(cmd: str) -> int:
    return os.spawnlp(os.P_WAIT, "sh", "sh", "-c", cmd)
