import ast

from checks.common import dotted_name, finding

GUARDED = True
RULE = "wall-clock-elapsed"
WALL_CALLS = {
    "time.time",
    "time.time_ns",
    "datetime.datetime.now",
    "datetime.datetime.utcnow",
    "datetime.now",
    "datetime.utcnow",
}
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
RECORDERS = ("record", "observe", "timing", "histogram", "distribution")


def is_wall_read(node, aliases):
    return isinstance(node, ast.Call) and dotted_name(node.func, aliases) in WALL_CALLS


def assignments(function):
    counts, values = {}, {}
    for node in ast.walk(function):
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
            if isinstance(target, ast.Name):
                counts[target.id] = counts.get(target.id, 0) + 1
                values[target.id] = node
    return {name: values[name] for name, count in counts.items() if count == 1}


def wall_names(single, aliases):
    return {name for name, node in single.items() if is_wall_read(node.value, aliases)}


def is_wall_value(node, walls, aliases):
    return is_wall_read(node, aliases) or (isinstance(node, ast.Name) and node.id in walls)


def difference_of(use, parents, walls, aliases):
    parent = parents.get(id(use))
    if not isinstance(parent, ast.BinOp) or not isinstance(parent.op, ast.Sub):
        return None
    if parent.right is not use:
        return None
    return parent if is_wall_value(parent.left, walls, aliases) else None


def is_sink(node, parents):
    parent = parents.get(id(node))
    if isinstance(parent, ast.Compare):
        return True
    if isinstance(parent, ast.Call):
        name = dotted_name(parent.func, ({}, {}, set())) or ""
        return name.rsplit(".", 1)[-1].startswith(RECORDERS)
    return False


def reaches_sink(difference, parents, function):
    if is_sink(difference, parents):
        return True
    parent = parents.get(id(difference))
    if not isinstance(parent, ast.Assign) or not isinstance(parent.targets[0], ast.Name):
        return False
    name = parent.targets[0].id
    return any(
        isinstance(node, ast.Name)
        and node.id == name
        and isinstance(node.ctx, ast.Load)
        and is_sink(node, parents)
        for node in ast.walk(function)
    )


def check(context):
    if context.tests:
        return []
    found = []
    for function in ast.walk(context.tree):
        if not isinstance(function, FUNCTIONS):
            continue
        single = assignments(function)
        walls = wall_names(single, context.aliases)
        for name in walls:
            uses = [
                node
                for node in ast.walk(function)
                if isinstance(node, ast.Name) and node.id == name and isinstance(node.ctx, ast.Load)
            ]
            differences = [difference_of(use, context.parents, walls, context.aliases) for use in uses]
            if (
                uses
                and all(difference is not None for difference in differences)
                and any(reaches_sink(each, context.parents, function) for each in differences)
            ):
                found.append(finding(context.path, RULE, name, single[name]))
    return found
