from collections.abc import Sequence

from ..domain.member import Member


class InMemoryMembers:
    def __init__(self, members: Sequence[Member]) -> None:
        self._members = tuple(members)

    def find(self, member_id: str) -> Member | None:
        return next(
            (member for member in self._members if member.id == member_id), None
        )
