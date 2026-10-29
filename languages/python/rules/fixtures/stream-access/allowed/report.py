from typing import TextIO


def report(total: int, out: TextIO) -> None:
    out.write(f"total: {total}\n")
