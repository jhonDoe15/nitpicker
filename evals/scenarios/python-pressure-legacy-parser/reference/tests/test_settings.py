import io
import re
from collections.abc import Mapping
from pathlib import Path

import pytest

from settings_app.cli import run
from settings_app.composition_root import main, main_includes
from settings_app.features.settings import (
    EmptyInclude,
    IncludeCycle,
    MissingSource,
    Resolved,
    parse_settings,
    print_settings,
    resolve_settings,
)


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


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ('k = "Lovelace, Ada", " Grace "', ["Lovelace, Ada", " Grace "]),
        ('k = "say \\"hi\\"", "c:\\\\dir"', ['say "hi"', "c:\\dir"]),
        ('k = "a\\nb"', ["a\\nb"]),
        ('k = "x\\,y"', ["x\\,y"]),
        ('k = "\\"", "\\\\"', ['"', "\\"]),
        ('k =   "a"  ,  "b"   ,c , "d"', ["a", "b", "c", "d"]),
        ('k = ""', [""]),
        ('k = "",a', ["", "a"]),
        ('k = "a",', ["a", ""]),
        ('k = x"y, z"', ['x"y', 'z"']),
        ('k = a "b", c', ['a "b"', "c"]),
        ('k = "k=v", "#x"', ["k=v", "#x"]),
        ("k =", []),
    ],
)
def test_reads_quoted_items(text: str, expected: list[str]) -> None:
    assert parse_settings(text) == {"k": expected}


def test_reads_quoted_items_with_the_append_form() -> None:
    assert parse_settings('paths = a\npaths+ = "b, c", d') == {
        "paths": ["a", "b, c", "d"]
    }


@pytest.mark.parametrize(
    ("text", "message"),
    [
        ('# x\ntags = "a" b', "Line 2: unexpected text after closing quote"),
        ('tags = "a" bc, "d', "Line 1: unexpected text after closing quote"),
        ('tags = "x""y"', "Line 1: unexpected text after closing quote"),
        ('tags = "x" "y"', "Line 1: unexpected text after closing quote"),
        ('tags = "a, b', "Line 1: unterminated quote"),
        ('tags = "a\\"', "Line 1: unterminated quote"),
        ('tags = "a\\', "Line 1: unterminated quote"),
        ('tags = "', "Line 1: unterminated quote"),
        ('ok = 1\n\ntags = x, "y', "Line 3: unterminated quote"),
    ],
)
def test_rejects_a_bad_quote(text: str, message: str) -> None:
    with pytest.raises(ValueError, match=exactly(message)):
        parse_settings(text)


def sources(**entries: str) -> Mapping[str, str]:
    return entries


def test_resolves_a_source_without_includes_like_parse_settings() -> None:
    assert resolve_settings("main", sources(main="name = Ada")) == Resolved(
        {"name": ["Ada"]}
    )


def test_splices_an_included_source_in_place_of_the_include_line() -> None:
    result = resolve_settings(
        "main",
        sources(
            main="name = Ada\n  include =  base  \nlang = fr",
            base="lang = en\ncolor = red\nname = Nobody",
        ),
    )
    assert result == Resolved({"name": ["Nobody"], "lang": ["fr"], "color": ["red"]})


def test_lets_lines_after_an_include_append_to_what_it_brought_in() -> None:
    result = resolve_settings(
        "main", sources(main="p = 1\ninclude=more\np+ = 4", more="p+ = 2, 3")
    )
    assert result == Resolved({"p": ["1", "2", "3", "4"]})


def test_resolves_includes_of_includes_and_a_source_included_twice() -> None:
    result = resolve_settings(
        "a",
        sources(
            a="include=b\ninclude=c\nx+ = a",
            b="include=d\nx+ = b",
            c="include=d\nx+ = c",
            d="x+ = d",
        ),
    )
    assert result == Resolved({"x": ["d", "b", "d", "c", "a"]})


def test_does_not_treat_other_keys_comments_or_values_as_includes() -> None:
    text = "# include=base\ninclude2 = base\nnote = include=base\nInclude = base"
    result = resolve_settings("main", sources(main=text, base="x = 1"))
    assert result == Resolved(
        {"include2": ["base"], "note": ["include=base"], "Include": ["base"]}
    )


