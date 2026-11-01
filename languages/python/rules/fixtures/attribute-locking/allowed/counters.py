import threading
from collections.abc import Callable


class Counters:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.locked = 0
        self.unlocked = 0
        self.helped = 0
        self.deferred = 0

    def __post_init__(self) -> None:
        self.locked = 1

    def locked_only(self) -> None:
        with self.lock:
            self.locked += 1
            self.bump_helped()
            self.deferred = 0

    def locked_again(self) -> None:
        with self.lock:
            self.locked = 0
            self.helped = 0

    def unlocked_only(self) -> None:
        self.unlocked += 1

    def unlocked_again(self) -> None:
        self.unlocked = 0

    def bump_helped(self) -> None:
        self.helped += 1

    def schedule(self) -> Callable[[], None]:
        def later() -> None:
            self.deferred += 1

        return later

    @classmethod
    def build(cls) -> "Counters":
        made = cls()
        made.locked = 3
        return made
