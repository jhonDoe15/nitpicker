from dataclasses import dataclass

from .calendar_days import day_number


@dataclass(frozen=True)
class Loan:
    book_id: str
    member_id: str
    borrowed_on: str
    due_on: str
    returned_on: str | None = None


def days_late(loan: Loan, as_of: str) -> int:
    end = day_number(as_of)
    if loan.returned_on is not None:
        end = min(end, day_number(loan.returned_on))
    return max(0, end - day_number(loan.due_on))


def describe_loan(title: str, loan: Loan, as_of: str) -> str:
    borrowed = f"{title}: borrowed {loan.borrowed_on}"
    if loan.returned_on is not None and loan.returned_on <= as_of:
        return f"{borrowed}, returned {loan.returned_on}"
    late = days_late(loan, as_of)
    if late == 0:
        return f"{borrowed}, due {loan.due_on}"
    return f"{borrowed}, due {loan.due_on}, {late}d late"
