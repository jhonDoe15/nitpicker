import ast

TRIES = (ast.Try, getattr(ast, "TryStar", ast.Try))


def arm_of(parent, child):
    if isinstance(parent, ast.If):
        if child in parent.body:
            return "body"
        return "orelse" if child in parent.orelse else None
    if isinstance(parent, TRIES):
        if isinstance(child, ast.ExceptHandler):
            return f"handler{id(child)}"
        return "body" if child in parent.body else None
    if isinstance(parent, ast.Match) and isinstance(child, ast.match_case):
        return f"case{id(child)}"
    return None


def arms_of(node, parents):
    arms = {}
    child = node
    while id(child) in parents:
        parent = parents[id(child)]
        arm = arm_of(parent, child)
        if arm is not None:
            arms[id(parent)] = arm
        child = parent
    return arms


def in_exclusive_arms(first, second, parents):
    left, right = arms_of(first, parents), arms_of(second, parents)
    return any(
        key in right and right[key] != arm
        for key, arm in left.items()
    )
