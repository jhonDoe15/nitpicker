import ast

from checks.common import dotted_name, finding

GUARDED = True
RULE = "nan-only-guard"
NAN_CALLS = {"math.isnan", "cmath.isnan", "numpy.isnan"}
FINITE_CALLS = {"math.isfinite", "math.isinf", "numpy.isfinite", "numpy.isinf"}
COLLECTORS = {"add", "append"}
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
RELATIONS = (ast.Lt, ast.LtE, ast.Gt, ast.GtE)


def is_float_parse(value):
    return (
        isinstance(value, ast.Call)
        and isinstance(value.func, ast.Name)
        and value.func.id == "float"
        and len(value.args) == 1
        and not isinstance(value.args[0], ast.Constant)
    )


def parsed_names(scope):
    counts, parsed = {}, set()
    for node in ast.walk(scope):
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
            if isinstance(target, ast.Name):
                counts[target.id] = counts.get(target.id, 0) + 1
                if is_float_parse(node.value):
                    parsed.add(target.id)
    return {name for name in parsed if counts[name] == 1}


def mentions_infinity(scope, aliases):
    for node in ast.walk(scope):
        name = dotted_name(node.func, aliases) if isinstance(node, ast.Call) else None
        if name in FINITE_CALLS:
            return True
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            continue
        if dotted_name(node, aliases) in {"math.inf", "numpy.inf"}:
            return True
    return False


def is_bounded(scope, name):
    for node in ast.walk(scope):
        if isinstance(node, ast.Compare) and any(isinstance(op, RELATIONS) for op in node.ops):
            operands = [node.left, *node.comparators]
            if any(isinstance(item, ast.Name) and item.id == name for item in operands):
                return True
    return False


def filters_into_collection(node, parents):
    negation = parents.get(id(node))
    branch = parents.get(id(negation))
    if not (
        isinstance(negation, ast.UnaryOp)
        and isinstance(negation.op, ast.Not)
        and isinstance(branch, ast.If)
        and len(branch.body) == 1
        and isinstance(branch.body[0], ast.Expr)
    ):
        return False
    call = branch.body[0].value
    return (
        isinstance(call, ast.Call)
        and isinstance(call.func, ast.Attribute)
        and call.func.attr in COLLECTORS
    )


def check(context):
    if context.tests:
        return []
    found = []
    for scope in ast.walk(context.tree):
        if not isinstance(scope, FUNCTIONS):
            continue
        names = parsed_names(scope)
        if not names or mentions_infinity(scope, context.aliases):
            continue
        for node in ast.walk(scope):
            if (
                isinstance(node, ast.Call)
                and dotted_name(node.func, context.aliases) in NAN_CALLS
                and len(node.args) == 1
                and isinstance(node.args[0], ast.Name)
                and node.args[0].id in names
                and not is_bounded(scope, node.args[0].id)
                and not filters_into_collection(node, context.parents)
            ):
                found.append(finding(context.path, RULE, node.args[0].id, node))
    return found
