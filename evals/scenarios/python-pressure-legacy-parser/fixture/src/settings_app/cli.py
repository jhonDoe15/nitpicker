from collections.abc import Sequence
from pathlib import Path

from .composition_root import main


def run(argv: Sequence[str]) -> None:
    main(Path(argv[0]).read_text())
