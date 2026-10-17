import ast

from checks.common import dotted_name
from security.resolve.classes import attribute_values
from security.resolve.scopes import lookup

BOOLEAN_CALLS = {"bool", "strtobool", "getboolean", "as_bool", "to_bool", "str2bool"}
MAX_DEPTH = 6


def keyword(call, name):
    return next((k.value for k in call.keywords if k.arg == name), None)


def is_boolean_shaped(node, where):
    if isinstance(node, ast.Compare):
        return True
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
        return True
    if isinstance(node, ast.Call):
        name = dotted_name(node.func, where.context.aliases) or ""
        cast = keyword(node, "cast")
        return (
            name.rsplit(".", 1)[-1] in BOOLEAN_CALLS
            or name.endswith("env.bool")
            or (isinstance(cast, ast.Name) and cast.id == "bool")
        )
    return False


def bound_values(node, where):
    if isinstance(node, ast.Name):
        entries = lookup(node.id, where)
        return [(value, place) for kind, value, place in entries if kind == "value"]
    if isinstance(node, ast.Attribute):
        return attribute_values(node, where) or []
    return []


def bool_op_can_be(node, where, wanted, depth):
    returned_last = isinstance(node.op, ast.Or) != wanted
    operands = node.values[-1:] if returned_last else node.values
    return any(can_be(operand, where, wanted, depth + 1) for operand in operands)


def can_be(node, where, wanted, depth=0):
    if depth > MAX_DEPTH or node is None:
        return False
    if isinstance(node, ast.Constant):
        return node.value is wanted
    if isinstance(node, ast.IfExp):
        return any(
            can_be(n, where, wanted, depth + 1) for n in (node.body, node.orelse)
        )
    if isinstance(node, ast.BoolOp):
        return bool_op_can_be(node, where, wanted, depth)
    if isinstance(node, (ast.Name, ast.Attribute)):
        values = bound_values(node, where)
        if values:
            return any(
                can_be(value, place, wanted, depth + 1) for value, place in values
            )
    return is_boolean_shaped(node, where)


def can_be_false(node, where):
    return can_be(node, where, False)


def can_be_true(node, where):
    return can_be(node, where, True)


def fixed_values(node, where):
    if isinstance(node, ast.Name):
        entries = lookup(node.id, where)
        if any(kind != "value" for kind, _, _ in entries):
            return []
        return [(value, place) for _, value, place in entries]
    return bound_values(node, where)


def is_constant(node, where, wanted, depth=0):
    if isinstance(node, ast.Constant):
        return node.value is wanted
    values = fixed_values(node, where) if depth <= MAX_DEPTH else []
    return bool(values) and all(
        is_constant(value, place, wanted, depth + 1) for value, place in values
    )


def is_true(node, where):
    return is_constant(node, where, True)


def is_none(node, where):
    return node is not None and is_constant(node, where, None)
