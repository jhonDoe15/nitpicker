from collections.abc import Sequence

from ..domain.loan import Loan


class InMemoryLoans:
    def __init__(self, loans: Sequence[Loan]) -> None:
        self._loans = tuple(loans)

    def all(self) -> tuple[Loan, ...]:
        return self._loans

    def for_member(self, member_id: str) -> tuple[Loan, ...]:
        return tuple(loan for loan in self._loans if loan.member_id == member_id)