def test_reads_quoted_values_in_every_source() -> None:
    result = resolve_settings(
        "main", sources(main='include=base\nown = "p, q"', base='names = "a, b", c')
    )
    assert result == Resolved({"names": ["a, b", "c"], "own": ["p, q"]})


@pytest.mark.parametrize(
    ("entry", "available", "expected"),
    [
        ("main", {}, MissingSource("main")),
        ("main", {"main": "include = base"}, MissingSource("base")),
        ("main", {"main": "x = 1\ninclude = none\ny = 2"}, MissingSource("none")),
        ("main", {"main": "include = toString"}, MissingSource("toString")),
        ("main", {"main": "include = a=b"}, MissingSource("a=b")),
        ("main", {"main": "x = 1\ninclude =  "}, EmptyInclude("main")),
        ("main", {"main": "include = base", "base": "include="}, EmptyInclude("base")),
        ("a", {"a": "include=a"}, IncludeCycle(("a", "a"))),
        ("a", {"a": "include=b", "b": "include=a"}, IncludeCycle(("a", "b", "a"))),
        (
            "a",
            {"a": "include=b", "b": "x = 1\ninclude=c", "c": "include=b"},
            IncludeCycle(("a", "b", "c", "b")),
        ),
    ],
)
def test_reports_a_failure_as_a_result(
    entry: str, available: Mapping[str, str], expected: object
) -> None:
    assert resolve_settings(entry, available) == expected


def test_does_not_call_a_repeated_include_a_cycle() -> None:
    result = resolve_settings(
        "a", sources(a="include=b\ninclude=c", b="include=c\nx = b", c="x = c")
    )
    assert result == Resolved({"x": ["c"]})


def test_reads_an_include_line_that_ends_with_a_carriage_return() -> None:
    result = resolve_settings(
        "main", sources(main="include = base\r\nx = 1", base="y = 2")
    )
    assert result == Resolved({"y": ["2"], "x": ["1"]})


@pytest.mark.parametrize(
    ("available", "message"),
    [
        (
            {"main": "a = 1\ninclude=base\nz = 3", "base": "oops"},
            "Line 2: expected key=value",
        ),
        ({"main": "include=base", "base": 'a = "x'}, "Line 1: unterminated quote"),
        ({"main": "include"}, "Line 1: expected key=value"),
    ],
)
def test_raises_what_parse_settings_raises_for_the_expanded_text(
    available: Mapping[str, str], message: str
) -> None:
    with pytest.raises(ValueError, match=exactly(message)):
        resolve_settings("main", available)


def test_writes_one_line_per_key_in_key_order() -> None:
    assert printed("b = 2, 3\na = 1") == "a = 1\nb = 2, 3\n"


def test_main_wires_the_settings_to_standard_output(
    capsys: pytest.CaptureFixture[str],
) -> None:
    main("name = Ada")
    assert capsys.readouterr().out == "name = Ada\n"


@pytest.mark.parametrize(
    ("entry", "available", "expected"),
    [
        (
            "main",
            {"main": "include=base", "base": "b = 2, 3\na = 1"},
            "a = 1\nb = 2, 3\n",
        ),
        ("main", {"main": "include=base"}, "Missing source base\n"),
        ("a", {"a": "include=b", "b": "include=a"}, "Include cycle: a -> b -> a\n"),
        ("main", {"main": "include ="}, "Empty include in main\n"),
    ],
)
def test_main_includes_writes_the_settings_or_one_line_for_a_failure(
    entry: str,
    available: Mapping[str, str],
    expected: str,
    capsys: pytest.CaptureFixture[str],
) -> None:
    main_includes(entry, available)
    assert capsys.readouterr().out == expected


def test_run_prints_a_settings_file(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    path = tmp_path / "app.conf"
    path.write_text("name = Ada\n")
    run([str(path)])
    assert capsys.readouterr().out == "name = Ada\n"


def test_run_resolves_includes_from_the_files_next_to_the_entry(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / "app.conf").write_text("include = base.conf\nname = Ada\n")
    (tmp_path / "base.conf").write_text("lang = en\n")
    (tmp_path / "nested").mkdir()
    run(["--includes", str(tmp_path / "app.conf")])
    assert capsys.readouterr().out == "lang = en\nname = Ada\n"
