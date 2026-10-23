import pytest

from library_app.cli import run
from library_app.composition_root import overdue_report_main
from library_app.features.fines import FineEntry, fine_cents, render_report
from library_app.features.members import Member, Tier


@pytest.mark.parametrize(
    ("daily_rate_cents", "days_late", "tier", "cents"),
    [
        (25, 3, Tier.STANDARD, 75),
        (25, 0, Tier.STANDARD, 0),
        (25, 1, Tier.STANDARD, 25),
        (25, 3, Tier.STUDENT, 37),
        (10, 2, Tier.STUDENT, 10),
        (1, 1, Tier.STUDENT, 0),
        (25, 19, Tier.STANDARD, 475),
        (25, 20, Tier.STANDARD, 500),
        (25, 21, Tier.STANDARD, 500),
        (25, 90, Tier.STUDENT, 250),
        (25, 19, Tier.STUDENT, 237),
    ],
)
def test_computes_the_fine_of_a_loan(
    daily_rate_cents: int, days_late: int, tier: Tier, cents: int
) -> None:
    assert fine_cents(daily_rate_cents, days_late, tier) == cents


ZED = Member("M1", "Zed", Tier.STANDARD)
AMY = Member("M2", "Amy", Tier.STANDARD)
KIM = Member("M3", "Kim", Tier.STUDENT)
BOB = Member("M4", "Bob", Tier.STANDARD)
DEE = Member("M5", "Dee", Tier.STANDARD)
OTHER_ZED = Member("M6", "Zed", Tier.STUDENT)


def test_totals_each_member_ranked_by_total_then_name() -> None:
    entries = [
        FineEntry(ZED, 50),
        FineEntry(ZED, 25),
        FineEntry(AMY, 75),
        FineEntry(KIM, 250),
        FineEntry(KIM, 0),
        FineEntry(BOB, 5),
        FineEntry(DEE, 1),
    ]
    assert render_report("2026-03-10", entries) == [
        "Overdue fines as of 2026-03-10",
        "Kim: $2.50",
        "Amy: $0.75",
        "Zed: $0.75",
        "Bob: $0.05",
        "Dee: $0.01",
    ]


def test_formats_whole_dollars_and_large_totals() -> None:
    entries = [FineEntry(AMY, 1200), FineEntry(BOB, 100500)]
    assert render_report("2026-03-10", entries) == [
        "Overdue fines as of 2026-03-10",
        "Bob: $1005.00",
        "Amy: $12.00",
    ]


def test_keeps_two_members_with_the_same_name_apart() -> None:
    entries = [FineEntry(ZED, 100), FineEntry(OTHER_ZED, 50)]
    assert render_report("2026-03-10", entries) == [
        "Overdue fines as of 2026-03-10",
        "Zed: $1.00",
        "Zed: $0.50",
    ]


@pytest.mark.parametrize(
    "entries",
    [
        [],
        [FineEntry(ZED, 0)],
        [FineEntry(ZED, 0), FineEntry(ZED, 0)],
    ],
)
def test_says_so_when_nothing_is_overdue(entries: list[FineEntry]) -> None:
    assert render_report("2026-03-10", entries) == [
        "Overdue fines as of 2026-03-10",
        "No overdue fines",
    ]


REPORTS = [
    (
        "2026-03-31",
        """Overdue fines as of 2026-03-31
Barbara Liskov: $11.00
Grace Hopper: $10.62
Alan Turing: $5.00
Brian Kernighan: $5.00
Ada Lovelace: $2.05
Edsger Dijkstra: $0.05
""",
    ),
    (
        "2026-04-10",
        """Overdue fines as of 2026-04-10
Barbara Liskov: $16.30
Grace Hopper: $11.87
Alan Turing: $6.00
Ada Lovelace: $5.55
Brian Kernighan: $5.00
Edsger Dijkstra: $1.80
""",
    ),
    (
        "2026-03-25",
        """Overdue fines as of 2026-03-25
Grace Hopper: $7.50
Barbara Liskov: $5.00
Brian Kernighan: $4.75
Alan Turing: $3.50
Ada Lovelace: $0.25
""",
    ),
    ("2026-03-06", "Overdue fines as of 2026-03-06\nNo overdue fines\n"),
]


@pytest.mark.parametrize(("as_of", "expected"), REPORTS)
def test_prints_the_report_for_the_seeded_library(
    as_of: str, expected: str, capsys: pytest.CaptureFixture[str]
) -> None:
    overdue_report_main(as_of)
    assert capsys.readouterr().out == expected


def test_runs_the_overdue_command(capsys: pytest.CaptureFixture[str]) -> None:
    run(["overdue", REPORTS[0][0]])
    assert capsys.readouterr().out == REPORTS[0][1]
