import ast

from checks.common import finding
from signatures.annotations import FUNCTION_TYPES, parameters_of, qualified_name
from signatures.defaults import optional_parameters
from truthiness.fields import field_name, field_owners, is_number

RULE = "number-truthiness"
GUARDED = True
TEST_PARENTS = (ast.If, ast.While, ast.IfExp, ast.Assert)
SCOPES = (*FUNCTION_TYPES, ast.Lambda, ast.ClassDef)
ARITHMETIC = (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow)
NAMED_BINDINGS = (
    *FUNCTION_TYPES,
    ast.ClassDef,
    ast.ExceptHandler,
    ast.MatchAs,
    ast.MatchStar,
)


def scope_nodes(function):
    pending = list(ast.iter_child_nodes(function))
    for node in pending:
        yield node
        if not isinstance(node, SCOPES):
            pending.extend(ast.iter_child_nodes(node))


def is_counter_step(node):
    target = node.targets[0] if len(node.targets) == 1 else None
    value = node.value
    return (
        isinstance(target, ast.Name)
        and isinstance(value, ast.BinOp)
        and isinstance(value.op, ARITHMETIC)
        and any(
            isinstance(side, ast.Name) and side.id == target.id
            for side in (value.left, value.right)
        )
    )


def kept_target(node):
    if isinstance(node, ast.AugAssign):
        return node.target
    if isinstance(node, ast.AnnAssign) and is_number(node.annotation):
        return node.target
    if isinstance(node, ast.Assign) and is_counter_step(node):
        return node.targets[0]
    return None


def bound_names(node):
    if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
        return [node.id]
    if isinstance(node, NAMED_BINDINGS):
        return [node.name] if node.name else []
    if isinstance(node, ast.MatchMapping):
        return [node.rest] if node.rest else []
    if isinstance(node, (ast.Global, ast.Nonlocal)):
        return list(node.names)
    if isinstance(node, (ast.Import, ast.ImportFrom)):
        return [(alias.asname or alias.name).split(".")[0] for alias in node.names]
    return []


def number_names(function, nodes):
    names = {
        argument.arg
        for argument in parameters_of(function)
        if is_number(argument.annotation)
    }
    targets = [kept_target(node) for node in nodes]
    kept = {id(target) for target in targets if target is not None}
    names.update(
        node.target.id
        for node in nodes
        if isinstance(node, ast.AnnAssign)
        and isinstance(node.target, ast.Name)
        and is_number(node.annotation)
    )
    rebound = {
        name for node in nodes if id(node) not in kept for name in bound_names(node)
    }
    return names - rebound, rebound


def is_zero(node):
    return (
        isinstance(node, ast.Constant) and node.value == 0 and node.value is not False
    )


def in_condition(node, context):
    parent = context.parents.get(id(node))
    if isinstance(parent, ast.UnaryOp):
        return isinstance(parent.op, ast.Not)
    if isinstance(parent, TEST_PARENTS):
        return parent.test is node
    if isinstance(parent, ast.comprehension):
        return node in parent.ifs
    if isinstance(parent, ast.BoolOp):
        return in_condition(parent, context)
    return False


def tested_operand(node, parent, context, optional):
    if node is not parent.values[-1]:
        if isinstance(parent.op, ast.Or) and not in_condition(parent, context):
            optional_name = isinstance(node, ast.Name) and node.id in optional
            return not optional_name and not is_zero(parent.values[-1])
        return True
    return in_condition(parent, context)


def is_tested(node, context, optional):
    parent = context.parents.get(id(node))
    if isinstance(parent, ast.BoolOp):
        return tested_operand(node, parent, context, optional)
    return in_condition(node, context)


def subject_of(node, names, owners):
    if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
        return node.id if node.id in names else None
    return field_name(node, owners)


def function_findings(function, context):
    nodes = list(scope_nodes(function))
    names, rebound = number_names(function, nodes)
    parameters = [item for item in parameters_of(function) if item.arg not in rebound]
    owners = field_owners(function, context, parameters)
    optional = optional_parameters(function)
    reported = set()
    found = []
    for node in nodes if names or owners else []:
        subject = subject_of(node, names, owners)
        if (
            subject is not None
            and subject not in reported
            and is_tested(node, context, optional)
        ):
            reported.add(subject)
            label = f"{qualified_name(function, context)}({subject})"
            found.append(finding(context.path, RULE, label, node))
    return found


def check(context):
    return [
        item
        for node in ast.walk(context.tree)
        if isinstance(node, FUNCTION_TYPES)
        for item in function_findings(node, context)
    ]
