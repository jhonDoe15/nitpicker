import io

import pytest

from billing_app.composition_root import main
from billing_app.features.billing import format_shares, split_bill

TRIO = ["Ann", "Ben", "Cy"]


def written(total_cents: int, people: list[str]) -> str:
    writer = io.StringIO()
    format_shares(split_bill(total_cents, people), writer)
    return writer.getvalue()


@pytest.mark.parametrize(
    ("total_cents", "people", "cents"),
    [
        (1000, TRIO, [334, 333, 333]),
        (2000, TRIO, [667, 667, 666]),
        (1001, TRIO, [334, 334, 333]),
        (10, ["A", "B", "C", "D"], [3, 3, 2, 2]),
        (2, TRIO, [1, 1, 0]),
        (1, ["A", "B"], [1, 0]),
        (5, ["A", "B"], [3, 2]),
        (0, TRIO, [0, 0, 0]),
        (900, TRIO, [300, 300, 300]),
    ],
)
def test_gives_the_leftover_cents_to_the_first_people(
    total_cents: int, people: list[str], cents: list[int]
) -> None:
    split = split_bill(total_cents, people)
    assert [(share.name, share.cents) for share in split.shares] == list(
        zip(people, cents, strict=True)
    )
    assert split.total_cents == total_cents
    assert split.failure is None


def test_returns_a_failure_result_for_an_empty_party() -> None:
    split = split_bill(1000, [])
    assert split.shares == []
    assert split.total_cents == 1000
    assert split.failure == "no-people"


def test_checks_the_total_before_the_people() -> None:
    with pytest.raises(ValueError, match=r"^Total must be a whole number of cents$"):
        split_bill(-5, [])


def test_prints_the_leftover_cents_on_the_first_lines() -> None:
    assert written(1000, TRIO) == (
        "Ann  $3.34\nBen  $3.33\nCy   $3.33\nTotal: $10.00\n"
    )


def test_says_there_is_nobody_to_split_between() -> None:
    assert written(1000, []) == "Nobody to split between\n"


def test_main_prints_the_single_line_for_an_empty_party(
    capsys: pytest.CaptureFixture[str],
) -> None:
    main(1000, [])
    assert capsys.readouterr().out == "Nobody to split between\n"
