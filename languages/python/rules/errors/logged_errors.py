import ast

from checks.common import finding, is_log_owner, last_name, type_text

RULE = "catch-log-without-exception"
ERROR_METHODS = {"warning", "warn", "error", "critical"}
DERIVING_CALLS = {"bind", "opt", "new", "unbind", "patch", "contextualize"}


def is_error_log(call, aliases):
    func = call.func
    if not isinstance(func, ast.Attribute) or func.attr not in ERROR_METHODS:
        return False
    owner = func.value
    while (
        isinstance(owner, ast.Call)
        and isinstance(owner.func, ast.Attribute)
        and owner.func.attr in DERIVING_CALLS
    ):
        owner = owner.func.value
    return is_log_owner(owner, aliases)


def is_disabled(value):
    return isinstance(value, ast.Constant) and value.value in (False, None)


def has_exception_keyword(call, keyword_name):
    return any(
        keyword.arg == keyword_name and not is_disabled(keyword.value)
        for keyword in call.keywords
    )


def carries_exception(call):
    node = call.func
    if node.attr == "exception" or has_exception_keyword(call, "exc_info"):
        return True
    while isinstance(node, (ast.Attribute, ast.Call)):
        if isinstance(node, ast.Call):
            if has_exception_keyword(node, "exception"):
                return True
            node = node.func
        else:
            node = node.value
    return False


def handler_nodes(statements, enter_handlers=True):
    pending = list(statements)
    while pending:
        node = pending.pop()
        yield node
        if enter_handlers or not isinstance(node, ast.ExceptHandler):
            pending.extend(ast.iter_child_nodes(node))


def is_name(node, name):
    return isinstance(node, ast.Name) and node.id == name


def reraises(handler):
    if any(
        isinstance(node, ast.Raise) and node.exc is None
        for node in handler_nodes(handler.body, enter_handlers=False)
    ):
        return True
    return any(
        isinstance(node, ast.Raise)
        and (is_name(node.exc, handler.name) or is_name(node.cause, handler.name))
        for node in handler_nodes(handler.body)
    )


def names_in(node):
    return {child.id for child in ast.walk(node) if isinstance(child, ast.Name)}


def derived_names(handler):
    known = {handler.name}
    assignments = [
        node for node in handler_nodes(handler.body) if isinstance(node, ast.Assign)
    ]
    for node in sorted(assignments, key=lambda item: item.lineno):
        if names_in(node.value) & known:
            known.update(
                target.id for target in node.targets if isinstance(target, ast.Name)
            )
    return known


def uncaught_calls(handler, aliases):
    if handler.name is None or reraises(handler):
        return []
    known = derived_names(handler)
    return [
        node
        for node in handler_nodes(handler.body)
        if isinstance(node, ast.Call)
        and is_error_log(node, aliases)
        and not carries_exception(node)
        and names_in(node) & known
    ]


def subject_of(call):
    receiver = call.func.value
    owner = type_text(receiver) if last_name(receiver) else "logger"
    return f"{owner}.{call.func.attr}(...)"


def logged_findings(handler, context, reported):
    found = []
    for call in uncaught_calls(handler, context.aliases):
        if id(call) not in reported:
            reported.add(id(call))
            found.append(finding(context.path, RULE, subject_of(call), call))
    return found
