import ast

from checks.common import dotted_name, finding
from handler_gaps.table import entry_of, known_class

RULE = "except-misses-raised-exception"
SUPPRESS_NAMES = {"suppress", "contextlib.suppress"}


def assigned_names(tree):
    return {
        target.id
        for statement in tree.body
        if isinstance(statement, ast.Assign)
        for target in statement.targets
        if isinstance(target, ast.Name)
    }


def type_nodes(expression):
    if expression is None:
        return []
    if isinstance(expression, ast.Tuple):
        return list(expression.elts)
    return [expression]


def only_reraises(handler):
    return (
        len(handler.body) == 1
        and isinstance(handler.body[0], ast.Raise)
        and handler.body[0].exc is None
    )


def caught_classes(nodes, aliases):
    classes = []
    for node in nodes:
        dotted = dotted_name(node, aliases)
        found = known_class(dotted) if dotted else None
        if found is not None:
            classes.append(found)
    return classes


def calls_of(statements):
    pending = list(statements)
    while pending:
        node = pending.pop()
        if isinstance(node, ast.Call):
            yield node
        if not isinstance(
            node, (ast.Try, ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)
        ):
            pending.extend(ast.iter_child_nodes(node))


def missing_names(entry, caught):
    must, family = entry
    families = [known_class(name) for name in family]
    related = any(issubclass(item, tuple(families)) for item in caught)
    absent = [
        name
        for name in must
        if not any(issubclass(known_class(name), item) for item in caught)
    ]
    return absent if related else []


def check_body(context, statements, nodes):
    aliases = context.aliases
    caught = caught_classes(nodes, aliases)
    found = []
    for call in calls_of(statements):
        dotted = dotted_name(call.func, aliases)
        entry = entry_of(call, dotted)
        missing = missing_names(entry, caught) if entry else []
        if missing:
            shown = dotted or ast.unparse(call.func)
            subject = f"{shown}() misses {', '.join(missing)}"
            found.append(finding(context.path, RULE, subject, call))
    return found


def try_findings(context, node, module_names):
    nodes = [item for handler in node.handlers for item in type_nodes(handler.type)]
    unresolved = any(
        isinstance(name, ast.Name) and name.id in module_names
        for item in nodes
        for name in ast.walk(item)
    )
    if unresolved or any(handler.type is None for handler in node.handlers):
        return []
    if all(only_reraises(handler) for handler in node.handlers):
        return []
    return check_body(context, node.body, nodes)


def suppress_nodes(item, aliases):
    call = item.context_expr
    if isinstance(call, ast.Call) and dotted_name(call.func, aliases) in SUPPRESS_NAMES:
        return list(call.args)
    return None


def check(context):
    if context.tests:
        return []
    module_names = assigned_names(context.tree)
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, ast.Try) and node.handlers:
            found.extend(try_findings(context, node, module_names))
        elif isinstance(node, (ast.With, ast.AsyncWith)):
            for item in node.items:
                nodes = suppress_nodes(item, context.aliases)
                if nodes:
                    found.extend(check_body(context, node.body, nodes))
    return found
