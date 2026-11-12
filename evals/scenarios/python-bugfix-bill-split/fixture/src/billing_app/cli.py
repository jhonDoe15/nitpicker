from collections.abc import Sequence

from .composition_root import main


def run(argv: Sequence[str]) -> None:
    total, *people = argv
    main(int(total), people)
