import ast

from checks.common import call_name, finding
from leaks.shared_sites import site_functions

RULE = "shared-test-state"
MUTABLE_CALLS = {
    "list",
    "dict",
    "set",
    "bytearray",
    "collections.defaultdict",
    "collections.OrderedDict",
    "collections.Counter",
    "collections.deque",
}
MUTATORS = {
    "append",
    "extend",
    "insert",
    "remove",
    "pop",
    "clear",
    "update",
    "add",
    "discard",
    "setdefault",
    "popitem",
    "sort",
    "reverse",
    "appendleft",
    "extendleft",
    "popleft",
    "rotate",
    "difference_update",
    "intersection_update",
    "symmetric_difference_update",
}
MUTABLE_NODES = (ast.List, ast.Dict, ast.Set, ast.ListComp, ast.DictComp, ast.SetComp)


def is_mutable(value, aliases):
    if isinstance(value, MUTABLE_NODES):
        return True
    return isinstance(value, ast.Call) and call_name(value, aliases) in MUTABLE_CALLS


def bindings(body):
    for statement in body:
        if isinstance(statement, ast.Assign):
            targets, value = statement.targets, statement.value
        elif isinstance(statement, ast.AnnAssign) and statement.value is not None:
            targets, value = [statement.target], statement.value
        else:
            continue
        for target in targets:
            if isinstance(target, ast.Name):
                yield target.id, value


def global_names(function):
    return {name for node in ast.walk(function) if isinstance(node, ast.Global) for name in node.names}


def local_names(function):
    arguments = function.args
    names = {item.arg for item in arguments.posonlyargs + arguments.args + arguments.kwonlyargs}
    for extra in (arguments.vararg, arguments.kwarg):
        if extra is not None:
            names.add(extra.arg)
    for node in ast.walk(function):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            names.add(node.id)
    return names - global_names(function)


def holder_of(node, locals_, owner):
    if isinstance(node, ast.Name):
        return None if node.id in locals_ else ("module", node.id, False)
    if not isinstance(node, ast.Attribute) or owner is None:
        return None
    base = node.value
    if isinstance(base, ast.Name) and base.id == "self":
        return ("class", node.attr, True)
    if isinstance(base, ast.Name) and base.id in (owner.name, "cls"):
        return ("class", node.attr, False)
    if isinstance(base, ast.Call) and isinstance(base.func, ast.Name) and base.func.id == "type":
        return ("class", node.attr, False)
    if isinstance(base, ast.Attribute) and base.attr == "__class__":
        return ("class", node.attr, False)
    return None


def whole_slice(target):
    part = target.slice
    return isinstance(part, ast.Slice) and part.lower is None and part.upper is None and part.step is None


def target_writes(node, locals_, owner):
    targets = node.targets if hasattr(node, "targets") else [node.target]
    for target in targets:
        if isinstance(target, ast.Subscript):
            holder = holder_of(target.value, locals_, owner)
            kind = "replace" if whole_slice(target) else "element"
        else:
            holder = holder_of(target, locals_, owner)
            kind = "augment" if isinstance(node, ast.AugAssign) else "bind"
        if holder is not None:
            yield holder, kind, node


def writes_in(function, owner):
    locals_ = local_names(function)
    for node in ast.walk(function):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            holder = holder_of(node.func.value, locals_, owner)
            if holder is not None and node.func.attr in MUTATORS:
                kind = "reset" if node.func.attr == "clear" else "call"
                yield holder, kind, node
        elif isinstance(node, (ast.Assign, ast.AugAssign, ast.Delete)):
            yield from target_writes(node, locals_, owner)


def shared_kind(state, owner, holder, kind):
    scope, name, through_self = holder
    if scope == "module":
        if kind in ("bind", "augment"):
            return name in state["globals"]
        return name in state["module"]
    attrs = class_state(owner, state["aliases"])
    if kind == "bind" or (kind == "augment" and not through_self):
        return not through_self and name in attrs["any"]
    return name in attrs["mutable"]


def class_state(owner, aliases):
    pairs = list(bindings(owner.body))
    return {
        "any": {name for name, _ in pairs},
        "mutable": {name for name, value in pairs if is_mutable(value, aliases)},
    }


def module_state(context):
    tree = context.tree
    return {
        "aliases": context.aliases,
        "module": {name for name, value in bindings(tree.body) if is_mutable(value, context.aliases)},
        "globals": {name for node in ast.walk(tree) if isinstance(node, ast.Global) for name in node.names},
    }


def key_of(holder, owner):
    return holder[1] if holder[0] == "module" else f"{owner.name}.{holder[1]}"


def site_writes(sites):
    for owner, function in sites:
        for holder, kind, node in writes_in(function, owner):
            yield owner, holder, kind, node


def check(context):
    if not context.tests:
        return []
    sites = site_functions(context)
    state = module_state(context)
    reset = {
        key_of(holder, owner)
        for owner, holder, kind, _ in site_writes(sites["resets"])
        if kind in ("reset", "replace", "bind")
    }
    found = [
        finding(context.path, RULE, key_of(holder, owner), node)
        for owner, holder, kind, node in site_writes(sites["writes"])
        if shared_kind(state, owner, holder, kind) and key_of(holder, owner) not in reset
    ]
    return sorted(found, key=lambda item: (item["line"], item["subject"]))
