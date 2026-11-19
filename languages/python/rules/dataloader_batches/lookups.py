import ast

from checks.common import dotted_name

SAFE_CONSTRUCTORS = {"defaultdict", "Counter", "fromkeys"}


def names_in(node):
    return {item.id for item in ast.walk(node) if isinstance(item, ast.Name)}


def targets_of(generators):
    names = set()
    for generator in generators:
        names |= {n.id for n in ast.walk(generator.target) if isinstance(n, ast.Name)}
    return names


def is_keys(node, keys):
    return isinstance(node, ast.Name) and node.id == keys


def is_safe_value(value, keys):
    if isinstance(value, ast.DictComp):
        return any(is_keys(g.iter, keys) for g in value.generators)
    if isinstance(value, ast.Call):
        name = (dotted_name(value.func, ({}, {})) or "").rsplit(".", 1)[-1]
        return name in SAFE_CONSTRUCTORS
    return False


def filled_names(loop):
    loop_names = targets_of([ast.comprehension(loop.target, loop.iter, [], 0)])
    filled = set()
    for node in ast.walk(loop):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                is_slot = isinstance(target, ast.Subscript) and isinstance(
                    target.value, ast.Name
                )
                if is_slot and names_in(target.slice) & loop_names:
                    filled.add(target.value.id)
    return filled


def safe_names(function, keys):
    safe = set()
    for node in ast.walk(function):
        if isinstance(node, ast.Assign) and is_safe_value(node.value, keys):
            safe |= {t.id for t in node.targets if isinstance(t, ast.Name)}
        elif isinstance(node, ast.For) and is_keys(node.iter, keys):
            safe |= filled_names(node)
    return safe


def has_membership_test(node):
    return any(
        isinstance(item, ast.Compare)
        and any(isinstance(op, (ast.In, ast.NotIn)) for op in item.ops)
        for item in ast.walk(node)
    )


def is_unguarded_lookup(node, loop_names, safe):
    if not isinstance(node, ast.Subscript) or not isinstance(node.ctx, ast.Load):
        return False
    owner = node.value
    if isinstance(owner, ast.Name) and owner.id in safe:
        return False
    if not isinstance(owner, (ast.Name, ast.Attribute)):
        return False
    return isinstance(node.slice, ast.Name) and node.slice.id in loop_names


def first_lookup(expression, loop_names, safe):
    if has_membership_test(expression):
        return None
    for node in ast.walk(expression):
        if is_unguarded_lookup(node, loop_names, safe):
            return node
    return None
