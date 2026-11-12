import re
from collections.abc import Mapping
from pathlib import Path

import pytest

from settings_app import composition_root
from settings_app.cli import run
from settings_app.composition_root import main
from settings_app.features import settings as feature
from settings_app.features.settings import parse_settings


def exactly(message: str) -> str:
    return f"^{re.escape(message)}$"


def test_keeps_lists_comments_replacement_and_append() -> None:
    text = """# settings

name = Ada
tags =  red ,green,  blue  
empty =
gaps = a,,b,
paths = x
paths+ = y, z
fresh + = q
name = Grace
"""
    assert parse_settings(text) == {
        "name": ["Grace"],
        "tags": ["red", "green", "blue"],
        "empty": [],
        "gaps": ["a", "", "b", ""],
        "paths": ["x", "y", "z"],
        "fresh": ["q"],
    }


def test_keeps_a_quote_that_does_not_open_an_item_as_an_ordinary_character() -> None:
    assert parse_settings('a = say "hi", it\'s, 5" tall,x"') == {
        "a": ['say "hi"', "it's", '5" tall', 'x"']
    }


def test_does_not_treat_an_include_line_specially() -> None:
    assert parse_settings("include = base\nx = 1") == {"include": ["base"], "x": ["1"]}


@pytest.mark.parametrize(
    ("text", "message"),
    [
        ("a = 1\nbroken", "Line 2: expected key=value"),
        ("= 1", "Line 1: missing key"),
        ("# c\n\n+ = 1", "Line 3: missing key"),
        ("a b = 1", "Line 1: invalid key a b"),
        ("ok = 1\nbad$ = 1", "Line 2: invalid key bad$"),
    ],
)
def test_raises_the_same_errors_as_before(text: str, message: str) -> None:
    with pytest.raises(ValueError, match=exactly(message)):
        parse_settings(text)


@pytest.mark.parametrize(
    ("line", "items"),
    [
        (
            'a = "Stone, Ada", " Grace ", plain',
            ["Stone, Ada", " Grace ", "plain"],
        ),
        ('a = "  Mr. Smith, Jr.  "', ["  Mr. Smith, Jr.  "]),
        ('a = "say \\"hi\\""', ['say "hi"']),
        ('a = "c:\\\\dir\\\\"', ["c:\\dir\\"]),
        ('a = "\\"", "\\\\"', ['"', "\\"]),
        ('a = "x\\ny\\,z"', ["x\\ny\\,z"]),
        ('a =   "x"  ,   "y"   ,z , "w"', ["x", "y", "z", "w"]),
        ('a = ""', [""]),
        ('a = "", ""', ["", ""]),
        ('a = "x",', ["x", ""]),
        ('a = x"y, z"', ['x"y', 'z"']),
        ('a = "k=v", "#x"', ["k=v", "#x"]),
        ('a = "x" ', ["x"]),
        ('a = "a" , "b"', ["a", "b"]),
        ('a = "\\\\\\""', ['\\"']),
        ('a = ",,,"', [",,,"]),
        ('a = ",", ","', [",", ","]),
    ],
)
def test_reads_quoted_items(line: str, items: list[str]) -> None:
    assert parse_settings(line) == {"a": items}


def test_reads_an_empty_value_unlike_two_quotes() -> None:
    assert parse_settings('b =\nc = ""') == {"b": [], "c": [""]}


def test_works_with_the_append_form() -> None:
    assert parse_settings('p = a\np+ = "b, c", d') == {"p": ["a", "b, c", "d"]}


@pytest.mark.parametrize(
    ("text", "message"),
    [
        ('a = 1\nb = "x" y', "Line 2: unexpected text after closing quote"),
        ('b = "x""y"', "Line 1: unexpected text after closing quote"),
        ('b = "x" "y"', "Line 1: unexpected text after closing quote"),
        ('b = "x"y', "Line 1: unexpected text after closing quote"),
        ('a = "x, y', "Line 1: unterminated quote"),
        ('ok = 1\n\na = x, "y\\"', "Line 3: unterminated quote"),
        ('a = "y\\', "Line 1: unterminated quote"),
        ('a = "', "Line 1: unterminated quote"),
        ('a = "x", "y', "Line 1: unterminated quote"),
    ],
)
def test_rejects_a_broken_quote(text: str, message: str) -> None:
    with pytest.raises(ValueError, match=exactly(message)):
        parse_settings(text)


