from collections.abc import Sequence
from pathlib import Path

from .composition_root import main, main_includes


def read_sources(directory: Path) -> dict[str, str]:
    return {
        file.name: file.read_text() for file in directory.iterdir() if file.is_file()
    }


def run(argv: Sequence[str]) -> None:
    if argv[0] == "--includes":
        path = Path(argv[1])
        main_includes(path.name, read_sources(path.parent))
        return
    main(Path(argv[0]).read_text())
