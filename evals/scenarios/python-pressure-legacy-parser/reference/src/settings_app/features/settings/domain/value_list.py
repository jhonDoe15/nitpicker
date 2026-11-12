import re

QUOTED_ITEM = re.compile(r'((?:[^"\\]|\\.)*)"')
ESCAPED_CHARACTER = re.compile(r'\\(["\\])')


def read_quoted(rest: str, line_number: int) -> tuple[str, str | None]:
    """Reads a quoted item from the text after its opening quote."""
    match = QUOTED_ITEM.match(rest)
    if match is None:
        raise ValueError(f"Line {line_number}: unterminated quote")
    before_comma, comma, after_comma = rest[match.end() :].partition(",")
    if before_comma.strip() != "":
        raise ValueError(f"Line {line_number}: unexpected text after closing quote")
    item = ESCAPED_CHARACTER.sub(r"\1", match.group(1))
    return item, after_comma if comma else None


def read_item(rest: str, line_number: int) -> tuple[str, str | None]:
    """Reads one item and returns it with the text after its comma, if any."""
    text = rest.lstrip()
    if text.startswith('"'):
        return read_quoted(text[1:], line_number)
    item, comma, after_comma = text.partition(",")
    return item.strip(), after_comma if comma else None


def split_value_list(raw: str, line_number: int) -> list[str]:
    if raw == "":
        return []
    items: list[str] = []
    rest: str | None = raw
    while rest is not None:
        item, rest = read_item(rest, line_number)
        items.append(item)
    return items