def sources(**entries: str) -> Mapping[str, str]:
    return entries


def test_resolves_a_source_without_includes_like_parse_settings() -> None:
    text = 'a = 1\nb = "x, y"\n# c\nb+ = z'
    assert feature.resolve_settings("main", sources(main=text)) == feature.Resolved(
        parse_settings(text)
    )


def test_puts_the_lines_of_an_included_source_where_the_include_line_is() -> None:
    result = feature.resolve_settings(
        "main",
        sources(
            main="name = Ada\n  include =  base  \nlang = fr",
            base="lang = en\ncolor = red\nname = Nobody",
        ),
    )
    assert result == feature.Resolved(
        {"name": ["Nobody"], "lang": ["fr"], "color": ["red"]}
    )


def test_lets_lines_append_across_an_include_in_both_directions() -> None:
    result = feature.resolve_settings(
        "main", sources(main="p = 1\ninclude=more\np+ = 4", more="p+ = 2, 3")
    )
    assert result == feature.Resolved({"p": ["1", "2", "3", "4"]})


def test_follows_includes_of_includes_in_order() -> None:
    result = feature.resolve_settings(
        "a",
        sources(
            a="include=b\ninclude=c\nx+ = a",
            b="include=d\nx+ = b",
            c="include=d\nx+ = c",
            d="x+ = d",
        ),
    )
    assert result == feature.Resolved({"x": ["d", "b", "d", "c", "a"]})


def test_expands_a_source_included_twice_each_time() -> None:
    result = feature.resolve_settings(
        "a", sources(a="include=b\ninclude=b\nx+ = a", b="x+ = b")
    )
    assert result == feature.Resolved({"x": ["b", "b", "a"]})


def test_only_treats_a_line_whose_key_is_exactly_include_as_a_directive() -> None:
    result = feature.resolve_settings(
        "main",
        sources(
            main="# include=base\ninclude2 = base\nnote = include=base\nInclude = base",
            base="x = 1",
        ),
    )
    assert result == feature.Resolved(
        {"include2": ["base"], "note": ["include=base"], "Include": ["base"]}
    )


def test_reads_quoted_values_from_every_source() -> None:
    result = feature.resolve_settings(
        "main", sources(main='include=base\nown = "p, q"', base='names = "a, b", c')
    )
    assert result == feature.Resolved({"names": ["a, b", "c"], "own": ["p, q"]})


@pytest.mark.parametrize(
    ("entry", "available", "failure", "argument"),
    [
        ("main", {}, "MissingSource", "main"),
        ("main", {"main": "include = base"}, "MissingSource", "base"),
        (
            "main",
            {"main": "include = base", "base": "include = constructor"},
            "MissingSource",
            "constructor",
        ),
        ("main", {"main": "x = 1\ninclude =  "}, "EmptyInclude", "main"),
        (
            "main",
            {"main": "include = base", "base": "include="},
            "EmptyInclude",
            "base",
        ),
        ("a", {"a": "include = a"}, "IncludeCycle", ("a", "a")),
        (
            "a",
            {"a": "include = b", "b": "include = a"},
            "IncludeCycle",
            ("a", "b", "a"),
        ),
        (
            "a",
            {"a": "include=b", "b": "x = 1\ninclude=c", "c": "include=b"},
            "IncludeCycle",
            ("a", "b", "c", "b"),
        ),
    ],
)
def test_reports_a_failure_as_a_result_and_never_raises(
    entry: str,
    available: Mapping[str, str],
    failure: str,
    argument: str | tuple[str, ...],
) -> None:
    expected = getattr(feature, failure)(argument)
    assert feature.resolve_settings(entry, available) == expected


