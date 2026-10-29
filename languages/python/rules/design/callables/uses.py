import ast

from design.calls.calls import resolve_call
from design.resolve.annotations import project_type
from design.resolve.symbols import LiteralAlias
from design.support.astutil import (
    CLOSURES,
    STORE_CONTEXTS,
    all_nodes,
    body_without_docstring,
    closure_arguments,
    own_nodes,
)
from design.types.classes import classify

USE_KINDS = {"class", "data", "interface"}


def eligible_params(scope):
    found = []
    for parameter in scope.params:
        if parameter.variadic or parameter.annotation is None:
            continue
        typedef = project_type(scope, parameter.annotation)
        usable = typedef is not None and not isinstance(typedef, LiteralAlias)
        if usable and classify(scope.index, typedef) in USE_KINDS:
            found.append((parameter, typedef))
    return found


def shadows(node, name):
    return isinstance(node, CLOSURES) and any(
        argument.arg == name for argument in closure_arguments(node)
    )


def captured(scope, node):
    parents = scope.module.parents
    current = parents.get(id(node))
    while current is not None and current is not scope.function.node:
        if isinstance(current, ast.ClassDef) or shadows(current, node.id):
            return True
        current = parents.get(id(current))
    return False


def call_position(scope, call, argument):
    resolution = resolve_call(scope, call)
    if resolution is None:
        return None
    params = scope.index.scope_of(resolution.target).params
    if isinstance(argument, ast.keyword):
        names = [p.name for p in params if not p.variadic]
        found = names.index(argument.arg) if argument.arg in names else None
        return (resolution.target, found)
    if any(
        isinstance(a, ast.Starred) for a in call.args[: call.args.index(argument) + 1]
    ):
        return None
    position = call.args.index(argument) + resolution.shift
    declared = [p for p in params if not p.variadic]
    ok = position < len(declared) and params[position] is declared[position]
    return (resolution.target, position if ok else None)


def classify_use(scope, name_node):
    parents = scope.module.parents
    parent = parents.get(id(name_node))
    if isinstance(parent, ast.Attribute) and parent.value is name_node:
        field = parent.attr
        opaque = field.startswith("__") and field.endswith("__")
        return ("field", field, opaque)
    if isinstance(parent, ast.Call) and name_node in parent.args:
        return ("pass", parent, name_node)
    if isinstance(parent, ast.keyword) and parent.value is name_node:
        return ("pass", parents.get(id(parent)), parent)
    if isinstance(parent, ast.Compare) and neutral_comparison(parent):
        return ("neutral",)
    return ("opaque",)


def neutral_comparison(compare):
    operators = all(isinstance(op, (ast.Is, ast.IsNot)) for op in compare.ops)
    nones = all(
        isinstance(c, ast.Constant) and c.value is None for c in compare.comparators
    )
    return operators and nones


def record_use(scope, name_node, usage):
    kind = classify_use(scope, name_node)
    if kind[0] == "field":
        if kind[2]:
            usage["opaque"] = True
        else:
            usage["fields"].setdefault(kind[1], None)
    elif kind[0] == "pass":
        resolved = call_position(scope, kind[1], kind[2])
        if resolved is None or resolved[1] is None:
            usage["opaque"] = True
        else:
            usage["forwards"].append(
                {"target": resolved[0].id, "position": resolved[1]}
            )
    elif kind[0] == "opaque":
        usage["opaque"] = True


def position_key(node):
    return (getattr(node, "lineno", 0), getattr(node, "col_offset", 0))


def collect_uses(scope, names):
    usages = {n: {"fields": {}, "forwards": [], "opaque": False} for n in names}
    ordered = sorted(all_nodes(scope.function.node), key=position_key)
    for node in ordered:
        if not isinstance(node, ast.Name) or node.id not in usages:
            continue
        usage = usages[node.id]
        if isinstance(node.ctx, STORE_CONTEXTS) or captured(scope, node):
            usage["opaque"] = True
        else:
            record_use(scope, node, usage)
    return usages


def param_uses(scope):
    eligible = eligible_params(scope)
    usages = collect_uses(scope, [p.name for p, _ in eligible])
    result = []
    for parameter, _ in eligible:
        usage = usages[parameter.name]
        entry = {
            "param": parameter.index,
            "fields": list(usage["fields"]),
            "forwards": usage["forwards"],
        }
        if usage["opaque"]:
            entry["opaque"] = True
        result.append(entry)
    return result


def forward_target(scope):
    body = body_without_docstring(scope.function.node.body)
    if len(body) != 1:
        return None
    statement = body[0]
    value = getattr(statement, "value", None)
    value = value.value if isinstance(value, ast.Await) else value
    if not isinstance(value, ast.Call):
        return None
    returned = isinstance(statement, ast.Return)
    if not returned and not isinstance(statement, ast.Expr):
        return None
    return value, returned


def returns_nothing(function):
    node = function.node.returns
    if node is not None:
        return isinstance(node, ast.Constant) and node.value is None
    from design.support.scope import is_generator

    returns = [n for n in own_nodes(function.node) if isinstance(n, ast.Return)]
    valued = [
        n for n in returns if n.value is not None and not is_none_constant(n.value)
    ]
    return not valued and not is_generator(function)


def is_none_constant(node):
    return isinstance(node, ast.Constant) and node.value is None


def argument_indexes(scope, call, target):
    indexes = {p.name: p.index for p in scope.params if not p.variadic}
    declared = [p.name for p in scope.index.scope_of(target).params if not p.variadic]
    result = [passed_index(scope, argument, indexes) for argument in call.args]
    keyed = []
    for keyword in call.keywords:
        if keyword.arg not in declared:
            return None
        keyed.append(
            (declared.index(keyword.arg), passed_index(scope, keyword.value, indexes))
        )
    return result + [index for _, index in sorted(keyed)]


def passed_index(scope, node, indexes):
    known = isinstance(node, ast.Name) and node.id in indexes
    if known and len(scope.sites.get(node.id, [])) == 1:
        return indexes[node.id]
    return -1


def forward_fact(scope):
    found = forward_target(scope)
    if found is None:
        return None
    call, returned = found
    resolution = resolve_call(scope, call)
    if resolution is None or resolution.target.name == "__init__":
        return None
    if not returned and not returns_nothing(resolution.target):
        return None
    arguments = argument_indexes(scope, call, resolution.target)
    if arguments is None or all(index == -1 for index in arguments):
        return None
    return {
        "target": resolution.target.id,
        "arguments": arguments,
        "returned": returned,
    }
