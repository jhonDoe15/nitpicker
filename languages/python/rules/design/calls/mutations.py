import ast

from design.calls.calls import resolve_call
from design.support.astutil import STORE_CONTEXTS, all_nodes

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
    hits = [(node, mutation_at(scope, node)) for node in all_nodes(scope.function.node)]
    found = {}
    for node, (name, kind) in ((n, hit) for n, hit in hits if hit is not None):
        at = (node.lineno, node.col_offset)
        if name not in found or at < found[name][0]:
            found[name] = (at, kind)
    scope.mutations = found
    return found


def mutator_call(scope, node):
    if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
        return None
    owner = node.func.value
    mutates = node.func.attr in MUTATORS and isinstance(owner, ast.Name)
    if mutates and resolve_call(scope, node) is None:
        return owner.id, node.func.attr
    return None


def mutation_at(scope, node):
    if isinstance(node, ast.AugAssign) and isinstance(node.target, ast.Name):
        return node.target.id, "+="
    stored = isinstance(node, (ast.Subscript, ast.Attribute)) and isinstance(
        node.ctx, STORE_CONTEXTS
    )
    if stored and isinstance(node.value, ast.Name):
        return node.value.id, "assign"
    return mutator_call(scope, node)


def passes_through(parent, value):
    if isinstance(parent, ast.IfExp):
        return parent.test is not value
    return isinstance(parent, (ast.BoolOp, ast.NamedExpr))


def produced_value(scope, call, resolution):
    parents = scope.module.parents
    value, parent = call, parents.get(id(call))
    if isinstance(parent, ast.Await):
        value, parent = parent, parents.get(id(parent))
    elif getattr(resolution.target, "is_async", False):
        return None, None, []
    names = []
    while passes_through(parent, value):
        if isinstance(parent, ast.NamedExpr):
            names.append(parent.target.id)
        value, parent = parent, parents.get(id(parent))
    return value, parent, names


def direct_mutation(scope, value, parent):
    if isinstance(parent, ast.Subscript) and parent.value is value:
        return "assign" if isinstance(parent.ctx, STORE_CONTEXTS) else None
    if not isinstance(parent, ast.Attribute) or parent.value is not value:
        return None
    if isinstance(parent.ctx, STORE_CONTEXTS):
        return "assign"
    grand = scope.module.parents.get(id(parent))
    mutator = isinstance(grand, ast.Call) and grand.func is parent
    if mutator and parent.attr in MUTATORS and resolve_call(scope, grand) is None:
        return parent.attr
    return None


def assigned_name(value, parent):
    if isinstance(parent, ast.Assign) and parent.value is value:
        targets = parent.targets
    elif isinstance(parent, ast.AnnAssign) and parent.value is value:
        targets = [parent.target]
    else:
        return None
    single = len(targets) == 1 and isinstance(targets[0], ast.Name)
    return targets[0].id if single else None


def aliased_mutation(scope, names):
    for name in names:
        bindings = [s for s in scope.sites.get(name, []) if s.kind != "aug"]
        hit = local_mutations(scope).get(name) if len(bindings) == 1 else None
        if hit:
            return hit[1]
    return None


def mutation_of(scope, call, resolution):
    value, parent, names = produced_value(scope, call, resolution)
    if value is None:
        return None
    assigned = assigned_name(value, parent)
    aliases = names + ([assigned] if assigned else [])
    return direct_mutation(scope, value, parent) or aliased_mutation(scope, aliases)
