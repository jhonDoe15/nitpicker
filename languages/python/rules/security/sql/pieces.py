import ast

from checks.common import dotted_name, own_nodes
from security.resolve.calls import dict_entries
from security.resolve.classes import attribute_values, bind_arguments, function_of
from security.resolve.scopes import Where, is_enum_class, lookup
from security.sql.iterables import Iterables
from security.sql.schema import is_schema, schema_text, typed_field
from security.sql.shapes import (
    INERT,
    MAX_DEPTH,
    NUMERIC_CALLS,
    PREPARER_QUOTING,
    PREPARERS,
    QUOTING,
    UNSAFE,
    combine,
    guard_collections,
    safe_annotation,
    textual,
)

TEXT_METHODS = {"strip", "lstrip", "rstrip", "upper", "lower", "title", "casefold"}
TEXT_METHODS |= {"decode", "encode"}
COMPOSABLE = {"psycopg.sql.SQL", "psycopg2.sql.SQL", "psycopg.sql.Composed"}
COMPOSABLE |= {"psycopg2.sql.Composed"}
SCHEMA_NAMES = {"db_table", "__tablename__", "model_name", "app_label"}
TEMPLATES = {"string.Template"}
SUBSTITUTIONS = {"substitute", "safe_substitute"}


def add_operands(node):
    pending, found = [node], []
    while pending:
        current = pending.pop()
        if isinstance(current, ast.BinOp) and isinstance(current.op, ast.Add):
            pending.extend([current.right, current.left])
        else:
            found.append(current)
    return found


