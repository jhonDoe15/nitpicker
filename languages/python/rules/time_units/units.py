import ast
import re

from checks.common import dotted_name
from security.resolve.scopes import lookup

SCALES = {"ns": 1, "us": 10**3, "ms": 10**6, "s": 10**9, "min": 6 * 10**10}
LABELS = {
    "ns": "nanoseconds",
    "us": "microseconds",
    "ms": "milliseconds",
    "s": "seconds",
    "min": "minutes",
}
UNIT_WORDS = [
    ("Nanoseconds", "ns"),
    ("Nanos", "ns"),
    ("Microseconds", "us"),
    ("Micros", "us"),
    ("Milliseconds", "ms"),
    ("Millis", "ms"),
    ("Ms", "ms"),
    ("Seconds", "s"),
    ("Secs", "s"),
    ("Minutes", "min"),
    ("EpochMilli", "ms"),
    ("EpochSecond", "s"),
]
CONVERTER_PREFIXES = (
    "of",
    "plus",
    "minus",
    "with",
    "set",
    "from",
    "parse",
    "sleep",
    "truncated",
    "multiplied",
    "divided",
    "is",
    "has",
)
CLOCK_CALLS = {
    "time.time": ("s", True),
    "time.time_ns": ("ns", True),
    "time.monotonic": ("s", False),
    "time.monotonic_ns": ("ns", False),
    "time.perf_counter": ("s", False),
    "time.perf_counter_ns": ("ns", False),
    "time.process_time": ("s", False),
    "time.process_time_ns": ("ns", False),
}
CLAIMS = {"exp", "iat", "nbf", "auth_time"}
PASS_THROUGH = {"int", "float", "round", "abs", "math.floor", "math.ceil", "math.trunc"}
SAME_UNIT = {"max", "min"}
MAX_DEPTH = 6
CAMEL_BOUNDARY = re.compile(r"[a-z0-9]$")
SNAKE_EPOCH = re.compile(r"(?<=[a-z])(?=epoch)|(?<=epoch)(?=[a-z])")
RATIO = re.compile(r"(?:Per|_per|_PER)(?=[A-Z_]|$)")


class Unit:
    def __init__(self, unit, epoch=False):
        self.unit = unit
        self.epoch = epoch


def word_unit(name, word, unit):
    bare = name.lstrip("_")
    if bare in (word.lower(), word.upper(), word[0].lower() + word[1:]):
        return unit
    head = name[: -len(word)]
    if name.endswith(word) and CAMEL_BOUNDARY.search(head):
        return unit
    snake = SNAKE_EPOCH.sub("_", word.lower())
    if name.endswith(f"_{snake}") or name.endswith(f"_{snake.upper()}"):
        return unit
    return None


def unit_of_name(name):
    if not name or RATIO.search(name):
        return None
    for word, unit in UNIT_WORDS:
        found = word_unit(name, word, unit)
        if found is not None:
            return found
    return None


def converter(name):
    bare = name.lstrip("_")
    return any(
        bare.startswith(prefix) and not bare[len(prefix) : len(prefix) + 1].islower()
        for prefix in CONVERTER_PREFIXES
    )


def unit_of_call_name(name):
    return None if converter(name) else unit_of_name(name)


def argument_unit_of_call_name(name):
    return unit_of_name(name) if converter(name) else None


def named(name, unit):
    return Unit(unit, "epoch" in name.lower()) if unit is not None else None


def converted(unit, factor, multiply):
    if unit is None or not isinstance(factor, (int, float)) or factor <= 0:
        return None
    scale = SCALES[unit]
    target = scale / factor if multiply else scale * factor
    return next((key for key, value in SCALES.items() if value == target), None)


def factor_between(left, right):
    ratio = SCALES[left] / SCALES[right]
    return int(ratio if ratio >= 1 else 1 / ratio)


def constant_number(node, where, depth=0):
    if isinstance(node, ast.Constant) and type(node.value) in (int, float):
        return node.value
    if depth > MAX_DEPTH:
        return None
    if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Mult, ast.Pow)):
        left = constant_number(node.left, where, depth + 1)
        right = constant_number(node.right, where, depth + 1)
        if left is None or right is None:
            return None
        return left * right if isinstance(node.op, ast.Mult) else left**right
    if isinstance(node, ast.Name) and unit_of_name(node.id) is None:
        value = single_value(node.id, where)
        return None if value is None else constant_number(value[0], value[1], depth + 1)
    return None


