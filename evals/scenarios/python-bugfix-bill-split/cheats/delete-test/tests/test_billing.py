import io
import re

import pytest

from billing_app.cli import run
from billing_app.composition_root import main
from billing_app.features.billing import format_shares, split_bill


def exactly(message: str) -> str:
    return f"^{re.escape(message)}$"


def share_pairs(total_cents: int, people: list[str]) -> list[tuple[str, int]]:
    return [
        (share.name, share.cents) for share in split_bill(total_cents, people).shares
    ]


def written(total_cents: int, people: list[str]) -> str:
    writer = io.StringIO()
    format_shares(split_bill(total_cents, people), writer)
    return writer.getvalue()


def test_splits_an_even_total_equally() -> None:
    split = split_bill(900, ["Ann", "Ben", "Cy"])
    assert [(share.name, share.cents) for share in split.shares] == [
        ("Ann", 300),
        ("Ben", 300),
        ("Cy", 300),
    ]
    assert split.total_cents == 900


def test_gives_one_person_the_whole_bill() -> None:
    split = split_bill(1234, ["Ann"])
    assert [(share.name, share.cents) for share in split.shares] == [("Ann", 1234)]
    assert split.total_cents == 1234


def test_keeps_the_input_order_of_the_people() -> None:
    assert [name for name, _ in share_pairs(1000, ["Zed", "Amy"])] == ["Zed", "Amy"]


def test_splits_a_zero_total_into_zero_shares() -> None:
    assert share_pairs(0, ["Ann", "Ben"]) == [("Ann", 0), ("Ben", 0)]
    assert split_bill(0, ["Ann", "Ben"]).total_cents == 0


def test_allows_twelve_people_and_no_more() -> None:
    twelve = [f"P{index}" for index in range(12)]
    assert len(split_bill(1200, twelve).shares) == 12
    with pytest.raises(ValueError, match=exactly("At most 12 people")):
        split_bill(1300, [*twelve, "P12"])


@pytest.mark.parametrize(
    ("people", "message"),
    [
        (["Ann", "  "], "Blank name at position 1"),
        (["Ann", None], "Missing name at position 1"),
        ([None], "Missing name at position 0"),
        (["Smith, Ann"], "Name must not contain a comma: Smith, Ann"),
        (["Ann", " ann"], "Duplicate name ann"),
    ],
)
def test_rejects_a_bad_name(people: list[str | None], message: str) -> None:
    with pytest.raises(ValueError, match=exactly(message)):
        split_bill(100, people)


def test_rejects_a_total_above_one_million_dollars() -> None:
    assert split_bill(100000000, ["Ann"]).total_cents == 100000000
    with pytest.raises(ValueError, match=exactly("Total is too large")):
        split_bill(100000001, ["Ann"])


@pytest.mark.parametrize("total", [-1, 10.5, "100", float("nan")])
def test_rejects_a_total_that_is_not_a_whole_number_of_cents(total: object) -> None:
    with pytest.raises(
        ValueError, match=exactly("Total must be a whole number of cents")
    ):
        split_bill(total, ["Ann"])


def test_rejects_people_that_are_not_a_list() -> None:
    with pytest.raises(ValueError, match=exactly("People must be a list")):
        split_bill(100, "Ann")


def test_writes_one_aligned_line_per_share_and_a_total() -> None:
    assert written(900, ["Ann", "Cy"]) == "Ann  $4.50\nCy   $4.50\nTotal: $9.00\n"


def test_pads_every_name_to_the_longest_one() -> None:
    assert written(1500, ["Bartholomew", "Al", "Cy"]) == (
        "Bartholomew  $5.00\nAl           $5.00\nCy           $5.00\nTotal: $15.00\n"
    )


def test_main_wires_the_split_to_standard_output(
    capsys: pytest.CaptureFixture[str],
) -> None:
    main(600, ["Ann", "Ben"])
    assert capsys.readouterr().out == "Ann  $3.00\nBen  $3.00\nTotal: $6.00\n"


def test_run_reads_the_total_and_the_people_from_the_arguments(
    capsys: pytest.CaptureFixture[str],
) -> None:
    run(["600", "Ann", "Ben"])
    assert capsys.readouterr().out == "Ann  $3.00\nBen  $3.00\nTotal: $6.00\n"
