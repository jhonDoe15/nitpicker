import ast
import re

from checks.common import dotted_name
from containers.scope import store_targets
from leaks.shared_state import flat_targets
from signatures.annotations import members_of, parameters_of
from reach.flow import (
    ALIAS,
    REACHED,
    State,
    bind,
    level,
    loop_targets,
    store_into,
    walk_scope,
)

DERIVED_MUTATORS = {
    "append",
    "extend",
    "insert",
    "setdefault",
    "popitem",
    "pop",
    "sort",
    "reverse",
    "update",
}
READ_ONLY_TYPES = {
    "str",
    "int",
    "float",
    "bool",
    "bytes",
    "complex",
    "Path",
    "PurePath",
    "tuple",
    "Tuple",
    "frozenset",
    "FrozenSet",
    "Sequence",
    "Mapping",
    "Iterable",
    "Iterator",
    "Collection",
    "Callable",
    "type",
    "Type",
    "Literal",
}
RECEIVERS = {"self", "cls"}
CONTAINER_WORDS = re.compile(r"\b(dict|list|set|Dict|List|Set|MutableMapping|MutableSequence)\b")


def label_of(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        base = label_of(node.value)
        return base and f"{base}.{node.attr}"
    if isinstance(node, ast.Subscript):
        base = label_of(node.value)
        return base and f"{base}[...]"
    if isinstance(node, ast.Call):
        base = label_of(node.func)
        return base and f"{base}()"
    return None


def holds_containers(annotation):
    return annotation is not None and len(CONTAINER_WORDS.findall(ast.unparse(annotation))) >= 2


def eligible_parameters(function):
    names = []
    for argument in parameters_of(function):
        members = set(members_of(argument.annotation))
        if argument.arg in RECEIVERS or (members and members <= READ_ONLY_TYPES):
            continue
        names.append(argument)
    return names


def is_mutating_call(node):
    func = node.func
    if not isinstance(func, ast.Attribute) or func.attr not in DERIVED_MUTATORS:
        return False
    return func.attr != "update" or bool(node.args)


def is_anchored(node, state):
    while isinstance(node, (ast.Attribute, ast.Subscript)):
        if isinstance(node, ast.Subscript):
            return True
        node = node.value
    return isinstance(node, ast.Name) and state.names.get(node.id) == ALIAS


def reaches(node, state):
    return level(node, state) == REACHED and is_anchored(node, state)


def mutation_labels(node, state):
    if isinstance(node, ast.Call) and is_mutating_call(node):
        if reaches(node.func.value, state):
            base = label_of(node.func.value)
            return [f"{base}.{node.func.attr}"] if base else []
    return [
        label_of(target)
        for target in flat_targets(store_targets(node))
        if isinstance(target, ast.Subscript) and reaches(target.value, state) and label_of(target)
    ]


def rebind(node, state, context):
    def copy_name(func):
        return dotted_name(func, context.aliases)

    if isinstance(node, ast.Assign):
        for target in node.targets:
            if isinstance(target, ast.Name):
                bind(target.id, node.value, state, copy_name)
            else:
                store_into(target, node.value, state)
                for name in ast.walk(target):
                    if isinstance(name, ast.Name) and isinstance(target, (ast.Tuple, ast.List)):
                        state.forget(name.id)
    elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.value:
        bind(node.target.id, node.value, state, copy_name)
    elif isinstance(node, ast.AugAssign) and isinstance(node.target, ast.Name):
        state.forget(node.target.id)
    elif isinstance(node, (ast.For, ast.AsyncFor)):
        loop_targets(node.target, node.iter, state)
    elif isinstance(node, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
        for generator in node.generators:
            loop_targets(generator.target, generator.iter, state)


def derived_events(function, context):
    parameters = eligible_parameters(function)
    nested = [item.arg for item in parameters if holds_containers(item.annotation)]
    state = State([item.arg for item in parameters], nested)
    events = []
    for node in walk_scope(function):
        rebind(node, state, context)
        events.extend((label, node) for label in mutation_labels(node, state))
    return events
