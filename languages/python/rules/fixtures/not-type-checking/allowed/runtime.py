from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Sequence


def first(values: "Sequence[str]") -> str:
    return values[0]
