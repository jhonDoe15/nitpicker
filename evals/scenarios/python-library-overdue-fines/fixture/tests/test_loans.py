import pytest

from library_app.features.loans import InMemoryLoans, Loan, days_late, describe_loan

OPEN = Loan("B1", "M1", "2026-03-01", "2026-03-15")
RETURNED_LATE = Loan("B1", "M1", "2026-03-01", "2026-03-15", "2026-03-18")
RETURNED_ON_TIME = Loan("B1", "M1", "2026-03-01", "2026-03-15", "2026-03-12")


@pytest.mark.parametrize(
    ("loan", "as_of", "late"),
    [
        (OPEN, "2026-03-10", 0),
        (OPEN, "2026-03-15", 0),
        (OPEN, "2026-03-16", 1),
        (Loan("B1", "M1", "2028-02-01", "2028-02-27"), "2028-03-02", 4),
        (Loan("B1", "M1", "2026-02-01", "2026-02-27"), "2026-03-02", 3),
        (RETURNED_LATE, "2026-04-30", 3),
        (RETURNED_LATE, "2026-03-18", 3),
        (RETURNED_ON_TIME, "2026-04-30", 0),
        (RETURNED_LATE, "2026-03-17", 2),
        (RETURNED_LATE, "2026-03-10", 0),
    ],
)
def test_counts_the_days_a_loan_is_late(loan: Loan, as_of: str, late: int) -> None:
    assert days_late(loan, as_of) == late


@pytest.mark.parametrize(
    ("loan", "as_of", "text"),
    [
        (OPEN, "2026-03-15", "Dune: borrowed 2026-03-01, due 2026-03-15"),
        (OPEN, "2026-03-20", "Dune: borrowed 2026-03-01, due 2026-03-15, 5d late"),
        (RETURNED_LATE, "2026-03-20", "Dune: borrowed 2026-03-01, returned 2026-03-18"),
        (RETURNED_LATE, "2026-03-18", "Dune: borrowed 2026-03-01, returned 2026-03-18"),
        (
            RETURNED_LATE,
            "2026-03-17",
            "Dune: borrowed 2026-03-01, due 2026-03-15, 2d late",
        ),
    ],
)
def test_describes_a_loan(loan: Loan, as_of: str, text: str) -> None:
    assert describe_loan("Dune", loan, as_of) == text


def test_lists_loans_all_or_per_member() -> None:
    other = Loan("B1", "M2", "2026-03-01", "2026-03-15")
    repository = InMemoryLoans([OPEN, other])
    assert repository.all() == (OPEN, other)
    assert repository.for_member("M2") == (other,)
    assert repository.for_member("M3") == ()
