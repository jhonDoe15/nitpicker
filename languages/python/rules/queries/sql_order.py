import re

DYNAMIC = "\x00"
PAGE = "page"
AGGREGATE = "aggregate"
AGGREGATES = {"array_agg", "json_agg", "jsonb_agg"}
MASKED = re.compile(r"--[^\n]*|/\*.*?\*/|'(?:[^']|'')*'|\"(?:[^\"]|\"\")*\"|`[^`]*`", re.S)
SELECT = re.compile(r"\bselect\b")
ORDER_BY = re.compile(r"\border\s+by\b")
PAGE_CLAUSE = re.compile(
    r"(?<![\w$:.])(?:limit|offset)\s+(?:\d+|\x00|\?|:\w+|\$\d+|%s)|\bfetch\s+(?:first|next)\b"
)
FROM = re.compile(r"\bfrom\b")
SINGLE_ROW = re.compile(r"\blimit\s+1\b|\bfetch\s+(?:first|next)\s+(?:1\s+)?rows?\b")
SELECTION = re.compile(
    r"\bselect\s+(?:all\s+|distinct\s+)?(.*?)(?:\b(?:from|limit|fetch)\b|\Z)", re.S
)
CONSTANT_ITEM = re.compile(
    r"(?:\d+|true|false|null|''|(?:count|exists|max|min|sum|avg)\s*\(\)|\x00)(?:\s+(?:as\s+)?[\w$]+)?"
)
VALUE_BEFORE = re.compile(
    r"(?:[=<>!+\-*/%,(|]|\b(?:like|ilike|in|between|and|or|not|is|limit|offset|where|on|having"
    r"|when|then|else|values|any|all|first|next|by|select|set|distinct))\s*\Z"
)
FUNCTION_NAME = re.compile(r"([\w$]+)\s*\Z")
STATEMENT_START = re.compile(r"\s*\(?\s*(?:select|with)\b", re.I)


class Scope:
    def __init__(self, start, name):
        self.start = start
        self.name = name
        self.text = ""
        self.opaque = False
        self.aggregates = []
        self.child_ordered = False


def masked(text):
    return MASKED.sub(lambda m: "''" if m.group(0).startswith("'") else "q", text).lower()


def constant_selection(text):
    selection = SELECTION.search(text)
    items = [item.strip() for item in selection.group(1).split(",")] if selection else []
    return bool(items) and all(CONSTANT_ITEM.fullmatch(item) for item in items)


def page_gap(scope):
    clause = PAGE_CLAUSE.search(scope.text)
    if (
        clause is None
        or scope.opaque
        or not SELECT.search(scope.text)
        or not FROM.search(scope.text)
    ):
        return []
    if ORDER_BY.search(scope.text):
        return []
    if SINGLE_ROW.search(scope.text) and constant_selection(scope.text):
        return []
    form = " ".join(clause.group(0).replace(DYNAMIC, "?").split()).upper()
    return [(scope.start, PAGE, form)]


def close_scope(stack, gaps):
    scope = stack.pop()
    gaps.extend(page_gap(scope))
    if not (scope.child_ordered or scope.opaque):
        gaps.extend(scope.aggregates)
    if not stack:
        return
    parent = stack[-1]
    parent.text += "()"
    parent.opaque = parent.opaque or (scope.opaque and not SELECT.search(scope.text))
    ordered = SELECT.search(scope.text) and ORDER_BY.search(scope.text)
    parent.child_ordered = parent.child_ordered or bool(ordered)
    if scope.name in AGGREGATES and not scope.opaque and not ORDER_BY.search(scope.text):
        parent.aggregates.append((scope.start, AGGREGATE, f"{scope.name}(...)"))


def sql_order_gaps(text):
    stack = [Scope(0, "")]
    gaps = []
    for index, character in enumerate(masked(text)):
        scope = stack[-1]
        if character == "(":
            name = FUNCTION_NAME.search(scope.text)
            stack.append(Scope(index, name.group(1) if name else ""))
        elif character == ")" and len(stack) > 1:
            close_scope(stack, gaps)
        elif character == DYNAMIC:
            value = VALUE_BEFORE.search(scope.text) or (len(stack) > 1 and not scope.text.strip())
            scope.opaque = scope.opaque or not value
            scope.text += DYNAMIC
        else:
            scope.text += character
    while stack:
        close_scope(stack, gaps)
    return sorted(gaps)


def statement_gaps(text):
    return sql_order_gaps(text) if STATEMENT_START.match(text) else []
