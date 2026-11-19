import ast

from iterators.reads import direct_reads, exclusive, repeats
from iterators.sources import is_one_shot
from checks.common import finding, last_name
from index.scopes import enclosing_function
from reach.flow import walk_scope
from signatures.annotations import FUNCTION_TYPES, members_of, parameters_of, qualified_name
from signatures.scopes import key_of

RULE = "iterator-read-twice"
ITERATOR_ANNOTATIONS = {"Iterable", "Iterator", "Generator"}
SAVE_METHODS = {"save", "asave"}
UPDATE_FIELDS = "update_fields"


def stores_of(nodes, key):
    return [
        node
        for node in nodes
        if key_of(node) == key and isinstance(getattr(node, "ctx", None), ast.Store)
    ]


def bound_value(assign):
    return assign.value if isinstance(assign, ast.Assign) and len(assign.targets) == 1 else None


def single_binding(nodes, key):
    stores = stores_of(nodes, key)
    if len(stores) != 1:
        return None
    return next(
        (
            node
            for node in nodes
            if isinstance(node, ast.Assign) and any(target is stores[0] for target in node.targets)
        ),
        None,
    )


def local_candidates(nodes, context):
    found = {}
    for node in nodes:
        value = bound_value(node)
        key = key_of(node.targets[0]) if value is not None else None
        if key and is_one_shot(value, context) and single_binding(nodes, key) is node:
            found[key] = node
    return found


def is_kwargs_read(value):
    func = value.func if isinstance(value, ast.Call) else None
    if isinstance(func, ast.Attribute) and func.attr == "get":
        value = func.value
    elif isinstance(value, ast.Subscript):
        value = value.value
    else:
        return False
    return isinstance(value, ast.Name) and value.id == "kwargs"


def save_candidates(function, nodes):
    if function.name not in SAVE_METHODS:
        return {}
    found = {}
    for node in nodes:
        value = bound_value(node)
        key = key_of(node.targets[0]) if value is not None else None
        if key == UPDATE_FIELDS and is_kwargs_read(value) and single_binding(nodes, key) is node:
            found[key] = node
    names = {argument.arg for argument in parameters_of(function)}
    if UPDATE_FIELDS in names and not stores_of(nodes, UPDATE_FIELDS):
        found[UPDATE_FIELDS] = function
    return found


def parameter_candidates(function, nodes):
    return {
        argument.arg: function
        for argument in parameters_of(function)
        if ITERATOR_ANNOTATIONS & set(members_of(argument.annotation))
        and not stores_of(nodes, argument.arg)
    }


def forwards(nodes, key, function):
    found = []
    for node in nodes:
        if not isinstance(node, ast.Call):
            continue
        values = [*node.args, *[item.value for item in node.keywords if item.arg]]
        found.extend(
            value
            for value in values
            if key_of(value) == key or key_of(getattr(value, "value", None)) == key
        )
        if function.name in SAVE_METHODS and any(item.arg is None for item in node.keywords):
            found.append(node)
    return found


def repeated(reads, binding, context):
    return any(repeats(read, binding, context) for read in reads)


def pair_after(first, others, context):
    return next(
        (
            other
            for other in others
            if (other.lineno, other.col_offset) > (first.lineno, first.col_offset)
            and not exclusive(first, other, context)
        ),
        None,
    )


def second_read(reads, binding, context):
    for index, read in enumerate(reads):
        later = pair_after(read, reads[index + 1 :], context)
        if later is not None:
            return later
        if repeats(read, binding, context):
            return read
    return None


def forwarded_read(reads, extra, context):
    for read in reads:
        later = pair_after(read, [item for item in [*reads, *extra] if item is not read], context)
        if later is not None:
            return later
    return None


ITERATING_CALLS = {"list", "set", "tuple", "sorted", "frozenset"}


def iterates(read, context):
    parent = context.parents.get(id(read))
    if isinstance(parent, (ast.For, ast.AsyncFor, ast.comprehension)):
        return parent.iter is read
    return isinstance(parent, ast.Call) and last_name(parent.func) in ITERATING_CALLS


def continues_iter(read, binding, context):
    parent = context.parents.get(id(read))
    value = binding.value if isinstance(binding, ast.Assign) else None
    named = isinstance(value, ast.Call) and last_name(value.func) == "iter"
    loop = isinstance(parent, (ast.For, ast.AsyncFor)) and parent.iter is read
    return named and loop and any(isinstance(item, ast.Break) for item in ast.walk(parent))


def function_findings(function, context):
    nodes = walk_scope(function)
    owner = qualified_name(function, context)

    def subject_of(key):
        return f"{key} ({owner})"

    found = []
    for key, binding in local_candidates(nodes, context).items():
        reads = direct_reads(nodes, key, context)
        reads = [read for read in reads if not continues_iter(read, binding, context)]
        node = second_read(reads, binding, context)
        if node is not None:
            found.append(finding(context.path, RULE, subject_of(key), node))
    inputs = {**parameter_candidates(function, nodes), **save_candidates(function, nodes)}
    for key in inputs:
        reads = direct_reads(nodes, key, context)
        if key == UPDATE_FIELDS and function.name in SAVE_METHODS:
            reads = [read for read in reads if iterates(read, context)]
        node = forwarded_read(reads, forwards(nodes, key, function), context)
        if node is not None:
            found.append(finding(context.path, RULE, subject_of(key), node))
    return found


def check(context):
    if context.tests:
        return []
    return [
        item
        for node in ast.walk(context.tree)
        if isinstance(node, FUNCTION_TYPES) and enclosing_function(node, context.parents) is None
        for item in function_findings(node, context)
    ]
