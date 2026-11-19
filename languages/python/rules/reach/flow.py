import ast

from signatures.annotations import FUNCTION_TYPES
from signatures.copies import COPY_CONSTRUCTORS

ROOT = "root"
REACHED = "reached"
PARAM = "param"
ALIAS = "alias"
SHALLOW = "shallow"
HOLDER_NODES = (ast.Dict, ast.List, ast.Set, ast.Tuple)
SKIPPED_SCOPES = (*FUNCTION_TYPES, ast.Lambda, ast.ClassDef)
ITEM_READS = {"get"}
ITEM_VIEWS = {"values", "items"}


class State:
    def __init__(self, parameters, nested=()):
        self.names = dict.fromkeys(parameters, PARAM)
        self.nested = set(nested)
        self.held = {}

    def forget(self, name):
        self.names.pop(name, None)
        self.held.pop(name, None)


def constant_key(node):
    return node.value if isinstance(node, ast.Constant) else None


def level(node, state):
    if isinstance(node, ast.Name):
        found = state.names.get(node.id)
        return REACHED if found == ALIAS else ROOT if found else None
    if isinstance(node, ast.Attribute):
        return REACHED if level(node.value, state) else None
    if isinstance(node, ast.Subscript):
        return subscript_level(node, state)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        read = node.func.attr in ITEM_READS and level(node.func.value, state)
        return REACHED if read else None
    return None


def subscript_level(node, state):
    if isinstance(node.slice, ast.Slice):
        return None
    if isinstance(node.value, ast.Name) and node.value.id in state.held:
        keys = state.held[node.value.id]
        return REACHED if None in keys or constant_key(node.slice) in keys else None
    return REACHED if level(node.value, state) else None


def copy_source(call, state, context_copy):
    func = call.func
    if isinstance(func, ast.Name) and func.id in COPY_CONSTRUCTORS and call.args:
        return call.args[0]
    if isinstance(func, ast.Attribute) and func.attr in {"copy", "__copy__"}:
        return func.value
    if context_copy(func) == "copy.copy" and call.args:
        return call.args[0]
    return None


def spread_sources(node):
    if isinstance(node, ast.Dict):
        return [value for key, value in zip(node.keys, node.values) if key is None]
    if isinstance(node, (ast.List, ast.Set, ast.Tuple)):
        return [item.value for item in node.elts if isinstance(item, ast.Starred)]
    return []


def classify(value, state, context_copy):
    if isinstance(value, ast.Call):
        source = copy_source(value, state, context_copy)
        if source is not None:
            return SHALLOW if level(source, state) else None
    if isinstance(value, ast.Subscript) and isinstance(value.slice, ast.Slice):
        return SHALLOW if level(value.value, state) else None
    if any(level(source, state) for source in spread_sources(value)):
        return SHALLOW
    found = level(value, state)
    if found == REACHED:
        return ALIAS
    if found == ROOT and isinstance(value, ast.Name):
        return state.names[value.id]
    return None


def held_keys(value, state):
    if isinstance(value, ast.Dict):
        pairs = [
            (constant_key(key), item) for key, item in zip(value.keys, value.values)
        ]
    elif isinstance(value, HOLDER_NODES):
        pairs = [(None, item) for item in value.elts]
    else:
        return set()
    return {key for key, item in pairs if level(item, state)}


def bind(name, value, state, context_copy):
    kind = classify(value, state, context_copy)
    keys = held_keys(value, state)
    state.forget(name)
    if kind:
        state.names[name] = kind
    elif keys:
        state.names[name] = SHALLOW
        state.held[name] = keys


def store_into(target, value, state):
    if (
        isinstance(target, ast.Subscript)
        and isinstance(target.value, ast.Name)
        and level(value, state)
    ):
        state.held.setdefault(target.value.id, set()).add(constant_key(target.slice))


def yields_containers(iterable, state):
    return isinstance(iterable, ast.Name) and iterable.id in state.nested


def loop_targets(target, iterable, state):
    view = None
    if isinstance(iterable, ast.Call) and isinstance(iterable.func, ast.Attribute):
        view = iterable.func.attr if iterable.func.attr in ITEM_VIEWS else None
        iterable = iterable.func.value if view else iterable
    elif (
        isinstance(iterable, ast.Call)
        and getattr(iterable.func, "id", "") == "enumerate"
    ):
        view = "items"
        iterable = iterable.args[0] if iterable.args else iterable
    names = [item for item in ast.walk(target) if isinstance(item, ast.Name)]
    for name in names:
        state.forget(name.id)
    found = level(iterable, state)
    if not found or (found == ROOT and not yields_containers(iterable, state)):
        return
    if view == "items" and isinstance(target, ast.Tuple) and len(target.elts) == 2:
        names = [target.elts[1]] if isinstance(target.elts[1], ast.Name) else []
    elif view == "items" or not isinstance(target, ast.Name):
        names = []
    for name in names:
        state.names[name.id] = ALIAS


def walk_scope(function):
    pending, found = list(function.body), []
    while pending:
        node = pending.pop()
        found.append(node)
        pending.extend(
            child
            for child in ast.iter_child_nodes(node)
            if not isinstance(child, SKIPPED_SCOPES)
        )
    return sorted(
        found,
        key=lambda node: (getattr(node, "lineno", 0), getattr(node, "col_offset", 0)),
    )
