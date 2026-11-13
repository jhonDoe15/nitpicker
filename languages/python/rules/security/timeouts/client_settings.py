import ast
import re

from security.resolve.booleans import is_none
from security.resolve.calls import dict_entries
from security.resolve.scopes import values_of

SET, MISSING, UNKNOWN = "set", "missing", "unknown"
TIMEOUT_KEYS = ("statement_timeout", "query_timeout", "command_timeout")
ZERO_VALUE = re.compile(r"^0+(?:ms|s)?$")
SETTING_VALUE = re.compile(r"[\w.]*")
SEPARATORS = " \t=:'\""
MAX_DEPTH = 4


def text_parts(node, where, depth=0):
    if depth > MAX_DEPTH or node is None:
        return [None]
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return [node.value]
    if isinstance(node, ast.JoinedStr):
        return [part for value in node.values for part in text_parts(value, where, depth + 1)]
    if isinstance(node, ast.FormattedValue):
        return [None]
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        left = text_parts(node.left, where, depth + 1)
        return left + text_parts(node.right, where, depth + 1)
    if isinstance(node, ast.Name):
        values = values_of(node.id, where)
        if len(values) == 1:
            return text_parts(values[0][0], values[0][1], depth + 1)
    return [None]


def text_value(node, where):
    parts = text_parts(node, where)
    return None if None in parts else "".join(parts)


def setting_values(text, key):
    start = text.find(key)
    while start != -1:
        rest = text[start + len(key) :].replace("%3D", "=").replace("%3d", "=")
        yield SETTING_VALUE.match(rest.lstrip(SEPARATORS)).group(0)
        start = text.find(key, start + len(key))


def carries_timeout(text):
    return any(
        not ZERO_VALUE.match(value)
        for key in TIMEOUT_KEYS
        for value in setting_values(text, key)
    )


def text_state(node, where, unknown=MISSING):
    parts = text_parts(node, where)
    visible = "".join(part for part in parts if part is not None)
    if carries_timeout(visible):
        return SET
    return MISSING if None not in parts else unknown


def either(states):
    if SET in states:
        return SET
    return UNKNOWN if UNKNOWN in states else MISSING


def entry_state(entries, key, judge):
    values = [(value, place) for name, value, place in entries.items if name == key]
    if not values:
        return MISSING if entries.complete else UNKNOWN
    value, place = values[-1]
    return judge(value, place)


def present(entries, key):
    return any(name == key for name, _, _ in entries.items)


def number_state(value, place):
    if is_none(value, place):
        return MISSING
    if isinstance(value, ast.Constant) and value.value in (0, "0"):
        return MISSING
    return SET


def options_state(value, place):
    return text_state(value, place, UNKNOWN)


def server_settings_state(value, place):
    return entry_state(dict_entries(value, place), "statement_timeout", text_or_number)


def text_or_number(value, place):
    if isinstance(value, ast.Constant) and isinstance(value.value, str):
        return MISSING if ZERO_VALUE.match(value.value) else SET
    return number_state(value, place)


def libpq_state(entries):
    return entry_state(entries, "options", options_state)


def asyncpg_state(entries):
    if present(entries, "setup") or present(entries, "init"):
        return UNKNOWN
    return either(
        [
            entry_state(entries, "command_timeout", number_state),
            entry_state(entries, "server_settings", server_settings_state),
        ]
    )


def mapping_state(judge):
    def state(value, place):
        if is_none(value, place):
            return MISSING
        return judge(dict_entries(value, place))

    return state
