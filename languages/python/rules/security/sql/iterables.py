import ast

from checks.common import dotted_name, own_nodes
from security.resolve.classes import attribute_values
from security.resolve.scopes import lookup
from security.sql.schema import is_schema
from security.sql.shapes import (
    INERT,
    MAX_DEPTH,
    NUMERIC_CALLS,
    UNSAFE,
    combine,
    is_constant_text,
    safe_annotation,
    tail,
    textual,
)

SEQUENCE_CALLS = {"sorted", "list", "tuple", "set", "reversed", "enumerate", "zip"}
SEQUENCE_CALLS |= {"frozenset", "filter", "iter"}
WRAPPED_TABLES = {"MappingProxyType", "frozenset", "set", "tuple", "list", "dict"}
TABLE_DEPTH = 4


def constant_keys(node):
    return bool(node.keys) and all(
        key is not None and is_constant_text(key) for key in node.keys
    )


class Iterables:
    def iterable(self, node, where, depth):
        if depth > MAX_DEPTH:
            return UNSAFE
        depth += 1
        if isinstance(node, (ast.List, ast.Tuple, ast.Set, ast.Constant)):
            return self.of(node, where, depth)
        if isinstance(node, ast.Dict):
            return INERT if constant_keys(node) else UNSAFE
        if isinstance(node, (ast.ListComp, ast.GeneratorExp, ast.SetComp)):
            return self.of(node.elt, where, depth)
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Mult, ast.Add)):
            sides = [self.iterable(n, where, depth) for n in (node.left, node.right)]
            if isinstance(node.op, ast.Mult):
                return next((s for s in sides if textual(s)), combine(sides))
            return combine(sides)
        if is_schema(node, where):
            return INERT
        if isinstance(node, ast.Call):
            return self.iterable_call(node, where, depth)
        if isinstance(node, ast.Name):
            return self.iterable_name(node, where, depth)
        if isinstance(node, ast.Attribute):
            values = attribute_values(node, where)
            if values:
                return combine(
                    [self.iterable(value, place, depth) for value, place in values]
                )
        return UNSAFE

    def iterable_call(self, node, where, depth):
        name = dotted_name(node.func, where.context.aliases) or ""
        if name == "range":
            return INERT
        if name in SEQUENCE_CALLS:
            return combine([self.iterable(a, where, depth) for a in node.args])
        if name == "map" and len(node.args) == 2:
            if dotted_name(node.args[0], where.context.aliases) in NUMERIC_CALLS:
                return INERT
            return self.iterable(node.args[1], where, depth)
        function = node.func
        if isinstance(function, ast.Attribute):
            if function.attr == "keys":
                return INERT if self.is_collection(function.value, where) else UNSAFE
            if function.attr == "values":
                return INERT if self.is_table(function.value, where) else UNSAFE
            if function.attr == "items":
                owner = function.value
                safe = self.is_table(owner, where) and self.is_collection(owner, where)
                return INERT if safe else UNSAFE
            if function.attr == "split" and isinstance(function.value, ast.Constant):
                return INERT
        return self.returns(node, where, depth)

    def iterable_name(self, node, where, depth):
        entries = lookup(node.id, where)
        if not entries:
            return UNSAFE
        results = []
        for kind, value, place in entries:
            if kind == "param":
                results.append(INERT if safe_annotation(value, place) else UNSAFE)
            else:
                results.append(self.iterable(value, place, depth))
            if kind != "param":
                results.extend(self.list_writes(node.id, place, depth))
        return combine(results)

    def list_writes(self, name, where, depth):
        scope = where.scope if where.scope is not None else where.context.tree
        found = []
        for node in own_nodes(scope):
            if not (
                isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
            ):
                continue
            owner = node.func.value
            if not (isinstance(owner, ast.Name) and owner.id == name and node.args):
                continue
            if node.func.attr in {"append", "add"}:
                found.append(self.of(node.args[0], where, depth))
            elif node.func.attr == "insert" and len(node.args) == 2:
                found.append(self.of(node.args[1], where, depth))
            elif node.func.attr == "extend":
                found.append(self.iterable(node.args[0], where, depth))
        return found

    def is_table(self, node, where, depth=0):
        return self.constant_container(node, where, depth, keys=False)

    def is_collection(self, node, where, depth=0):
        return self.constant_container(node, where, depth, keys=True)

    def constant_container(self, node, where, depth, keys):
        if depth > TABLE_DEPTH or node is None:
            return False
        if isinstance(node, ast.Dict):
            if keys:
                return constant_keys(node)
            return bool(node.values) and all(is_constant_text(v) for v in node.values)
        if isinstance(node, (ast.Tuple, ast.List, ast.Set)):
            return bool(node.elts) and all(is_constant_text(e) for e in node.elts)
        if isinstance(node, ast.Call):
            function = node.func
            if isinstance(function, ast.Attribute) and function.attr == "keys" and keys:
                return self.constant_container(function.value, where, depth + 1, True)
            if tail(function, where) in WRAPPED_TABLES and len(node.args) == 1:
                return self.constant_container(node.args[0], where, depth + 1, keys)
            return False
        if isinstance(node, ast.Name):
            entries = lookup(node.id, where)
            return bool(entries) and all(
                kind == "value"
                and self.constant_container(value, place, depth + 1, keys)
                for kind, value, place in entries
            )
        if isinstance(node, ast.Attribute):
            values = attribute_values(node, where)
            return bool(values) and all(
                self.constant_container(value, place, depth + 1, keys)
                for value, place in values
            )
        return False
