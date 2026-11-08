import ast

from checks.common import dotted_name, finding
from security.resolve.scopes import where_of
from security.support import exempt
from time_units.units import (
    LABELS,
    SCALES,
    argument_unit_of_call_name,
    factor_between,
    mismatch,
    unit_of_name,
    value_unit,
)

RULE = "time-unit-mismatch"
GUARDED = True
MAX_TEXT = 40
MIXING = (ast.Add, ast.Sub)
COMPARING = (ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.Eq, ast.NotEq)
SECONDS_CALLS = {
    "time.sleep": 0,
    "asyncio.sleep": 0,
    "trio.sleep": 0,
    "anyio.sleep": 0,
    "datetime.datetime.fromtimestamp": 0,
    "datetime.datetime.utcfromtimestamp": 0,
    "datetime.date.fromtimestamp": 0,
    "time.gmtime": 0,
    "time.localtime": 0,
    "time.ctime": 0,
}
TIMEDELTA = "datetime.timedelta"
TIMEDELTA_POSITIONS = {1: "s", 2: "us", 3: "ms", 4: "min"}
NARROWING = {"numpy.int32", "ctypes.c_int32", "ctypes.c_int", "numpy.uint32"}


def text_of(node, context):
    raw = " ".join((ast.get_source_segment(context.text, node) or "").split())
    return raw if len(raw) <= MAX_TEXT else f"{raw[: MAX_TEXT - 3]}..."


def example(value, source, target):
    operand = f"({value})" if " " in value else value
    factor = factor_between(source, target)
    operator = "*" if SCALES[source] > SCALES[target] else "/"
    return f"{operand} {operator} {factor}"


class Checker:
    def __init__(self, context):
        self.context = context
        self.found = []
        self.functions = {
            node.name: node
            for node in context.tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }

    def unit(self, node):
        return value_unit(node, where_of(node, self.context))

    def report(self, node, kind, data):
        data["kind"] = kind
        subject = text_of(node, self.context)
        entry = finding(self.context.path, RULE, subject, node)
        entry["data"] = data
        self.found.append(entry)

    def mixed(self, node, left, right):
        left_unit, right_unit = self.unit(left), self.unit(right)
        if mismatch(left_unit, right_unit):
            value = text_of(right, self.context)
            self.report(
                node,
                "mixed",
                {
                    "left": text_of(left, self.context),
                    "leftUnit": LABELS[left_unit.unit],
                    "right": value,
                    "rightUnit": LABELS[right_unit.unit],
                    "factor": factor_between(left_unit.unit, right_unit.unit),
                    "example": example(value, right_unit.unit, left_unit.unit),
                },
            )

    def target(self, node, kind, target, target_unit, value, extra=None):
        found = self.unit(value)
        if target_unit is None or found is None or found.unit == target_unit:
            return
        text = text_of(value, self.context)
        data = {
            "target": target,
            "targetUnit": LABELS[target_unit],
            "value": text,
            "valueUnit": LABELS[found.unit],
            "factor": factor_between(found.unit, target_unit),
            "example": example(text, found.unit, target_unit),
        }
        data.update(extra or {})
        self.report(node, kind, data)

    def named(self, node, target, value):
        name = target.id if isinstance(target, ast.Name) else getattr(target, "attr", None)
        if name is not None and value is not None:
            self.target(value, "assigned", name, unit_of_name(name), value)

    def parameters(self, call):
        name = dotted_name(call.func, self.context.aliases) or ""
        last = name.rsplit(".", 1)[-1] if name else getattr(call.func, "attr", "")
        if name in SECONDS_CALLS:
            return {SECONDS_CALLS[name]: ("s", "seconds")}
        if name == TIMEDELTA:
            return {index: (unit, LABELS[unit]) for index, unit in TIMEDELTA_POSITIONS.items()}
        unit = argument_unit_of_call_name(last)
        if unit is not None:
            return {0: (unit, last)}
        local = self.functions.get(name)
        if local is None:
            return {}
        positional = [*local.args.posonlyargs, *local.args.args]
        return {
            index: (unit_of_name(argument.arg), argument.arg)
            for index, argument in enumerate(positional)
            if unit_of_name(argument.arg) is not None
        }

    def call(self, node):
        name = dotted_name(node.func, self.context.aliases) or ""
        callee = name or text_of(node.func, self.context)
        for index, (unit, parameter) in self.parameters(node).items():
            if index < len(node.args) and not isinstance(node.args[index], ast.Starred):
                extra = {"callee": callee, "parameter": parameter}
                self.target(node.args[index], "argument", "", unit, node.args[index], extra)
        for keyword in node.keywords:
            if keyword.arg is not None:
                extra = {"callee": callee, "parameter": keyword.arg}
                unit = unit_of_name(keyword.arg)
                self.target(keyword.value, "argument", "", unit, keyword.value, extra)
        if name in NARROWING and node.args:
            found = self.unit(node.args[0])
            if found is not None and found.epoch:
                self.report(node, "narrowed", {"value": text_of(node.args[0], self.context), "operator": name})

    def dictionary(self, node):
        for key, value in zip(node.keys, node.values):
            if isinstance(key, ast.Constant) and isinstance(key.value, str):
                self.target(value, "assigned", key.value, unit_of_name(key.value), value)

    def defaults(self, node):
        arguments = node.args
        positional = [*arguments.posonlyargs, *arguments.args]
        pairs = list(zip(positional[len(positional) - len(arguments.defaults) :], arguments.defaults))
        pairs += [(arg, value) for arg, value in zip(arguments.kwonlyargs, arguments.kw_defaults) if value]
        for argument, value in pairs:
            self.target(value, "assigned", argument.arg, unit_of_name(argument.arg), value)

    def visit(self, node):
        if isinstance(node, ast.BinOp) and isinstance(node.op, MIXING):
            self.mixed(node, node.left, node.right)
        elif isinstance(node, ast.Compare):
            sides = [node.left, *node.comparators]
            for operator, left, right in zip(node.ops, sides, sides[1:]):
                if isinstance(operator, COMPARING):
                    self.mixed(node, left, right)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                self.named(node, target, node.value)
        elif isinstance(node, (ast.AnnAssign, ast.AugAssign)):
            if not isinstance(node, ast.AugAssign) or isinstance(node.op, MIXING):
                self.named(node, node.target, node.value)
        elif isinstance(node, ast.Call):
            self.call(node)
        elif isinstance(node, ast.Dict):
            self.dictionary(node)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            self.defaults(node)


def check(context):
    if exempt(context):
        return []
    checker = Checker(context)
    for node in ast.walk(context.tree):
        checker.visit(node)
    return checker.found
