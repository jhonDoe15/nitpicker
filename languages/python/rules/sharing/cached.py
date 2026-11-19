import ast

from checks.common import dotted_name, finding
from sharing.mutations import changes, function_operations
from sharing.values import RULE, mutable_kind
from signatures.annotations import FUNCTION_TYPES
from reach.kinds import CONTAINERS
from index.scopes import enclosing_function
from reach.callees import callee_key
from reach.flow import walk_scope

CACHE_DECORATORS = {"functools.cache", "functools.lru_cache"}


def is_cached(function, aliases):
    return any(
        dotted_name(item.func if isinstance(item, ast.Call) else item, aliases) in CACHE_DECORATORS
        for item in function.decorator_list
    )


def returned_kind(function, aliases):
    nodes = walk_scope(function)
    assigned = {}
    for node in nodes:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    assigned.setdefault(target.id, []).append(node.value)
    for node in nodes:
        if isinstance(node, ast.Return) and node.value is not None:
            value = node.value
            if isinstance(value, ast.Name) and len(assigned.get(value.id, [])) == 1:
                value = assigned[value.id][0]
            kind = mutable_kind(value, aliases)
            if kind:
                return kind
    return None


def cached_functions(project):
    def build(_):
        found = {}
        for path, context in project.contexts.items():
            if path in project.test_files:
                continue
            for node in ast.walk(context.tree):
                if isinstance(node, FUNCTION_TYPES) and is_cached(node, context.aliases):
                    kind = returned_kind(node, context.aliases)
                    if kind:
                        found.setdefault((path, node.name), (node, kind))
        return found

    return project.memo(("shared-cached-functions",), build)


def changed_in_place(call, kind, context):
    parent = context.parents.get(id(call))
    if isinstance(parent, ast.Attribute) and parent.value is call:
        return parent.attr in CONTAINERS[kind]
    if isinstance(parent, ast.Subscript) and parent.value is call:
        return isinstance(parent.ctx, (ast.Store, ast.Del)) and changes(kind, "[]")
    if isinstance(parent, ast.Assign) and len(parent.targets) == 1:
        return assigned_then_changed(parent, kind, context)
    return False


def assigned_then_changed(assign, kind, context):
    target = assign.targets[0]
    function = enclosing_function(assign, context.parents)
    if not isinstance(target, ast.Name) or function is None:
        return False
    stores = [
        node
        for node in ast.walk(function)
        if isinstance(node, ast.Name) and node.id == target.id and isinstance(node.ctx, ast.Store)
    ]
    return len(stores) == 1 and any(
        key == target.id and changes(kind, operation) and node.lineno > assign.lineno
        for key, operation, node in function_operations(function)
    )


def changed_names(context):
    cached = cached_functions(context.project)
    found = set()
    for node in ast.walk(context.tree):
        key = callee_key(node, context) if isinstance(node, ast.Call) else None
        if key in cached and changed_in_place(node, cached[key][1], context):
            found.add(key)
    return found


def mutated_results(project):
    def build(_):
        found = set()
        for path, context in project.contexts.items():
            if path not in project.test_files:
                found.update(changed_names(context))
        return found

    return project.memo(("shared-cached-mutations",), build)


def cached_findings(context):
    cached = cached_functions(context.project)
    changed = mutated_results(context.project)
    return [
        finding(context.path, RULE, f"{name}()", function)
        for (path, name), (function, _) in cached.items()
        if path == context.path and (path, name) in changed
    ]
