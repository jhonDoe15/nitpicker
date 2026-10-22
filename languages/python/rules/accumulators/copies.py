import ast

from checks.common import dotted_name, finding, own_nodes
from effects.concurrency import enclosing_function

RULE = "accumulator-copy"
REDUCERS = {"functools.reduce"}
LOOPS = (ast.For, ast.AsyncFor, ast.While)
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
SEQUENCES = (ast.List, ast.Tuple, ast.ListComp)
UNIONS = (ast.Dict, ast.DictComp, ast.Set, ast.SetComp)
CONSTRUCTORS = {
    "list": "sequence",
    "tuple": "sequence",
    "dict": "union",
    "set": "union",
}
OPENERS = {ast.List: "[*{0}, ...]", ast.Tuple: "(*{0}, ...)", ast.Set: "{{*{0}, ...}}"}


def is_name(node, name):
    return isinstance(node, ast.Name) and node.id == name


def container_of(value):
    if isinstance(value, SEQUENCES):
        return "sequence"
    if isinstance(value, UNIONS):
        return "union"
    if isinstance(value, ast.Call) and isinstance(value.func, ast.Name):
        return CONSTRUCTORS.get(value.func.id)
    return None


def joined_form(value, name, container):
    if not isinstance(value, ast.BinOp):
        return None
    sequence = container == "sequence"
    union = container == "union"
    if isinstance(value.op, ast.Add):
        if is_name(value.left, name) and (
            sequence or isinstance(value.right, SEQUENCES)
        ):
            return f"{name} + [...]"
        if is_name(value.right, name) and (
            sequence or isinstance(value.left, SEQUENCES)
        ):
            return f"[...] + {name}"
    if isinstance(value.op, ast.BitOr):
        if is_name(value.left, name) and (union or isinstance(value.right, UNIONS)):
            return f"{name} | {{...}}"
        if is_name(value.right, name) and (union or isinstance(value.left, UNIONS)):
            return f"{{...}} | {name}"
    return None


def unpacked_form(value, name):
    if isinstance(value, ast.Dict):
        spread = any(
            key is None and is_name(item, name)
            for key, item in zip(value.keys, value.values)
        )
        return f"{{**{name}, ...}}" if spread else None
    template = OPENERS.get(type(value))
    if template and any(
        isinstance(e, ast.Starred) and is_name(e.value, name) for e in value.elts
    ):
        return template.format(name)
    return None


def copy_form(value, name, container=None):
    if isinstance(value, ast.IfExp):
        return copy_form(value.body, name, container) or copy_form(
            value.orelse, name, container
        )
    return joined_form(value, name, container) or unpacked_form(value, name)


def callback_of(argument, tree):
    if isinstance(argument, ast.Lambda):
        return argument
    if isinstance(argument, ast.Name):
        found = [
            n
            for n in ast.walk(tree)
            if isinstance(n, FUNCTIONS) and n.name == argument.id
        ]
        return found[0] if len(found) == 1 else None
    return None


def returned(callback):
    if isinstance(callback, ast.Lambda):
        return [callback.body]
    return [
        n.value for n in own_nodes(callback) if isinstance(n, ast.Return) and n.value
    ]


def accumulator_name(callback):
    arguments = callback.args
    every = arguments.posonlyargs + arguments.args
    return every[0].arg if every else None


def reduce_findings(context):
    found = []
    for node in ast.walk(context.tree):
        if (
            not isinstance(node, ast.Call)
            or dotted_name(node.func, context.aliases) not in REDUCERS
        ):
            continue
        callback = callback_of(node.args[0], context.tree) if node.args else None
        name = accumulator_name(callback) if callback is not None else None
        container = container_of(node.args[2]) if len(node.args) > 2 else None
        values = returned(callback) if name else []
        forms = [copy_form(value, name, container) for value in values]
        form = next(filter(None, forms), None)
        if form:
            found.append(finding(context.path, RULE, f"{name}|{form}|reduce", node))
    return found


def innermost_loop(node, parents):
    current = parents.get(id(node))
    while current is not None and not isinstance(
        current, (*FUNCTIONS, ast.Lambda, ast.ClassDef)
    ):
        if isinstance(current, LOOPS):
            return current
        current = parents.get(id(current))
    return None


def stored_outside(name, loop, scope):
    inside = {id(node) for node in ast.walk(loop)}
    return [
        node
        for node in own_nodes(scope)
        if isinstance(node, ast.Name)
        and node.id == name
        and isinstance(node.ctx, ast.Store)
        and id(node) not in inside
    ]


def is_parameter(name, scope):
    if not isinstance(scope, FUNCTIONS):
        return False
    arguments = scope.args
    every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
    return name in {argument.arg for argument in every}


def bound_before(name, loop, scope):
    return bool(stored_outside(name, loop, scope)) or is_parameter(name, scope)


def outside_values(name, loop, scope, context):
    values = []
    for node in stored_outside(name, loop, scope):
        parent = context.parents.get(id(node))
        values.append(parent.value if isinstance(parent, ast.Assign) else None)
    return values


def is_tuple_value(value):
    if isinstance(value, ast.Call):
        return isinstance(value.func, ast.Name) and value.func.id == "tuple"
    return isinstance(value, ast.Tuple)


def assignment_form(node, loop, scope, context):
    if isinstance(node, ast.Assign) and len(node.targets) == 1:
        target = node.targets[0]
        if isinstance(target, ast.Name):
            values = outside_values(target.id, loop, scope, context)
            containers = {container_of(value) for value in values}
            container = containers.pop() if len(containers) == 1 else None
            form = copy_form(node.value, target.id, container)
            return (
                (target.id, form)
                if form and bound_before(target.id, loop, scope)
                else None
            )
    if isinstance(node, ast.AugAssign) and isinstance(node.op, ast.Add):
        if isinstance(node.target, ast.Name) and isinstance(node.value, ast.Tuple):
            values = outside_values(node.target.id, loop, scope, context)
            if values and all(is_tuple_value(value) for value in values):
                return node.target.id, f"{node.target.id} += (...,)"
    return None


def loop_findings(context):
    found = []
    for node in ast.walk(context.tree):
        if not isinstance(node, (ast.Assign, ast.AugAssign)):
            continue
        loop = innermost_loop(node, context.parents)
        if loop is None:
            continue
        scope = enclosing_function(node, context.parents) or context.tree
        pair = assignment_form(node, loop, scope, context)
        if pair is not None:
            found.append(finding(context.path, RULE, f"{pair[0]}|{pair[1]}|loop", node))
    return found


def check(context):
    if context.tests:
        return []
    return reduce_findings(context) + loop_findings(context)
