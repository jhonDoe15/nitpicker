HANDLERS = {"a": 1}
NAMES = ("a", "b")


def lookup(name: str) -> int:
    return HANDLERS[name]


def with_handler(handlers: dict[str, int], name: str, handler: int) -> dict[str, int]:
    return {**handlers, name: handler}
