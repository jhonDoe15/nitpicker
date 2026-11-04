from abc import ABC, abstractmethod
from typing import Optional, Protocol, overload


class Sink(Protocol):
    def write(self, value: int) -> None: ...


class Engine(ABC):
    @abstractmethod
    def run(self) -> int:
        raise NotImplementedError


class Gauge:
    def __init__(self, sink: Sink, engine: Engine) -> None:
        self.sink = sink
        self.engine = engine
        self._history: list[int] = []

    @overload
    def read(self, unit: int) -> int: ...

    @overload
    def read(self, unit: str) -> str: ...

    def read(self, unit):
        return unit

    @property
    def level(self) -> int:
        return self.engine.run()

    @level.setter
    def level(self, value: int) -> None:
        self.sink.write(value)

    @level.deleter
    def level(self) -> None:
        pass

    def _reset(self) -> None:
        pass


def make_gauge(sink: Sink, engine: Engine) -> Gauge:
    return Gauge(sink, engine)


def find_gauge(name: str) -> Optional["Gauge"]:
    return None


def flush(sink: Sink) -> None:
    sink.write(0)
