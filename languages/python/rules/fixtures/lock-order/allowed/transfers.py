import threading
from collections.abc import Callable


class Ordered:
    def __init__(self, outer: threading.Lock) -> None:
        self.first = threading.Lock()
        self.second = threading.Lock()
        self.reentrant = threading.RLock()
        self.outer = outer
        self.count = 0

    def add(self) -> None:
        with self.first, self.second:
            self.count += 1

    def remove(self) -> None:
        with self.first:
            with self.second:
                self.count -= 1

    def single(self) -> None:
        with self.second:
            self.count *= 1

    def again(self) -> None:
        with self.reentrant:
            with self.reentrant:
                self.count += 2

    def passed(self) -> None:
        with self.outer:
            with self.first:
                self.count += 3

    def passed_back(self, lock: threading.Lock) -> None:
        with self.first:
            with lock:
                self.count -= 3

    def local(self) -> None:
        second = threading.Lock()
        with second:
            with self.first:
                self.count += 4

    def later(self) -> Callable[[], None]:
        with self.second:

            def run() -> None:
                with self.first:
                    self.count -= 4

            return run
