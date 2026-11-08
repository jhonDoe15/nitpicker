import io
import re

import pytest

from billing_app.cli import run
from billing_app.composition_root import main
from billing_app.features.billing import format_shares, split_bill

NAMES = [
    "Ann",
    "Ben",
    "Cy",
    "Dee",
    "Eli",
    "Flo",
    "Gus",
    "Hal",
    "Ivy",
    "Jon",
    "Kim",
    "Lou",
]


def exactly(message: str) -> str:
    return f"^{re.escape(message)}$"


def pairs(total_cents: int, people: list[str]) -> list[tuple[str, int]]:
    return [
        (share.name, share.cents) for share in split_bill(total_cents, people).shares
    ]


def written(total_cents: int, people: list[str]) -> str:
    writer = io.StringIO()
    format_shares(split_bill(total_cents, people), writer)
    return writer.getvalue()


def expected_cents(total_cents: int, count: int) -> list[int]:
    return [
        total_cents // count + (1 if position < total_cents % count else 0)
        for position in range(count)
    ]


def test_gives_the_reported_example_334_333_333_and_a_total_of_1000() -> None:
    split = split_bill(1000, ["Ann", "Ben", "Cy"])
    assert [(share.name, share.cents) for share in split.shares] == [
        ("Ann", 334),
        ("Ben", 333),
        ("Cy", 333),
    ]
    assert split.total_cents == 1000
    assert split.failure is None


def test_no_longer_over_assigns_when_the_share_rounds_up() -> None:
    split = split_bill(2000, ["Ann", "Ben", "Cy"])
    assert [(share.name, share.cents) for share in split.shares] == [
        ("Ann", 667),
        ("Ben", 667),
        ("Cy", 666),
    ]
    assert split.total_cents == 2000


def test_gives_the_extra_cents_to_the_first_people_in_input_order() -> None:
    assert pairs(10, ["Zed", "Amy", "Bob", "Cal"]) == [
        ("Zed", 3),
        ("Amy", 3),
        ("Bob", 2),
        ("Cal", 2),
    ]


@pytest.mark.parametrize(
    ("total_cents", "count"),
    [
        (0, 1),
        (0, 5),
        (1, 1),
        (1, 2),
        (1, 12),
        (2, 3),
        (5, 7),
        (6, 7),
        (7, 7),
        (8, 7),
        (100, 3),
        (101, 3),
        (102, 3),
        (999, 4),
        (1000, 12),
        (1001, 12),
        (1011, 12),
        (99999999, 11),
        (100000000, 12),
        (100000000, 7),
        (25, 2),
        (35, 2),
    ],
)
def test_splits_exactly(total_cents: int, count: int) -> None:
    split = split_bill(total_cents, NAMES[:count])
    assert [(share.name, share.cents) for share in split.shares] == list(
        zip(NAMES[:count], expected_cents(total_cents, count), strict=True)
    )
    assert split.total_cents == total_cents
    assert sum(share.cents for share in split.shares) == total_cents


def test_applies_the_rule_to_trimmed_and_cut_names_in_input_order() -> None:
    assert pairs(101, ["  Ann ", "Ben\t", "C" * 30]) == [
        ("Ann", 34),
        ("Ben", 34),
        ("C" * 24, 33),
    ]


def test_prints_the_remainder_on_the_first_lines() -> None:
    assert written(1000, ["Ann", "Ben", "Cy"]) == (
        "Ann  $3.34\nBen  $3.33\nCy   $3.33\nTotal: $10.00\n"
    )
    assert written(2000, ["Ann", "Ben", "Cy"]) == (
        "Ann  $6.67\nBen  $6.67\nCy   $6.66\nTotal: $20.00\n"
    )


def test_main_writes_the_remainder(capsys: pytest.CaptureFixture[str]) -> None:
    main(1000, ["Ann", "Ben", "Cy"])
    assert (
        capsys.readouterr().out == "Ann  $3.34\nBen  $3.33\nCy   $3.33\nTotal: $10.00\n"
    )


def test_run_writes_the_remainder(capsys: pytest.CaptureFixture[str]) -> None:
    run(["1000", "Ann", "Ben", "Cy"])
    assert (
        capsys.readouterr().out == "Ann  $3.34\nBen  $3.33\nCy   $3.33\nTotal: $10.00\n"
    )


@pytest.mark.parametrize("total_cents", [0, 1, 1000, 100000000])
def test_returns_the_failure_result_for_an_empty_party(total_cents: int) -> None:
    result = split_bill(total_cents, [])
    assert result.shares == []
    assert result.total_cents == total_cents
    assert result.failure == "no-people"


def test_does_not_flag_a_successful_split() -> None:
    assert split_bill(1000, ["Ann", "Ben"]).failure is None
    assert split_bill(0, ["Ann"]).failure is None


def test_prints_a_single_line_for_the_failure_result() -> None:
    assert written(1000, []) == "Nobody to split between\n"


def test_main_prints_the_same_single_line(capsys: pytest.CaptureFixture[str]) -> None:
    main(1000, [])
    assert capsys.readouterr().out == "Nobody to split between\n"


@pytest.mark.parametrize("total", [-1, 10.5, "100", float("nan")])
def test_checks_the_total_before_looking_at_the_people(total: object) -> None:
    with pytest.raises(
        ValueError, match=exactly("Total must be a whole number of cents")
    ):
        split_bill(total, [])


def test_rejects_a_total_that_is_too_large_even_without_people() -> None:
    with pytest.raises(ValueError, match=exactly("Total is too large")):
        split_bill(100000001, [])


@pytest.mark.parametrize("people", ["Ann", None, ("Ann",)])
def test_checks_that_people_is_a_list_before_counting_them(people: object) -> None:
    with pytest.raises(ValueError, match=exactly("People must be a list")):
        split_bill(100, people)


def test_splits_an_even_total_equally() -> None:
    assert pairs(900, ["Ann", "Ben", "Cy"]) == [("Ann", 300), ("Ben", 300), ("Cy", 300)]


@pytest.mark.parametrize(
    ("people", "message"),
    [
        (["Ann", "  "], "Blank name at position 1"),
        (["Ann", None], "Missing name at position 1"),
        ([None], "Missing name at position 0"),
        (["Smith, Ann"], "Name must not contain a comma: Smith, Ann"),
        (["Ann", " ann"], "Duplicate name ann"),
        (["Ann", "ANN"], "Duplicate name ANN"),
        ([*NAMES, "Max"], "At most 12 people"),
        (["A" * 30, "A" * 25], f"Duplicate name {'A' * 24}"),
    ],
)
def test_keeps_every_validation_message_and_its_order(
    people: list[str | None], message: str
) -> None:
    with pytest.raises(ValueError, match=exactly(message)):
        split_bill(100, people)


def test_still_rejects_a_total_above_one_million_dollars_for_one_person() -> None:
    with pytest.raises(ValueError, match=exactly("Total is too large")):
        split_bill(100000001, ["Ann"])


def test_pads_names_to_the_longest_one() -> None:
    assert written(1500, ["Bartholomew", "Al", "Cy"]) == (
        "Bartholomew  $5.00\nAl           $5.00\nCy           $5.00\nTotal: $15.00\n"
    )


def test_prints_a_zero_total_as_zero_shares() -> None:
    assert written(0, ["Ann", "Ben"]) == "Ann  $0.00\nBen  $0.00\nTotal: $0.00\n"


def test_formats_cents_under_ten_with_a_leading_zero() -> None:
    assert written(205, ["Ann"]) == "Ann  $2.05\nTotal: $2.05\n"
