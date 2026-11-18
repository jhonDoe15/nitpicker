import ast

from checks.common import finding

RULE = "unpaged-listing"
LISTINGS = {"list_objects_v2", "list_objects", "list_object_versions"}
MARKERS = {
    "NextContinuationToken", "ContinuationToken", "IsTruncated", "NextMarker", "Marker", "KeyMarker",
    "NextKeyMarker", "NextVersionIdMarker", "StartAfter", "get_paginator", "paginate",
}
PAGE_SIZE = "MaxKeys"
SEARCH_MARKERS = {"paging", "limit"}
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)
SHOWN = 40


def names_in(root):
    names = set()
    for node in ast.walk(root):
        if isinstance(node, ast.Name):
            names.add(node.id)
        elif isinstance(node, ast.Attribute):
            names.add(node.attr)
        elif isinstance(node, ast.keyword) and node.arg:
            names.add(node.arg)
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            names.add(node.value)
    return names


def scope_of(node, parents):
    current = parents.get(id(node))
    while current is not None and not isinstance(current, FUNCTIONS):
        current = parents.get(id(current))
    if current is not None:
        return current
    while id(node) in parents:
        node = parents[id(node)]
    return node


def climb(node, parents):
    current = node
    while True:
        parent = parents.get(id(current))
        passes = isinstance(parent, (ast.Attribute, ast.Subscript, ast.Await)) or (
            isinstance(parent, ast.Call) and parent.func is current
        )
        if not passes:
            return current
        current = parent


def is_presence_test(node, parents):
    parent = parents.get(id(node))
    if isinstance(parent, ast.UnaryOp):
        return isinstance(parent.op, ast.Not)
    if isinstance(parent, ast.Call):
        return isinstance(parent.func, ast.Name) and parent.func.id in {"bool", "len"}
    if not isinstance(parent, ast.Compare) or len(parent.comparators) != 1:
        return False
    other = parent.comparators[0] if parent.left is node else parent.left
    return isinstance(other, ast.Constant) and isinstance(other.value, (int, str))


def presence_only(node, parents, scope):
    result = climb(node, parents)
    if is_presence_test(result, parents):
        return True
    parent = parents.get(id(result))
    if not isinstance(parent, ast.Assign) or len(parent.targets) != 1:
        return False
    target = parent.targets[0]
    uses = [
        each
        for each in ast.walk(scope)
        if isinstance(each, ast.Name) and isinstance(target, ast.Name) and each.id == target.id
        and isinstance(each.ctx, ast.Load)
    ]
    return bool(uses) and all(is_presence_test(climb(each, parents), parents) for each in uses)


def is_listing(node):
    keywords = {keyword.arg for keyword in node.keywords}
    return (
        isinstance(node.func, ast.Attribute)
        and node.func.attr in LISTINGS
        and "Bucket" in keywords
        and PAGE_SIZE not in keywords
    )


def is_search(node):
    func = node.func
    return (
        isinstance(func, ast.Attribute)
        and func.attr == "search"
        and isinstance(func.value, ast.Call)
        and isinstance(func.value.func, ast.Attribute)
        and func.value.func.attr == "ft"
        and len(node.args) == 1
    )


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call):
            continue
        listing, search = is_listing(node), is_search(node)
        if not listing and not search:
            continue
        scope = scope_of(node, context.parents)
        if names_in(scope) & (MARKERS if listing else SEARCH_MARKERS):
            continue
        if listing and presence_only(node, context.parents, scope):
            continue
        kind = "listing" if listing else "search"
        found.append(finding(context.path, RULE, f"{kind}|{ast.unparse(node.func)[:SHOWN]}", node))
    return found
