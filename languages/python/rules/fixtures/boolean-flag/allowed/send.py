from typing import Protocol

from typing_extensions import override


class Mailer:
    def deliver(self, message: str, *, urgent: bool) -> str:
        return f"!{message}" if urgent else message

    def set_urgent(self, urgent: bool) -> None:
        if urgent:
            self.level = 1

    def with_urgent(self, urgent: bool) -> "Mailer":
        if urgent:
            self.level = 1
        return self

    @classmethod
    def from_level(cls, strict: bool) -> "Mailer":
        return cls() if strict else cls()

    def __init__(self, strict: bool = False) -> None:
        if strict:
            self.level = 2

    def audit(self, enabled: bool) -> bool:
        return self._record(enabled)

    def _record(self, enabled: bool) -> bool:
        return 1 if enabled else 0


class Sender(Protocol):
    def deliver(self, message: str, urgent: bool) -> str: ...


class Loud(Mailer):
    @override
    def deliver(self, message: str, urgent: bool) -> str:
        return message if urgent else message.upper()


def stop(message, *, force=False):
    if force:
        return message.upper()
    return message


def keep(message: str, ready: bool) -> list[bool]:
    return [ready, bool(message)]


def _render(text: str, upper: bool) -> str:
    if upper:
        return text.upper()
    return text


def outer(text: str) -> str:
    def inner(upper: bool) -> str:
        return text.upper() if upper else text

    return inner(True)
