import ast

from design.astutil import STORE_CONTEXTS, all_nodes
from design.calls import resolve_call

MUTATORS = {
    "append",
    "extend",
    "insert",
    "remove",
    "pop",
    "clear",
    "sort",
    "reverse",
    "update",
    "add",
    "discard",
    "setdefault",
    "popitem",
    "appendleft",
    "extendleft",
    "popleft",
    "difference_update",
    "intersection_update",
    "symmetric_difference_update",
}


def local_mutations(scope):
    if hasattr(scope, "mutations"):
        return scope.mutations
    found = {}
    for node in all_nodes(scope.function.node):
        hit = mutation_at(scope, node)
        if hit is not None:
            name, kind = hit
            current = found.get(name)
            at = (node.lineno, node.col_offset)
            if current is None or at < current[0]:
                found[name] = (at, kind)
    scope.mutations = found
    return found


def mutation_at(scope, node):
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        owner = node.func.value
        if node.func.attr in MUTATORS and isinstance(owner, ast.Name):
            if resolve_call(scope, node) is None:
                return owner.id, node.func.attr
    if isinstance(node, (ast.Subscript, ast.Attribute)) and isinstance(
        node.ctx, STORE_CONTEXTS
    ):
        if isinstance(node.value, ast.Name):
            return node.value.id, "assign"
    return None


def produced_value(scope, call, resolution):
    if resolution is None:
        return None, None
    parent = scope.module.parents.get(id(call))
    if isinstance(parent, ast.Await):
        return parent, scope.module.parents.get(id(parent))
    if getattr(resolution.target, "is_async", False):
        return None, None
    return call, parent


def direct_mutation(scope, value, parent):
    if isinstance(parent, ast.Attribute) and parent.value is value:
        grand = scope.module.parents.get(id(parent))
        if (
            isinstance(grand, ast.Call)
            and grand.func is parent
            and parent.attr in MUTATORS
        ):
            return parent.attr if resolve_call(scope, grand) is None else None
        if isinstance(parent.ctx, STORE_CONTEXTS):
            return "assign"
    if isinstance(parent, ast.Subscript) and parent.value is value:
        return "assign" if isinstance(parent.ctx, STORE_CONTEXTS) else None
    return None


def aliased_mutation(scope, value, parent):
    if not isinstance(parent, (ast.Assign, ast.AnnAssign)) or parent.value is not value:
        return None
    targets = parent.targets if isinstance(parent, ast.Assign) else [parent.target]
    if len(targets) != 1 or not isinstance(targets[0], ast.Name):
        return None
    name = targets[0].id
    if len(scope.sites.get(name, [])) != 1:
        return None
    hit = local_mutations(scope).get(name)
    return hit[1] if hit else None


def mutation_of(scope, call, resolution):
    value, parent = produced_value(scope, call, resolution)
    if value is None:
        return None
    return direct_mutation(scope, value, parent) or aliased_mutation(
        scope, value, parent
    )