class Pieces(Iterables):
    def __init__(self):
        self.active = set()

    def of(self, node, where, depth=0):
        if depth > MAX_DEPTH or node is None:
            return UNSAFE
        method = getattr(self, f"of_{type(node).__name__}", None)
        return method(node, where, depth) if method else UNSAFE

    def of_Constant(self, node, where, depth):
        return (node.value, False, False) if isinstance(node.value, str) else INERT

    def of_JoinedStr(self, node, where, depth):
        parts = []
        for value in node.values:
            inner = value.value if isinstance(value, ast.FormattedValue) else value
            parts.append(self.of(inner, where, depth))
        built = any(isinstance(v, ast.FormattedValue) for v in node.values)
        return combine(parts, built=built)

    def of_BinOp(self, node, where, depth):
        if isinstance(node.op, ast.Add):
            parts = [self.of(operand, where, depth) for operand in add_operands(node)]
            return combine(parts, built=any(textual(part) for part in parts))
        left = self.of(node.left, where, depth)
        if isinstance(node.op, ast.Mod) and textual(left):
            return combine([left] + self.mapping_values(node.right, where, depth), True)
        right = self.of(node.right, where, depth)
        if isinstance(node.op, ast.Mult):
            text_side = left if textual(left) else right if textual(right) else None
            if text_side is not None:
                return text_side
        return combine([left, right], built=False)

    def mapping_values(self, node, where, depth):
        if isinstance(node, ast.Tuple):
            return [self.of(item, where, depth) for item in node.elts]
        if self.is_mapping(node, where):
            entries = dict_entries(node, where)
            found = [self.of(value, place, depth) for _, value, place in entries.items]
            return found + ([] if entries.complete else [UNSAFE])
        return [self.of(node, where, depth)]

    def is_mapping(self, node, where):
        if isinstance(node, ast.Name):
            values = [
                value for kind, value, _ in lookup(node.id, where) if kind == "value"
            ]
            node = values[0] if len(values) == 1 else None
        if isinstance(node, ast.Call):
            return dotted_name(node.func, where.context.aliases) == "dict"
        return isinstance(node, ast.Dict)

    def of_IfExp(self, node, where, depth):
        return combine([self.of(n, where, depth) for n in (node.body, node.orelse)])

    def of_BoolOp(self, node, where, depth):
        return combine([self.of(n, where, depth) for n in node.values])

    def of_Tuple(self, node, where, depth):
        return combine([self.of(n, where, depth) for n in node.elts])

    of_List = of_Set = of_Tuple

    def is_guarded(self, node, where):
        return any(
            self.is_collection(c, where) for c in guard_collections(node, where.context)
        )

    def of_Name(self, node, where, depth):
        if self.is_guarded(node, where):
            return INERT
        key = ("name", node.id, where.context.path, id(where.scope))
        if key in self.active:
            return INERT
        self.active.add(key)
        try:
            entries = lookup(node.id, where)
            if not entries:
                return UNSAFE
            return combine([self.entry(e, depth + 1) for e in entries])
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
        if node.attr in SCHEMA_NAMES or schema_text(node, where):
            return INERT
        if is_enum_class(node.value, where) or typed_field(node, where):
            return INERT
        values = self.attribute(node, where)
        if values is not None:
            return combine(
                [self.of(value, place, depth + 1) for value, place in values]
            )
        if node.attr in {"value", "name"}:
            return self.of(node.value, where, depth)
        return UNSAFE

    def attribute(self, node, where):
        key = ("attribute", ast.dump(node), where.context.path, id(where.scope))
        if key in self.active:
            return []
        self.active.add(key)
        try:
            return attribute_values(node, where)
        finally:
            self.active.discard(key)

    def of_Subscript(self, node, where, depth):
        return INERT if self.is_table(node.value, where) else UNSAFE

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

    def formatted(self, node, receiver, where, depth):
        if not textual(receiver):
            return None
        if any(isinstance(a, ast.Starred) for a in node.args):
            return combine([receiver, UNSAFE], True)
        parts = [self.of(a, where, depth) for a in node.args]
        parts += [
            self.of(k.value, where, depth) if k.arg else UNSAFE for k in node.keywords
        ]
        return combine([receiver] + parts, True)

    def method_call(self, node, function, name, where, depth):
        attr = function.attr
        receiver_call = function.value if isinstance(function.value, ast.Call) else None
        receiver_name = dotted_name(
            getattr(receiver_call, "func", None), where.context.aliases
        )
        if attr == "format" and receiver_name in COMPOSABLE:
            return INERT
        if attr == "format":
            return self.formatted(
                node, self.of(function.value, where, depth), where, depth
            )
        if attr == "format_map" and len(node.args) == 1:
            receiver = self.of(function.value, where, depth)
            values = self.mapping_values(node.args[0], where, depth)
            return combine([receiver] + values, True) if textual(receiver) else None
        if attr in SUBSTITUTIONS and receiver_name in TEMPLATES and receiver_call.args:
            template = self.of(receiver_call.args[0], where, depth)
            values = [
                v for a in node.args for v in self.mapping_values(a, where, depth)
            ]
            return (
                self.formatted(node, template, where, depth)
                if not values
                else combine([template] + values, True)
            )
        return self.other_method(node, function, name, where, depth)

    def other_method(self, node, function, name, where, depth):
        attr = function.attr
        if attr == "join" and len(node.args) == 1:
            separator = self.of(function.value, where, depth)
            if textual(separator) or isinstance(function.value, ast.Constant):
                return combine(
                    [separator, self.iterable(node.args[0], where, depth)], True
                )
        if attr in TEXT_METHODS:
            return self.of(function.value, where, depth)
        if attr == "mogrify" and node.args:
            return self.of(node.args[0], where, depth)
        if attr == "get" and self.is_table(function.value, where):
            return combine([self.of(a, where, depth) for a in node.args[1:2]])
        owner = (dotted_name(function.value, ({}, {})) or "").rsplit(".", 1)[-1]
        if attr in PREPARER_QUOTING and owner in PREPARERS:
            return INERT
        if name.rsplit(".", 1)[-1] in QUOTING or is_schema(node, where):
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
                self.of(n.value, inner, depth + 1)
                for n in own_nodes(function)
                if isinstance(n, ast.Return) and n.value is not None
            ]
            return combine(values) if values else UNSAFE
        finally:
            self.active.discard(key)
