import ast

from checks.common import dotted_name, own_nodes
from security.sql.iterables import Iterables
from security.sql.shapes import (
    INERT,
    MAX_DEPTH,
    NUMERIC_CALLS,
    QUOTING,
    UNSAFE,
    combine,
    is_constant_text,
    safe_annotation,
    tail,
    textual,
)
from security.values import Where, bind_arguments, function_of, is_enum_class, lookup

TEXT_METHODS = {"strip", "lstrip", "rstrip", "upper", "lower", "title", "casefold"}
COMPOSABLE = {"psycopg.sql.SQL", "psycopg2.sql.SQL", "psycopg.sql.Composed"}
COMPOSABLE |= {"psycopg2.sql.Composed"}
SCHEMA_NAMES = {"db_table", "__tablename__", "model_name", "app_label"}


class Pieces(Iterables):
    def __init__(self):
        self.active = set()

    def of(self, node, where, depth=0):
        if depth > MAX_DEPTH or node is None:
            return UNSAFE
        method = getattr(self, f"of_{type(node).__name__}", None)
        return method(node, where, depth + 1) if method else UNSAFE

    def of_Constant(self, node, where, depth):
        return (node.value, False, False) if isinstance(node.value, str) else INERT

    def of_JoinedStr(self, node, where, depth):
        parts = []
        for value in node.values:
            if isinstance(value, ast.FormattedValue):
                parts.append(self.of(value.value, where, depth))
            else:
                parts.append(self.of(value, where, depth))
        built = any(isinstance(v, ast.FormattedValue) for v in node.values)
        return combine(parts, built=built)

    def of_BinOp(self, node, where, depth):
        left = self.of(node.left, where, depth)
        if isinstance(node.op, ast.Mod) and textual(left):
            right = node.right
            items = right.elts if isinstance(right, ast.Tuple) else [right]
            items = right.values if isinstance(right, ast.Dict) else items
            return combine([left] + [self.of(i, where, depth) for i in items], True)
        right = self.of(node.right, where, depth)
        if isinstance(node.op, ast.Mult):
            text_side = left if textual(left) else right if textual(right) else None
            if text_side is not None:
                return text_side
        built = isinstance(node.op, ast.Add) and (textual(left) or textual(right))
        return combine([left, right], built=built)

    def of_IfExp(self, node, where, depth):
        return combine([self.of(n, where, depth) for n in (node.body, node.orelse)])

    def of_BoolOp(self, node, where, depth):
        return combine([self.of(n, where, depth) for n in node.values])

    def of_Tuple(self, node, where, depth):
        return combine([self.of(n, where, depth) for n in node.elts])

    of_List = of_Set = of_Tuple

    def of_Name(self, node, where, depth):
        key = ("name", node.id, where.context.path, id(where.scope))
        if key in self.active:
            return INERT
        self.active.add(key)
        try:
            entries = lookup(node.id, where)
            if not entries:
                return UNSAFE
            return combine([self.entry(e, depth) for e in entries])
        finally:
            self.active.discard(key)

    def entry(self, entry, depth):
        kind, value, place = entry
        if kind == "param":
            return INERT if safe_annotation(value, place) else UNSAFE
        if kind == "iter":
            return self.iterable(value, place, depth)
        return self.of(value, place, depth)

    def of_Attribute(self, node, where, depth):
        if node.attr in SCHEMA_NAMES or (
            node.attr in {"name", "fullname"}
            and isinstance(node.value, ast.Attribute)
            and node.value.attr == "__table__"
        ):
            return INERT
        if is_enum_class(node.value, where):
            return INERT
        if node.attr in {"value", "name"}:
            return self.of(node.value, where, depth)
        constant = self.project_constant(node, where)
        return UNSAFE if constant is None else self.of(constant[0], constant[1], depth)

    def project_constant(self, node, where):
        dotted = dotted_name(node, where.context.aliases)
        located = where.context.project.locate(dotted) if dotted else None
        other = located and where.context.project.contexts.get(located[0])
        if other is None:
            return None
        entries = lookup(located[1], Where(other, None))
        values = [e for e in entries if e[0] == "value"]
        if len(values) != 1:
            return None
        return values[0][1], values[0][2]

    def of_Subscript(self, node, where, depth):
        return INERT if self.is_table(node.value, where) else UNSAFE

    def is_table(self, node, where, depth=0):
        if depth > 3:
            return False
        if isinstance(node, ast.Dict):
            return bool(node.values) and all(is_constant_text(v) for v in node.values)
        if isinstance(node, (ast.Tuple, ast.List)):
            return bool(node.elts) and all(is_constant_text(e) for e in node.elts)
        if isinstance(node, ast.Call) and tail(node.func, where) == "MappingProxyType":
            return bool(node.args) and self.is_table(node.args[0], where, depth + 1)
        if isinstance(node, ast.Name):
            entries = lookup(node.id, where)
            return bool(entries) and all(
                kind == "value" and self.is_table(value, place, depth + 1)
                for kind, value, place in entries
            )
        if isinstance(node, ast.Attribute):
            constant = self.project_constant(node, where)
            return constant is not None and self.is_table(*constant, depth + 1)
        return False

    def of_Call(self, node, where, depth):
        function = node.func
        name = dotted_name(function, where.context.aliases) or ""
        if isinstance(function, ast.Attribute):
            method = self.method_call(node, function, name, where, depth)
            if method is not None:
                return method
        if name in NUMERIC_CALLS or name.rsplit(".", 1)[-1] in QUOTING:
            return INERT
        if name == "str" and len(node.args) == 1:
            return self.of(node.args[0], where, depth)
        return self.returns(node, where, depth)

    def method_call(self, node, function, name, where, depth):
        if function.attr == "format":
            if (
                dotted_name(
                    getattr(function.value, "func", None), where.context.aliases
                )
                in COMPOSABLE
            ):
                return INERT
            receiver = self.of(function.value, where, depth)
            if not textual(receiver):
                return None
            if any(isinstance(a, ast.Starred) for a in node.args):
                return combine([receiver, UNSAFE], True)
            parts = [self.of(a, where, depth) for a in node.args]
            parts += [
                self.of(k.value, where, depth) if k.arg else UNSAFE
                for k in node.keywords
            ]
            return combine([receiver] + parts, True)
        if function.attr == "join" and len(node.args) == 1:
            separator = self.of(function.value, where, depth)
            if textual(separator) or isinstance(function.value, ast.Constant):
                return combine(
                    [separator, self.iterable(node.args[0], where, depth)], True
                )
        if function.attr in TEXT_METHODS:
            return self.of(function.value, where, depth)
        if function.attr == "get" and self.is_table(function.value, where):
            return combine([self.of(a, where, depth) for a in node.args[1:2]])
        if name.rsplit(".", 1)[-1] in QUOTING:
            return INERT
        return None

    def returns(self, call, where, depth):
        target = function_of(call, where)
        if target is None:
            return UNSAFE
        function, place = target
        key = ("function", id(function))
        if key in self.active:
            return INERT
        self.active.add(key)
        try:
            inner = Where(
                place.context, function, bind_arguments(call, function, where)
            )
            values = [
                self.of(n.value, inner, depth)
                for n in own_nodes(function)
                if isinstance(n, ast.Return) and n.value is not None
            ]
            return combine(values) if values else UNSAFE
        finally:
            self.active.discard(key)
