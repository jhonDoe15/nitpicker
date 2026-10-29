import io
import re
from pathlib import Path

import pytest

from settings_app.cli import run
from settings_app.composition_root import main
from settings_app.features.settings import parse_settings, print_settings


def exactly(message: str) -> str:
    return f"^{re.escape(message)}$"


def printed(text: str) -> str:
    writer = io.StringIO()
    print_settings(text, writer)
    return writer.getvalue()


def test_reads_key_value_lines() -> None:
    assert parse_settings("name = Ada\nlang=en") == {"name": ["Ada"], "lang": ["en"]}


def test_splits_a_value_on_commas_and_trims_every_item() -> None:
    assert parse_settings("tags =  red ,green,  blue  ") == {
        "tags": ["red", "green", "blue"]
    }


def test_reads_an_empty_value_as_an_empty_list() -> None:
    assert parse_settings("tags =") == {"tags": []}


def test_keeps_the_empty_items_between_and_after_commas() -> None:
    assert parse_settings("tags = a,,b,") == {"tags": ["a", "", "b", ""]}


def test_skips_blank_lines_and_comment_lines() -> None:
    assert parse_settings("# header\n\n  # indented\nname = Ada\n") == {"name": ["Ada"]}


def test_lets_a_later_line_replace_an_earlier_one() -> None:
    assert parse_settings("name = Ada\nname = Grace") == {"name": ["Grace"]}


def test_appends_to_the_list_of_an_earlier_line_with_key_plus() -> None:
    assert parse_settings("paths = a\npaths+ = b, c") == {"paths": ["a", "b", "c"]}


def test_starts_the_list_when_key_plus_comes_first() -> None:
    assert parse_settings("paths + = b") == {"paths": ["b"]}


def test_keeps_quote_characters_that_do_not_start_an_item() -> None:
    assert parse_settings('motto = say "hi", it\'s') == {"motto": ['say "hi"', "it's"]}


@pytest.mark.parametrize(
    ("text", "message"),
    [
        ("name = Ada\nlang", "Line 2: expected key=value"),
        (" = x", "Line 1: missing key"),
        ("+ = x", "Line 1: missing key"),
        ("# keys\nb c = x", "Line 2: invalid key b c"),
    ],
)
def test_rejects_a_bad_line(text: str, message: str) -> None:
    with pytest.raises(ValueError, match=exactly(message)):
        parse_settings(text)


def test_writes_one_line_per_key_in_key_order() -> None:
    assert printed("b = 2, 3\na = 1") == "a = 1\nb = 2, 3\n"


def test_main_wires_the_settings_to_standard_output(
    capsys: pytest.CaptureFixture[str],
) -> None:
    main("name = Ada")
    assert capsys.readouterr().out == "name = Ada\n"


def test_run_prints_a_settings_file(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    path = tmp_path / "app.conf"
    path.write_text("name = Ada\n")
    run([str(path)])
    assert capsys.readouterr().out == "name = Ada\n"
