from typing import Protocol


class Store(Protocol):
    def save(self, name: str, text: str) -> None: ...


def save(store: Store, name: str, text: str) -> None:
    store.save(name, text)
