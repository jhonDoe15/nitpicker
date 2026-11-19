import ast

from checks.common import dotted_name, own_nodes
from nullable_access.guards import is_guarded
from nullable_access.sources import single_binding
from security.resolve.scopes import FUNCTIONS, scope_of

Q_NAMES = {"django.db.models.Q", "django.db.models.query_utils.Q"}
BRANCH = "branch"
REDUCE = "reduce"
LOOP = "loop"
SQL_EMPTY = "sql-empty"
SQL_SPREAD = "sql-spread"
SQL_JOINS = {"or_"}
LOOPS = (ast.For, ast.AsyncFor, ast.While)
UNGUARDED = (False, False)


def is_empty_q(node, context):
    if not isinstance(node, ast.Call) or node.args or node.keywords:
        return False
    return dotted_name(node.func, context.aliases) in Q_NAMES


def is_or_operator(node, context):
    if isinstance(node, ast.Lambda):
        body = node.body
        return isinstance(body, ast.BinOp) and isinstance(body.op, ast.BitOr)
    name = dotted_name(node, context.aliases) or ""
    return name in {"operator.or_", "operator.ior"}


def is_empty_reduce(node, context):
    if not isinstance(node, ast.Call) or len(node.args) != 3:
        return False
    name = dotted_name(node.func, context.aliases) or ""
    if not (name.endswith("reduce") and is_empty_q(node.args[2], context)):
        return False
    return is_or_operator(node.args[0], context)


def sql_join(node, context):
    if not isinstance(node, ast.Call):
        return False
    name = dotted_name(node.func, context.aliases) or ""
    return name.startswith("sqlalchemy") and name.rsplit(".", 1)[-1] in SQL_JOINS


def spread_key(node):
    if len(node.args) != 1 or node.keywords:
        return None
    star = node.args[0]
    if not isinstance(star, ast.Starred):
        return None
    value = star.value
    if isinstance(value, (ast.Name, ast.Attribute)):
        return ast.unparse(value)
    if isinstance(value, (ast.ListComp, ast.GeneratorExp, ast.SetComp)):
        return ast.unparse(value.generators[0].iter)
    return None


def sql_form(node, context):
    if not sql_join(node, context):
        return None
    if not node.args and not node.keywords:
        return SQL_EMPTY
    return SQL_SPREAD if spread_key(node) else None


def direct_form(node, context):
    if is_empty_q(node, context):
        return BRANCH
    if sql_form(node, context) == SQL_EMPTY:
        return SQL_EMPTY
    if is_empty_reduce(node, context):
        return REDUCE
    if isinstance(node, ast.IfExp):
        return direct_form(node.body, context) or direct_form(node.orelse, context)
    if isinstance(node, ast.BoolOp) and isinstance(node.op, ast.Or):
        forms = (direct_form(value, context) for value in node.values)
        return next((form for form in forms if form), None)
    return None


def mentions_or(node):
    return any(
        isinstance(item, ast.BinOp) and isinstance(item.op, ast.BitOr)
        for item in ast.walk(node)
    )


def assigns(node, name):
    if isinstance(node, ast.AugAssign):
        return ast.unparse(node.target) == name and isinstance(node.op, ast.BitOr)
    if isinstance(node, ast.Assign):
        targets = any(ast.unparse(target) == name for target in node.targets)
        return targets and mentions_or(node.value)
    return False


def accumulating_loops(function, name):
    return [
        node
        for node in own_nodes(function)
        if isinstance(node, LOOPS) and any(assigns(n, name) for n in ast.walk(node))
    ]


def starts_empty(function, name, context):
    return any(
        isinstance(node, ast.Assign)
        and is_empty_q(node.value, context)
        and any(ast.unparse(target) == name for target in node.targets)
        for node in own_nodes(function)
    )


def is_checked(function, argument, loops, context):
    keys = [ast.unparse(argument)]
    keys += [ast.unparse(loop.iter) for loop in loops if hasattr(loop, "iter")]
    return guarded_any(function, argument, keys, context)


def guarded_any(function, argument, keys, context):
    return any(
        is_guarded(function, argument, key, context.parents, UNGUARDED) for key in keys
    )


def loop_form(argument, context):
    function = scope_of(argument, context)
    if not isinstance(function, FUNCTIONS):
        return None
    if not starts_empty(function, argument.id, context):
        return None
    loops = accumulating_loops(function, argument.id)
    if not loops or is_checked(function, argument, loops, context):
        return None
    return LOOP


def bound_form(argument, context):
    function = scope_of(argument, context)
    if not isinstance(function, FUNCTIONS):
        return None
    found = single_binding(argument.id, function, context)
    if found is None or found[0] != "value" or found[1] is None:
        return None
    form = direct_form(found[1], context)
    return None if is_checked(function, argument, [], context) else form


def is_filled_literal(key, function, context):
    found = single_binding(key, function, context)
    value = found[1] if found is not None and found[0] == "value" else None
    return isinstance(value, (ast.List, ast.Tuple)) and bool(value.elts)


def spread_form(argument, context):
    key = spread_key(argument) if sql_form(argument, context) else None
    function = scope_of(argument, context)
    if key is None or not isinstance(function, FUNCTIONS):
        return None
    if is_filled_literal(key, function, context):
        return None
    if guarded_any(function, argument, [key], context):
        return None
    return SQL_SPREAD


def argument_form(argument, context):
    form = direct_form(argument, context)
    if form is None and isinstance(argument, ast.Call):
        return spread_form(argument, context)
    if form is None and isinstance(argument, ast.Name):
        return bound_form(argument, context) or loop_form(argument, context)
    return form
