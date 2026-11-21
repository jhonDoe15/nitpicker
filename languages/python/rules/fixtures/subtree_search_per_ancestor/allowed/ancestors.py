from typing import Optional, Protocol


class Element(Protocol):
    tag: str
    parent: Optional["Element"]
    next_sibling: Optional["Element"]

    def has_attribute(self, name: str) -> bool: ...
    def select_one(self, selector: str) -> Optional["Element"]: ...


class TreeNode(Protocol):
    kind: str
    name: str
    parent: Optional["TreeNode"]
    children: list["TreeNode"]


def find_scoped_attribute(start: Element | None) -> Element | None:
    el = start
    while el is not None:
        if el.has_attribute("data-scope"):
            return el
        el = el.parent
    return None


def find_in_blocks(start: TreeNode | None, target: str) -> TreeNode | None:
    current = start
    while current is not None:
        if current.kind == "block":
            for child in current.children:
                if child.name == target:
                    return child
        current = current.parent
    return None


def find_before_root(start: TreeNode | None, target: str) -> TreeNode | None:
    current = start
    while current is not None and current.kind != "root":
        for child in current.children:
            if child.name == target:
                return child
        current = current.parent
    return None


def find_memoized(
    start: Element | None, cache: dict[Element, bool]
) -> Element | None:
    el = start
    while el is not None:
        if cache.get(el) or el.select_one("[data-scope]") is not None:
            return el
        el = el.parent
    return None


def find_sibling(start: Element | None) -> Element | None:
    el = start
    while el is not None:
        if el.select_one("a"):
            return el
        el = el.next_sibling
    return None