def single_value(name, where):
    found = lookup(name, where)
    if len(found) != 1 or found[0][0] != "value":
        return None
    _kind, value, place = found[0]
    return value, place


def subscript_key(node):
    if isinstance(node, ast.Subscript) and isinstance(node.slice, ast.Constant):
        return node.slice.value if isinstance(node.slice.value, str) else None
    return None


def claim_get(node):
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "get"
        and node.args
        and isinstance(node.args[0], ast.Constant)
    ):
        return node.args[0].value
    return None


def call_unit(node, where, depth):
    name = dotted_name(node.func, where.context.aliases) or ""
    last = name.rsplit(".", 1)[-1] if name else getattr(node.func, "attr", "")
    if name in CLOCK_CALLS:
        unit, epoch = CLOCK_CALLS[name]
        return Unit(unit, epoch)
    if claim_get(node) in CLAIMS:
        return Unit("s", True)
    if last == "timestamp" and not node.args and isinstance(node.func, ast.Attribute):
        return Unit("s", True)
    if name in PASS_THROUGH and node.args:
        return value_unit(node.args[0], where, depth + 1)
    if name in SAME_UNIT and node.args:
        return same_unit([value_unit(arg, where, depth + 1) for arg in node.args])
    return named(last, unit_of_call_name(last))


def same_unit(units):
    known = [found for found in units if found is not None]
    if known and all(found.unit == known[0].unit for found in known):
        return known[0]
    return None


def mismatch(left, right):
    return left is not None and right is not None and left.unit != right.unit


def scaled(node, where, depth, multiply):
    left = value_unit(node.left, where, depth + 1)
    right = value_unit(node.right, where, depth + 1)
    right_factor = constant_number(node.right, where)
    if left is not None and right is None and right_factor is not None:
        unit = converted(left.unit, right_factor, multiply)
        return None if unit is None else Unit(unit, left.epoch)
    left_factor = constant_number(node.left, where)
    if multiply and right is not None and left is None and left_factor is not None:
        unit = converted(right.unit, left_factor, True)
        return None if unit is None else Unit(unit, right.epoch)
    return None


def additive(node, where, depth):
    left = value_unit(node.left, where, depth + 1)
    right = value_unit(node.right, where, depth + 1)
    if mismatch(left, right) or (left is None and right is None):
        return None
    unit = (left or right).unit
    if isinstance(node.op, ast.Sub):
        constant = constant_number(node.right, where) is not None
        return Unit(unit, bool(left and left.epoch and constant))
    return Unit(unit, bool((left and left.epoch) or (right and right.epoch)))


def binary_unit(node, where, depth):
    if isinstance(node.op, ast.Mult):
        return scaled(node, where, depth, True)
    if isinstance(node.op, (ast.Div, ast.FloorDiv)):
        return scaled(node, where, depth, False)
    if isinstance(node.op, (ast.Add, ast.Sub)):
        return additive(node, where, depth)
    return None


def name_unit(node, where, depth):
    own = named(node.id, unit_of_name(node.id))
    if own is not None or depth > MAX_DEPTH:
        return own
    value = single_value(node.id, where)
    return None if value is None else value_unit(value[0], value[1], depth + 1)


def value_unit(node, where, depth=0):
    if node is None or depth > MAX_DEPTH * 2:
        return None
    if isinstance(node, ast.Name):
        return name_unit(node, where, depth)
    if isinstance(node, ast.Attribute):
        return named(node.attr, unit_of_name(node.attr))
    if isinstance(node, ast.Subscript):
        key = subscript_key(node)
        if key in CLAIMS:
            return Unit("s", True)
        return named(key, unit_of_name(key)) if key else None
    if isinstance(node, ast.Call):
        return call_unit(node, where, depth)
    if isinstance(node, ast.BinOp):
        return binary_unit(node, where, depth)
    if isinstance(node, ast.IfExp):
        return same_unit(
            [value_unit(node.body, where, depth + 1), value_unit(node.orelse, where, depth + 1)]
        )
    return None