def test_does_not_call_a_repeated_include_a_cycle() -> None:
    result = feature.resolve_settings(
        "a", sources(a="include=b\ninclude=c", b="include=c\nx = b", c="x = c")
    )
    assert result == feature.Resolved({"x": ["c"]})


def test_follows_a_long_chain_of_includes() -> None:
    chain = {
        f"s{index}": f"include = s{index + 1}\nk{index} = {index}"
        for index in range(40)
    }
    chain["s40"] = "last = yes"
    result = feature.resolve_settings("s0", chain)
    assert isinstance(result, feature.Resolved)
    assert result.settings["last"] == ["yes"]
    assert len(result.settings) == 41


def test_reports_the_chain_of_a_long_cycle() -> None:
    chain = {f"s{index}": f"include = s{(index + 1) % 5}" for index in range(5)}
    assert feature.resolve_settings("s2", chain) == feature.IncludeCycle(
        ("s2", "s3", "s4", "s0", "s1", "s2")
    )


@pytest.mark.parametrize(
    ("available", "message"),
    [
        (
            {"main": "a = 1\ninclude=base\nz = 3", "base": "oops"},
            "Line 2: expected key=value",
        ),
        ({"main": "include=base", "base": 'a = "x'}, "Line 1: unterminated quote"),
        ({"main": "includeX"}, "Line 1: expected key=value"),
    ],
)
def test_raises_what_parse_settings_raises_for_the_expanded_text(
    available: Mapping[str, str], message: str
) -> None:
    with pytest.raises(ValueError, match=exactly(message)):
        feature.resolve_settings("main", available)


def test_main_still_prints_a_settings_text(capsys: pytest.CaptureFixture[str]) -> None:
    main('b = "x, y", z\na = 1')
    assert capsys.readouterr().out == "a = 1\nb = x, y, z\n"


@pytest.mark.parametrize(
    ("entry", "available", "expected"),
    [
        (
            "main",
            {"main": "include=base\nb = 2", "base": "a = 1\nc = 3, 4"},
            "a = 1\nb = 2\nc = 3, 4\n",
        ),
        ("main", {"main": "x = 1\ninclude = nowhere"}, "Missing source nowhere\n"),
        ("gone", {"main": "x = 1"}, "Missing source gone\n"),
        (
            "a",
            {"a": "include=b", "b": "include=c", "c": "include=b"},
            "Include cycle: a -> b -> c -> b\n",
        ),
        ("a", {"a": "include = a"}, "Include cycle: a -> a\n"),
        ("top", {"top": "include = mid", "mid": "include ="}, "Empty include in mid\n"),
    ],
)
def test_main_includes_writes_settings_or_one_line_for_a_failure(
    entry: str,
    available: Mapping[str, str],
    expected: str,
    capsys: pytest.CaptureFixture[str],
) -> None:
    composition_root.main_includes(entry, available)
    assert capsys.readouterr().out == expected


def test_main_includes_lets_a_malformed_line_propagate() -> None:
    with pytest.raises(ValueError, match=exactly("Line 2: expected key=value")):
        composition_root.main_includes("main", {"main": "a = 1\nbroken"})


def test_run_prints_one_file_and_ignores_includes(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / "app.conf").write_text('include = base.conf\nq = "a, b"\n')
    run([str(tmp_path / "app.conf")])
    assert capsys.readouterr().out == "include = base.conf\nq = a, b\n"


def test_run_with_includes_reads_the_sources_next_to_the_entry(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / "app.conf").write_text("include = base.conf\nname = Ada\n")
    (tmp_path / "base.conf").write_text("lang = en\nname = Nobody\n")
    (tmp_path / "nested").mkdir()
    run(["--includes", str(tmp_path / "app.conf")])
    assert capsys.readouterr().out == "lang = en\nname = Ada\n"


def test_run_with_includes_reports_a_missing_source(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / "app.conf").write_text("include = other.conf\n")
    run(["--includes", str(tmp_path / "app.conf")])
    assert capsys.readouterr().out == "Missing source other.conf\n"
