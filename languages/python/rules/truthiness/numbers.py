import ast

from checks.common import finding
from signatures.annotations import (
    FUNCTION_TYPES,
    members_of,
    parameters_of,
    qualified_name,
)
from signatures.defaults import optional_parameters

RULE = "number-truthiness"
GUARDED = True
NUMBER_TYPES = {"int", "float", "complex", "Decimal", "Fraction"}
TEST_PARENTS = (ast.If, ast.While, ast.IfExp, ast.Assert)
SCOPES = (*FUNCTION_TYPES, ast.Lambda, ast.ClassDef)


def is_number(annotation):
    return bool(set(members_of(annotation)) & NUMBER_TYPES)


def scope_nodes(function):
    pending = list(ast.iter_child_nodes(function))
    for node in pending:
        yield node
        if not isinstance(node, SCOPES):
            pending.extend(ast.iter_child_nodes(node))


def keeps_number(node):
    if isinstance(node, ast.AugAssign):
        return True
    return isinstance(node, ast.AnnAssign) and is_number(node.annotation)


def number_names(function, nodes):
    names = {
        argument.arg
        for argument in parameters_of(function)
        if is_number(argument.annotation)
    }
    kept = {id(node.target): node for node in nodes if keeps_number(node)}
    names.update(
        node.target.id
        for node in kept.values()
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name)
    )
    rebound = {
        node.id
        for node in nodes
        if isinstance(node, ast.Name)
        and isinstance(node.ctx, ast.Store)
        and id(node) not in kept
    }
    return names - rebound


def is_zero(node):
    return isinstance(node, ast.Constant) and node.value == 0 and node.value is not False


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
            return node.id not in optional and not is_zero(parent.values[-1])
        return True
    return in_condition(parent, context)


def is_tested(node, context, optional):
    parent = context.parents.get(id(node))
    if isinstance(parent, ast.BoolOp):
        return tested_operand(node, parent, context, optional)
    return in_condition(node, context)


def function_findings(function, context):
    nodes = list(scope_nodes(function))
    names = number_names(function, nodes)
    optional = optional_parameters(function)
    reported = set()
    found = []
    for node in nodes if names else []:
        if (
            isinstance(node, ast.Name)
            and isinstance(node.ctx, ast.Load)
            and node.id in names
            and node.id not in reported
            and is_tested(node, context, optional)
        ):
            reported.add(node.id)
            subject = f"{qualified_name(function, context)}({node.id})"
            found.append(finding(context.path, RULE, subject, node))
    return found


def check(context):
    return [
        item
        for node in ast.walk(context.tree)
        if isinstance(node, FUNCTION_TYPES)
        for item in function_findings(node, context)
    ]
