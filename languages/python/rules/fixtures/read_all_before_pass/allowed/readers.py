from collections.abc import Callable
from pathlib import Path


def stream_one_by_one(paths: list[Path], summarize: Callable[[str], None]) -> None:
    for path in paths:
        summarize(path.read_text(encoding="utf-8"))


def fixed_pair(summarize: Callable[[str], None]) -> None:
    documents = [Path(name).read_text(encoding="utf-8") for name in ["a.txt", "b.txt"]]
    for document in documents:
        summarize(document)


def return_all(paths: list[Path]) -> list[str]:
    documents = [path.read_text(encoding="utf-8") for path in paths]
    return documents


def sort_then_pass(paths: list[Path], summarize: Callable[[str], None]) -> None:
    texts: list[str] = []
    for path in paths:
        texts.append(path.read_text(encoding="utf-8"))
    texts.sort()
    for text in texts:
        summarize(text)


def rewrite_all(paths: list[Path], output: Path) -> None:
    documents = [path.read_text(encoding="utf-8") for path in paths]
    for document in documents:
        output.write_text(document, encoding="utf-8")


def multiple_passes(
    paths: list[Path], rounds: list[int], summarize: Callable[[str], None]
) -> None:
    documents = [path.read_text(encoding="utf-8") for path in paths]
    for round_number in rounds:
        for document in documents:
            summarize(f"{round_number}:{document}")
