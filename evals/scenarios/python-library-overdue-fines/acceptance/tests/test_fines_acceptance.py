import pytest

from library_app.cli import run
from library_app.composition_root import (
    catalog_main,
    member_loans_main,
    overdue_report_main,
)
from library_app.features.fines import fine_cents
from library_app.features.members import Tier


def capture(capsys: pytest.CaptureFixture[str]) -> str:
    return capsys.readouterr().out


@pytest.mark.parametrize(
    ("daily_rate_cents", "days_late", "cents"),
    [
        (25, 1, 25),
        (25, 3, 75),
        (100, 7, 700),
        (50, 0, 0),
        (25, 19, 475),
        (25, 20, 500),
        (25, 21, 500),
        (100, 365, 2000),
        (10, 1, 10),
    ],
)
def test_charges_the_daily_rate_for_each_day_late_up_to_the_cap(
    daily_rate_cents: int, days_late: int, cents: int
) -> None:
    assert fine_cents(daily_rate_cents, days_late, Tier.STANDARD) == cents


@pytest.mark.parametrize(
    ("daily_rate_cents", "days_late", "cents"),
    [
        (25, 1, 12),
        (25, 3, 37),
        (10, 3, 15),
        (1, 1, 0),
        (100, 0, 0),
        (25, 19, 237),
        (25, 20, 250),
        (25, 21, 250),
        (100, 500, 1000),
        (3, 5, 7),
    ],
)
def test_halves_the_capped_fine_for_students_rounding_down(
    daily_rate_cents: int, days_late: int, cents: int
) -> None:
    assert fine_cents(daily_rate_cents, days_late, Tier.STUDENT) == cents


def test_accepts_the_tier_as_its_string_value() -> None:
    assert fine_cents(25, 3, Tier("student")) == 37
    assert fine_cents(25, 3, Tier("standard")) == 75


REPORTS = [
    (
        "2026-03-31",
        """Overdue fines as of 2026-03-31
Barbara Lane: $11.00
Grace Mill: $10.62
Alan Fox: $5.00
Brian Cole: $5.00
Ada Stone: $2.05
Edgar Dunn: $0.05
""",
    ),
    (
        "2026-03-25",
        """Overdue fines as of 2026-03-25
Grace Mill: $7.50
Barbara Lane: $5.00
Brian Cole: $4.75
Alan Fox: $3.50
Ada Stone: $0.25
""",
    ),
    (
        "2026-04-10",
        """Overdue fines as of 2026-04-10
Barbara Lane: $16.30
Grace Mill: $11.87
Alan Fox: $6.00
Ada Stone: $5.55
Brian Cole: $5.00
Edgar Dunn: $1.80
""",
    ),
    (
        "2026-04-30",
        """Overdue fines as of 2026-04-30
Barbara Lane: $18.00
Grace Mill: $12.50
Ada Stone: $7.00
Alan Fox: $6.00
Brian Cole: $5.00
Edgar Dunn: $3.50
""",
    ),
    (
        "2027-01-01",
        """Overdue fines as of 2027-01-01
Barbara Lane: $18.00
Grace Mill: $12.50
Ada Stone: $7.00
Alan Fox: $6.00
Brian Cole: $5.00
Edgar Dunn: $3.50
""",
    ),
    (
        "2026-03-22",
        """Overdue fines as of 2026-03-22
Grace Mill: $6.00
Brian Cole: $4.00
Alan Fox: $2.25
Barbara Lane: $2.00
""",
    ),
    (
        "2026-03-11",
        """Overdue fines as of 2026-03-11
Brian Cole: $1.25
Grace Mill: $0.50
""",
    ),
    ("2026-03-06", "Overdue fines as of 2026-03-06\nNo overdue fines\n"),
]


@pytest.mark.parametrize(("as_of", "expected"), REPORTS)
def test_prints_the_overdue_report_of_the_seeded_library(
    as_of: str, expected: str, capsys: pytest.CaptureFixture[str]
) -> None:
    overdue_report_main(as_of)
    assert capture(capsys) == expected


@pytest.mark.parametrize(("as_of", "expected"), REPORTS)
def test_runs_the_overdue_command(
    as_of: str, expected: str, capsys: pytest.CaptureFixture[str]
) -> None:
    run(["overdue", as_of])
    assert capture(capsys) == expected


def test_gives_the_same_report_each_time_and_leaves_the_other_commands_alone(
    capsys: pytest.CaptureFixture[str],
) -> None:
    catalog_main()
    catalog_before = capture(capsys)
    member_loans_main("M4", "2026-03-31")
    loans_before = capture(capsys)
    overdue_report_main("2026-03-31")
    first = capture(capsys)
    overdue_report_main("2026-04-10")
    assert capture(capsys) != first
    overdue_report_main("2026-03-31")
    assert capture(capsys) == first
    catalog_main()
    assert capture(capsys) == catalog_before
    member_loans_main("M4", "2026-03-31")
    assert capture(capsys) == loans_before
    assert loans_before == (
        "Loans for Alan Fox\n"
        "Nature Monthly: borrowed 2026-03-07, returned 2026-03-23\n"
        "Dune: borrowed 2026-03-01, due 2026-03-15, 16d late\n"
    )


def test_keeps_the_other_commands_working(capsys: pytest.CaptureFixture[str]) -> None:
    run(["member", "M5", "2026-03-31"])
    assert capture(capsys) == (
        "Loans for Edgar Dunn\n"
        "The Gruffalo: borrowed 2026-03-16, due 2026-03-30, 1d late\n"
        "Dune: borrowed 2026-03-17, due 2026-03-31\n"
        "World Atlas: borrowed 2026-03-06, returned 2026-03-20\n"
    )
