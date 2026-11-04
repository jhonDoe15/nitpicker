import ast

CONDITIONALS = (ast.If, ast.IfExp, ast.Match)


def arm_children(node, branch, ordinal):
    then, other = (f"{ordinal}:then",), (f"{ordinal}:else",)
    body = node.body if isinstance(node.body, list) else [node.body]
    orelse = node.orelse if isinstance(node.orelse, list) else [node.orelse]
    return [
        (node.test, branch),
        *[(child, branch + then) for child in body],
        *[(child, branch + other) for child in orelse],
    ]


def case_children(node, branch, ordinal):
    children = [(node.subject, branch)]
    for position, case in enumerate(node.cases):
        guard = [] if case.guard is None else [(case.guard, branch)]
        marker = (f"{ordinal}:{position}",)
        body = [(child, branch + marker) for child in case.body]
        children.extend([(case.pattern, branch), *guard, *body])
    return children


def child_branches(node, branch, ordinal):
    if isinstance(node, ast.Match):
        return case_children(node, branch, ordinal)
    if isinstance(node, (ast.If, ast.IfExp)):
        return arm_children(node, branch, ordinal)
    return [(child, branch) for child in ast.iter_child_nodes(node)]


def collect_branches(function_node):
    markers, count = {}, 0
    stack = [(statement, ()) for statement in reversed(function_node.body)]
    while stack:
        node, branch = stack.pop()
        markers[id(node)] = branch
        if isinstance(node, ast.ClassDef):
            continue
        stack.extend(reversed(child_branches(node, branch, count)))
        count += isinstance(node, CONDITIONALS)
    return markers


def branch_of(function_node, node):
    if getattr(function_node, "branch_cache", None) is None:
        function_node.branch_cache = collect_branches(function_node)
    return function_node.branch_cache.get(id(node), ())
