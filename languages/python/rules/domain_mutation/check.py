import ast

from checks.common import finding
from signatures.annotations import FUNCTION_TYPES, parameters_of, qualified_name
from signatures.mutation import CONTAINERS, container_parameters
from signatures.mutation import function_findings as parameter_mutation_findings
from signatures.scopes import SELF, position, visible_nodes

RULE = "mutating-method-in-domain"
CLASS_FIRST = {SELF, "cls"}
UNTYPED_MUTATORS = {
    "append",
    "appendleft",
    "extend",
    "extendleft",
    "sort",
    "setdefault",
    "discard",
    "popitem",
}


def untyped_parameters(function, context):
    typed = container_parameters(function, context)
    return {
        argument.arg: None
        for argument in parameters_of(function)
        if argument.annotation is None
        and argument.arg not in typed
        and argument.arg not in CLASS_FIRST
    }


def tracked_parameters(function, context):
    return {
        **container_parameters(function, context),
        **untyped_parameters(function, context),
    }


def mutators_of(kind):
    return UNTYPED_MUTATORS if kind is None else CONTAINERS[kind]


def rebinds(node, name):
    targets = []
    if isinstance(node, ast.Assign):
        targets = node.targets
    elif isinstance(node, (ast.AugAssign, ast.AnnAssign)):
        targets = [node.target]
    return any(isinstance(target, ast.Name) and target.id == name for target in targets)


def is_mutation(node, name, mutators):
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in mutators
        and isinstance(node.func.value, ast.Name)
        and node.func.value.id == name
    )


def parameter_events(function, name, kind):
    nodes = [node for node in visible_nodes(function, name) if hasattr(node, "lineno")]
    mutations = [
        node for node in nodes if is_mutation(node, name, mutators_of(kind))
    ]
    first = min((position(node) for node in mutations), default=None)
    if first is None or any(
        rebinds(node, name) and position(node) < first for node in nodes
    ):
        return []
    return mutations


def function_findings(function, context):
    covered = {item["line"] for item in parameter_mutation_findings(function, context)}
    reported, found = set(), []
    for name, kind in tracked_parameters(function, context).items():
        for node in parameter_events(function, name, kind):
            label = f"{name}.{node.func.attr}"
            if label not in reported and node.lineno not in covered:
                reported.add(label)
                subject = f"{label} ({qualified_name(function, context)})"
                found.append(finding(context.path, RULE, subject, node))
    return found


def check(context):
    if not context.domain:
        return []
    return [
        item
        for node in ast.walk(context.tree)
        if isinstance(node, FUNCTION_TYPES)
        for item in function_findings(node, context)
    ]
