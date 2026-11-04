from abc import ABC, abstractmethod
from typing import Generic, Protocol, TypeVar

T = TypeVar("T")


class Closer(Protocol):
    def open(self): ...

    def close(self): ...


class Store(ABC):
    @abstractmethod
    def put(self, item):
        pass


class Box(Generic[T]):
    def get(self):
        return None
