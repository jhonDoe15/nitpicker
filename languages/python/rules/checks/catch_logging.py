import ast

LOG_METHODS = {"warning", "warn", "error", "critical"}
LOGGER_FACTORIES = {
    "logging.getLogger",
    "structlog.get_logger",
    "structlog.getLogger",
    "structlog.stdlib.get_logger",
    "structlog.stdlib.getLogger",
}
LOGGER_MODULES = ("logging", "structlog", "loguru")
LOGGER_NAMES = {"logger", "log", "logging", "_logger", "_log"}
DERIVING_CALLS = {"bind", "opt", "new", "unbind", "patch", "contextualize"}


def logger_names(tree, dotted_name, aliases):
    names = set()
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Assign)
            and isinstance(node.value, ast.Call)
            and dotted_name(node.value.func, aliases) in LOGGER_FACTORIES
        ):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    names.add(target.id)
                elif isinstance(target, ast.Attribute):
                    names.add(target.attr)
    return names


def is_logger_name(name):
    lowered = name.lower()
    return lowered in LOGGER_NAMES or lowered.endswith(("_logger", "logger"))


class CatchLogging:
    def __init__(self, tree, aliases, dotted_name):
        self.aliases = aliases
        self.dotted_name = dotted_name
        self.names = logger_names(tree, dotted_name, aliases)

    def is_logger(self, node):
        if isinstance(node, ast.Call):
            if (
                isinstance(node.func, ast.Attribute)
                and node.func.attr in DERIVING_CALLS
            ):
                return self.is_logger(node.func.value)
            resolved = self.dotted_name(node.func, self.aliases) or ""
            return resolved in LOGGER_FACTORIES or resolved.startswith(
                ("structlog.", "loguru.")
            )
        if isinstance(node, ast.Attribute):
            return node.attr in self.names or is_logger_name(node.attr)
        if isinstance(node, ast.Name):
            resolved = self.dotted_name(node, self.aliases) or node.id
            return (
                node.id in self.names
                or is_logger_name(node.id)
                or resolved.split(".")[0] in LOGGER_MODULES
            )
        return False

    def log_call(self, call):
        func = call.func
        return (
            isinstance(func, ast.Attribute)
            and func.attr in LOG_METHODS
            and self.is_logger(func.value)
        )


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


def own_nodes(statements, enter_handlers=True):
    pending = list(statements)
    while pending:
        node = pending.pop()
        yield node
        if enter_handlers or not isinstance(node, ast.ExceptHandler):
            pending.extend(ast.iter_child_nodes(node))


def is_name(node, name):
    return isinstance(node, ast.Name) and node.id == name


def reraises(handler):
    name = handler.name
    if any(
        isinstance(node, ast.Raise) and node.exc is None
        for node in own_nodes(handler.body, enter_handlers=False)
    ):
        return True
    return any(
        isinstance(node, ast.Raise)
        and (is_name(node.exc, name) or is_name(node.cause, name))
        for node in own_nodes(handler.body)
    )


def names_in(node):
    return {child.id for child in ast.walk(node) if isinstance(child, ast.Name)}


def derived_names(handler):
    known = {handler.name}
    nodes = [node for node in own_nodes(handler.body) if isinstance(node, ast.Assign)]
    for node in sorted(nodes, key=lambda item: item.lineno):
        if names_in(node.value) & known:
            known.update(
                target.id for target in node.targets if isinstance(target, ast.Name)
            )
    return known


def uncaught_calls(handler, checker):
    if handler.name is None or reraises(handler):
        return []
    known = derived_names(handler)
    return [
        node
        for node in own_nodes(handler.body)
        if isinstance(node, ast.Call)
        and checker.log_call(node)
        and not carries_exception(node)
        and names_in(node) & known
    ]
