import ast

from checks.common import finding, own_nodes, root_name
from external_asserts.nullable import (
    annotated_model,
    instance_model,
    nullable_index,
)
from external_asserts.sources import client_source, read_source, unwrapped

RULE = "assert-on-external-state"
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


def asserted(test):
    if (
        isinstance(test, ast.Compare)
        and len(test.ops) == 1
        and isinstance(test.ops[0], ast.IsNot)
        and isinstance(test.comparators[0], ast.Constant)
        and test.comparators[0].value is None
    ):
        return test.left
    return test


def bindings(function):
    found = {}
    for node in own_nodes(function):
        targets = []
        if isinstance(node, ast.Assign):
            targets = [(target, node.value) for target in node.targets]
        elif isinstance(node, (ast.AnnAssign, ast.AugAssign, ast.NamedExpr)):
            targets = [(node.target, getattr(node, "value", None))]
        elif isinstance(node, (ast.For, ast.AsyncFor)):
            targets = [(node.target, None)]
        elif isinstance(node, ast.withitem) and node.optional_vars is not None:
            targets = [(node.optional_vars, None)]
        for target, value in targets:
            for name in ast.walk(target):
                if isinstance(name, ast.Name):
                    found.setdefault(name.id, []).append((node, value))
    return found


def single_source(name, assertion, found):
    entries = found.get(name, [])
    if len(entries) != 1:
        return None
    node, value = entries[0]
    if not isinstance(node, ast.Assign) or node.lineno >= assertion.lineno:
        return None
    return value


def name_source(name, assertion, function, found):
    value = single_source(name, assertion, found)
    return read_source(value, function) if value is not None else None


def attribute_source(target, assertion, function, context, found):
    owner, attribute = target.value.id, target.attr
    index = nullable_index(context.project)
    value = single_source(owner, assertion, found)
    model = instance_model(value, index) if value is not None else None
    if model is None and owner not in found:
        model = annotated_model(function, owner, index)
    if model is not None and attribute in index[model]:
        return f"{model}.{attribute}"
    if value is not None:
        return client_source(value, context.aliases)
    return None


def source_of(target, assertion, function, context, found):
    if isinstance(target, ast.Name):
        return name_source(target.id, assertion, function, found)
    if isinstance(target, ast.Attribute) and isinstance(target.value, ast.Name):
        return attribute_source(target, assertion, function, context, found)
    if isinstance(target, ast.Call):
        return read_source(target, function)
    return None


def has_guard(function, assertion, target):
    name = root_name(target, True)
    for node in own_nodes(function):
        if (
            isinstance(node, ast.If)
            and node.lineno < assertion.lineno
            and name is not None
            and name in ast.unparse(node.test)
            and isinstance(node.body[-1], (ast.Raise, ast.Return, ast.Continue))
        ):
            return True
    return False


def assertion_findings(context, function):
    found = bindings(function)
    results = []
    for node in own_nodes(function):
        if not isinstance(node, ast.Assert):
            continue
        target = unwrapped(asserted(node.test))
        source = source_of(target, node, function, context, found)
        if source is not None and not has_guard(function, node, target):
            subject = f"{ast.unparse(target)}|{source}"
            results.append(finding(context.path, RULE, subject, node))
    return results


def check(context):
    if context.tests:
        return []
    return [
        item
        for function in ast.walk(context.tree)
        if isinstance(function, FUNCTIONS)
        for item in assertion_findings(context, function)
    ]
