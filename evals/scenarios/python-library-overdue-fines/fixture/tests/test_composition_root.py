import pytest

from library_app.cli import run
from library_app.composition_root import catalog_main, loans_main, member_loans_main

AS_OF = "2026-03-31"

CATALOG = """B1 Dune (novel, 25c/day)
B2 World Atlas (reference, 100c/day)
B3 The Gruffalo (children, 10c/day)
B4 Nature Monthly (periodical, 50c/day)
"""

LOANS = """M1: Dune: borrowed 2026-03-10, due 2026-03-24, 7d late
M1: The Gruffalo: borrowed 2026-03-14, due 2026-03-28, 3d late
M2: World Atlas: borrowed 2026-02-24, due 2026-03-10, 21d late
M2: Dune: borrowed 2026-03-12, due 2026-03-26, 5d late
M3: Dune: borrowed 2026-02-20, due 2026-03-06, 25d late
M4: Nature Monthly: borrowed 2026-03-07, returned 2026-03-23
M4: Dune: borrowed 2026-03-01, due 2026-03-15, 16d late
M5: The Gruffalo: borrowed 2026-03-16, due 2026-03-30, 1d late
M5: Dune: borrowed 2026-03-17, due 2026-03-31
M5: World Atlas: borrowed 2026-03-06, returned 2026-03-20
M6: World Atlas: borrowed 2026-03-06, due 2026-03-20, 11d late
M6: The Gruffalo: borrowed 2026-03-24, due 2026-04-07
M1: B99: borrowed 2026-02-15, due 2026-03-01, 30d late
M99: Dune: borrowed 2026-02-16, due 2026-03-02, 29d late
"""

MEMBER_LISTINGS = [
    (
        "M1",
        """Loans for Ada Lovelace
Dune: borrowed 2026-03-10, due 2026-03-24, 7d late
The Gruffalo: borrowed 2026-03-14, due 2026-03-28, 3d late
B99: borrowed 2026-02-15, due 2026-03-01, 30d late
""",
    ),
    (
        "M2",
        """Loans for Grace Hopper
World Atlas: borrowed 2026-02-24, due 2026-03-10, 21d late
Dune: borrowed 2026-03-12, due 2026-03-26, 5d late
""",
    ),
    (
        "M4",
        """Loans for Alan Turing
Nature Monthly: borrowed 2026-03-07, returned 2026-03-23
Dune: borrowed 2026-03-01, due 2026-03-15, 16d late
""",
    ),
    (
        "M5",
        """Loans for Edsger Dijkstra
The Gruffalo: borrowed 2026-03-16, due 2026-03-30, 1d late
Dune: borrowed 2026-03-17, due 2026-03-31
World Atlas: borrowed 2026-03-06, returned 2026-03-20
""",
    ),
    (
        "M6",
        """Loans for Barbara Liskov
World Atlas: borrowed 2026-03-06, due 2026-03-20, 11d late
The Gruffalo: borrowed 2026-03-24, due 2026-04-07
""",
    ),
    ("M42", "Unknown member M42\n"),
]


def test_lists_the_catalog(capsys: pytest.CaptureFixture[str]) -> None:
    catalog_main()
    assert capsys.readouterr().out == CATALOG


def test_lists_every_loan(capsys: pytest.CaptureFixture[str]) -> None:
    loans_main(AS_OF)
    assert capsys.readouterr().out == LOANS


@pytest.mark.parametrize(("member_id", "expected"), MEMBER_LISTINGS)
def test_lists_the_loans_of_a_member(
    member_id: str, expected: str, capsys: pytest.CaptureFixture[str]
) -> None:
    member_loans_main(member_id, AS_OF)
    assert capsys.readouterr().out == expected


@pytest.mark.parametrize(
    ("argv", "expected"),
    [
        (["catalog"], CATALOG),
        (["loans", AS_OF], LOANS),
        (["member", "M4", AS_OF], MEMBER_LISTINGS[2][1]),
    ],
)
def test_runs_a_command(
    argv: list[str], expected: str, capsys: pytest.CaptureFixture[str]
) -> None:
    run(argv)
    assert capsys.readouterr().out == expected


def test_rejects_an_unknown_command() -> None:
    with pytest.raises(ValueError, match=r"^Unknown command bogus$"):
        run(["bogus"])
