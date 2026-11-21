from typing import Optional, Protocol


class Element(Protocol):
    parent: Optional["Element"]

    def select_one(self, selector: str) -> Optional["Element"]: ...


class TreeNode(Protocol):
    name: str
    children: list["TreeNode"]
    parent_node: Optional["TreeNode"]

    def get_parent(self) -> Optional["TreeNode"]: ...
    def get_children(self) -> list["TreeNode"]: ...


def find_scope(start: Element | None) -> Element | None:
    el = start
    while el is not None:
        if el.select_one("[data-scope]"):
            return el
        el = el.parent
    return None


def find_binding(start: TreeNode | None, target: str) -> TreeNode | None:
    current = start
    while current is not None:
        for child in current.get_children():
            if child.name == target:
                return child
        current = current.get_parent()
    return None


def has_named_child(start: TreeNode | None, target: str) -> TreeNode | None:
    node = start
    while node is not None:
        if any(child.name == target for child in node.children):
            return node
        node = node.parent_node
    return None
