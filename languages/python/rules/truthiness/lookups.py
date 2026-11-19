import ast
from collections import Counter

from checks.common import finding
from signatures.annotations import (
    NONE_MEMBER,
    members_of,
    parameters_of,
    qualified_name,
    subscript_arguments,
)
from truthiness.fields import is_numeric
from truthiness.numbers import bound_names, in_condition, scope_nodes
from truthiness.sources import bound_once

RULE = "presence-truthiness"
MAPPING_TYPES = {"dict", "Dict", "Mapping", "MutableMapping"}
PARSED_CALLS = {"json", "model_dump", "loads"}
NUMBERS = "the mapping holds numbers, so `0` is a stored value, not a missing one"
PARSED = "parsed data holds `0`, `''` and `False` as real values next to missing keys"
EXITS = (ast.Return, ast.Raise, ast.Continue, ast.Break)


def number_mapping(annotation):
    if not isinstance(annotation, ast.Subscript):
        return False
    wrapper = members_of(annotation)[:1]
    arguments = subscript_arguments(annotation)
    return (
        bool(wrapper)
        and wrapper[0] in MAPPING_TYPES
        and len(arguments) == 2
        and NONE_MEMBER not in members_of(arguments[1])
        and is_numeric(arguments[1])
    )


def is_parsed_call(node):
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in PARSED_CALLS
    )


def annotated_mappings(function, nodes):
    names = {
        argument.arg: 0
        for argument in parameters_of(function)
        if number_mapping(argument.annotation)
    }
    for node in nodes:
        is_local = isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name)
        if is_local and number_mapping(node.annotation):
            names[node.target.id] = 1
    return names


def mapping_names(function, nodes):
    counts = Counter(name for node in nodes for name in bound_names(node))
    numbers = {
        name
        for name, declared in annotated_mappings(function, nodes).items()
        if counts[name] <= declared
    }
    parsed = {
        node.targets[0].id
        for node in nodes
        if isinstance(node, ast.Assign)
        and len(node.targets) == 1
        and isinstance(node.targets[0], ast.Name)
        and counts[node.targets[0].id] == 1
        and is_parsed_call(node.value)
    }
    return numbers, parsed


def lookup_owner(node):
    is_get = (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "get"
        and isinstance(node.func.value, ast.Name)
    )
    plain = is_get and len(node.args) == 1 and not node.keywords
    return node.func.value.id if plain else None


def is_zero(node):
    return (
        isinstance(node, ast.Constant) and node.value == 0 and node.value is not False
    )


def is_numeric_or_none(node):
    return isinstance(node, ast.Constant) and (
        node.value is None
        or (isinstance(node.value, (int, float)) and not isinstance(node.value, bool))
    )


def chain_owner(node, numbers, parsed):
    owners = [lookup_owner(value) for value in node.values[:-1]]
    for index, owner in enumerate(owners):
        later = node.values[index + 1 :]
        if owner in numbers and not all(is_zero(value) for value in later):
            return owner, NUMBERS
        followed = any(lookup_owner(value) in parsed for value in later)
        if owner in parsed and followed and is_numeric_or_none(node.values[-1]):
            return owner, PARSED
    return None, None


def uses(branch, name):
    return any(
        isinstance(node, ast.Name)
        and node.id == name
        and isinstance(node.ctx, ast.Load)
        for node in ast.walk(branch)
    )


def is_stored(statement, name):
    for item in ast.walk(statement):
        if isinstance(item, (ast.Assign, ast.AugAssign, ast.AnnAssign, ast.Return)):
            if item.value is not None and uses(item.value, name):
                return True
    return False


def stores_value(node, name):
    if isinstance(node, ast.IfExp):
        return uses(node.body, name)
    return any(is_stored(item, name) for item in node.body)


def condition_name(test):
    if isinstance(test, ast.NamedExpr):
        return test.target.id, test.value
    if isinstance(test, ast.Name):
        return test.id, None
    return None, None


def lookups_assigned(nodes, numbers):
    once = bound_once(nodes, bound_names)
    return {
        node.targets[0].id: lookup_owner(node.value)
        for node in nodes
        if isinstance(node, ast.Assign)
        and len(node.targets) == 1
        and isinstance(node.targets[0], ast.Name)
        and node.targets[0].id in once
        and lookup_owner(node.value) in numbers
    }


def tested_lookup(node, numbers, assigned):
    name, value = condition_name(node.test)
    if name is None:
        return None
    owner = lookup_owner(value) if value is not None else assigned.get(name)
    used = stores_value(node, name)
    return name if owner in numbers and used else None


def or_chain_finding(node, numbers, parsed, context):
    parent = context.parents.get(id(node))
    is_bool_call = (
        isinstance(parent, ast.Call)
        and isinstance(parent.func, ast.Name)
        and parent.func.id == "bool"
    )
    if in_condition(node, context) or is_bool_call:
        return None
    owner, evidence = chain_owner(node, numbers, parsed)
    return (f"{owner}.get", node, evidence) if owner is not None else None


def condition_finding(node, numbers, assigned):
    tested = tested_lookup(node, numbers, assigned)
    return (tested, node.test, NUMBERS) if tested is not None else None


def node_finding(node, numbers, parsed, assigned, context):
    if isinstance(node, ast.BoolOp) and isinstance(node.op, ast.Or):
        return or_chain_finding(node, numbers, parsed, context)
    if isinstance(node, (ast.If, ast.IfExp)):
        return condition_finding(node, numbers, assigned)
    return None


def lookup_findings(function, context):
    nodes = list(scope_nodes(function))
    numbers, parsed = mapping_names(function, nodes)
    if not (numbers or parsed):
        return []
    assigned = lookups_assigned(nodes, numbers)
    label = qualified_name(function, context)
    reported, found = set(), []
    for node in nodes:
        entry = node_finding(node, numbers, parsed, assigned, context)
        if entry is not None and entry[0] not in reported:
            reported.add(entry[0])
            item = finding(context.path, RULE, f"{label}({entry[0]})", entry[1])
            item["data"] = {"evidence": entry[2]}
            found.append(item)
    return found
