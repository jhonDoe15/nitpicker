import re

OPAQUE = "\u0001"
SNIPPET = 40
FLAGS = re.IGNORECASE
FULL_QUERY = re.compile(
    r"^\s*(?:select|insert\s+into|update\s+\S+\s+set|delete\s+from|merge\s+into|with\s+\S+\s+as)\b", FLAGS
)
FRAGMENT = re.compile(
    r"^\s*(?:and|or|where|order\s+by|group\s+by|having|limit|set|on|(?:left\s+|inner\s+|right\s+)?join)\b", FLAGS
)
END_OPERATOR = re.compile(r"(?:<>|!=|<=|>=|(?<![-=<>!])[=<>]|\b(?:not\s+)?(?:i?like|in|between))\s*$", FLAGS)
MID_OPERATOR = re.compile(
    r"(?:<>|!=|<=|>=|(?<![-=<>!])=|\b(?:i?like|in))\s+(?:and|or|order|group|limit|having|union)\b", FLAGS
)
STRUCTURE = re.compile(r"\b(?:from|where|set|values|join|and|or|on|having)\b", FLAGS)
INSERT = re.compile(r"insert\s+into\s+[^\s(]+\s*\(([^)]*)\)\s*values\s*\(", FLAGS)
KEYWORDS = {
    "select", "from", "where", "and", "or", "on", "set", "values", "join", "group", "order", "by",
    "having", "limit", "offset", "union", "then", "else", "end", "local",
}
PROSE_WORD = re.compile(
    r"\b(?:the|this|that|these|those|are|was|were|been|of|to|which|because|should|would|could)\b", FLAGS
)
PROSE_WORDS = 2
SCRIPT_CALL = re.compile(r"redis\.call\(")
WORD_END = re.compile(r"[A-Za-z0-9_]$")
WORD_START = re.compile(r"^[A-Za-z0-9_]")
FIRST_WORD = re.compile(r"^([A-Za-z]+)")
LAST_WORD = re.compile(r"([A-Za-z]+)$")
SPACES = re.compile(r"\s+")


def is_full_query(text):
    return FULL_QUERY.match(text) is not None


def is_query_text(text):
    return is_full_query(text) or FRAGMENT.match(text) is not None


def top_level_count(text):
    depth, quote, count = 0, "", 0 if text.strip() == "" else 1
    for character in text:
        if quote:
            quote = "" if character == quote else quote
        elif character in "'\"":
            quote = character
        else:
            depth += 1 if character in "([{" else -1 if character in ")]}" else 0
            count += 1 if character == "," and depth == 0 else 0
    return count


def values_list(text, start):
    depth, quote = 1, ""
    for index in range(start, len(text)):
        character = text[index]
        if quote:
            quote = "" if character == quote else quote
        elif character in "'\"":
            quote = character
        else:
            depth += 1 if character == "(" else -1 if character == ")" else 0
        if depth == 0:
            return text[start:index]
    return None


def column_count_problem(text):
    match = INSERT.search(text)
    values = values_list(text, match.end()) if match else None
    if values is None or OPAQUE in values or OPAQUE in match.group(1):
        return None
    columns, given = top_level_count(match.group(1)), top_level_count(values)
    return None if columns == given else {"kind": "count", "columns": columns, "values": given}


def around(text, index):
    window = text[max(0, index - SNIPPET) : index + SNIPPET]
    return SPACES.sub(" ", window.replace(OPAQUE, "?")).strip()


def query_text_problem(text, complete):
    if not is_query_text(text) or len(PROSE_WORD.findall(text)) >= PROSE_WORDS:
        return None
    structured = STRUCTURE.search(text) is not None
    middle = MID_OPERATOR.search(text) if structured else None
    if middle is not None:
        return {"kind": "operand", "snippet": around(text, middle.start())}
    end = END_OPERATOR.search(text) if complete and structured else None
    if end is not None:
        return {"kind": "operand", "snippet": around(text, end.start())}
    return column_count_problem(text)


def run_together(left, right):
    last, first = LAST_WORD.search(left), FIRST_WORD.match(right)
    words = {last.group(1).lower() if last else None, first.group(1).lower() if first else None}
    together = WORD_END.search(left) and WORD_START.match(right)
    related = is_query_text(left) or is_query_text(right) or SCRIPT_CALL.search(left + right)
    if together and words & KEYWORDS and related:
        half = SNIPPET // 2
        return {"kind": "joined", "snippet": SPACES.sub(" ", left[-half:] + right[:half])}
    return None
