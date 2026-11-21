import json
from collections.abc import Callable
from pathlib import Path


def summarize_texts(paths: list[Path], summarize: Callable[[str], None]) -> None:
    documents = [path.read_text(encoding="utf-8") for path in paths]
    for document in documents:
        summarize(document)


def summarize_opened(paths: list[Path], summarize: Callable[[str], None]) -> None:
    contents: list[str] = []
    for path in paths:
        with open(path, encoding="utf-8") as handle:
            contents.append(handle.read())
    for content in contents:
        summarize(content)


def summarize_configs(paths: list[Path], summarize: Callable[[object], None]) -> None:
    configs = [json.loads(path.read_text(encoding="utf-8")) for path in paths]
    for config in configs:
        summarize(config)
