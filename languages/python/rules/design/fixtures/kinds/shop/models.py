from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum, IntEnum
from typing import ClassVar, Literal, NamedTuple, Protocol, TypedDict

from pydantic import BaseModel, field_validator

__all__ = ["Cart", "Item", "REGISTRY", "Status"]

Mode = Literal["fast", "slow"]
REGISTRY: dict = {}
_CACHE = []
LIMIT = 3
LABELS = ("a", "b")
PLAIN = dict(a=1)


class Status(Enum):
    OPEN = "open"
    PAID = "paid"

    def label(self):
        return self.value


class Level(IntEnum):
    LOW = 1
    HIGH = 2


@dataclass
class Item:
    name: str
    tags: list = field(default_factory=list)
    qty: int = 1
    kind: ClassVar[str] = "item"


class Point(NamedTuple):
    x: int
    y: int


class Payload(TypedDict):
    body: str


class Customer(BaseModel):
    name: str
    history: list = []

    @field_validator("name")
    def clean(cls, value):
        return value.strip()


class Plain:
    def __init__(self, name):
        self.name = name
        self._secret = {}

    @property
    def title(self):
        return self.name

    def __repr__(self):
        return self.name


class Cart:
    registry = {}
    limit = 5

    def __init__(self, owner):
        self._items = []
        self.owner = owner
        self.index = dict()
        self.names = set()
        self.status = Status.OPEN
        self.copy = list(owner)
        self.reset()

    def reset(self):
        self._items = []
        self.index = None

    def add(self, item):
        self._items.append(item)
        self.names.add(item)


class Repo(Protocol):
    def save(self, item): ...


class Store(ABC):
    @abstractmethod
    def put(self, item):
        pass


class Outer:
    class Inner:
        def run(self):
            return 1

    def go(self):
        return self.Inner()


class _Hidden:
    def run(self):
        return 1
