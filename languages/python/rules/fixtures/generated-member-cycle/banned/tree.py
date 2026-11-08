from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Node:
    name: str
    parent: Node | None = None
    children: list[Node] = field(default_factory=list)
