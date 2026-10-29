import ast

from checks.common import (
    LOGGER_MODULES,
    finding,
    imported_module,
    type_checking_nodes,
)
from checks.state import mutated_state, mutations_of
from effects.resolve import Caller, class_at, follow, production_definitions
from index.scopes import FUNCTIONS, enclosing_function, enclosing_owner
from index.tables import tables_of

RULE = "logger-in-domain and module-state-in-domain"
GUARDED = True
LOGGER_FILES = {"log", "logger", "logging"}
LOGGER_FOLDERS = {"logger", "logging"}
CONSTRUCTION = {"__init__", "__post_init__", "__new__", "__set_name__"}


def is_logger_module(project, dotted):
    parts = dotted.split(".")
    if parts[0] in LOGGER_MODULES:
        return True
    if project.module_path(dotted) is None:
        return False
    return parts[-1] in LOGGER_FILES or bool(LOGGER_FOLDERS.intersection(parts[:-1]))


def relative_base(node, context):
    package = context.project.module_name(context.path).split(".")[: -node.level]
    named = node.module.split(".") if node.module else []
    return ".".join([*package, *named]) or None


def imported_names(node, context):
    if isinstance(node, ast.Import):
        return [alias.name for alias in node.names]
    if not isinstance(node, ast.ImportFrom):
        return []
    module = imported_module(node, context.project, context.path)
    module = module or (relative_base(node, context) if node.level else None)
    if module is None:
        return []
    return [module, *(f"{module}.{alias.name}" for alias in node.names)]


def logger_findings(context, skipped):
    found = []
    for node in ast.walk(context.tree):
        names = [] if id(node) in skipped else imported_names(node, context)
        match = next((n for n in names if is_logger_module(context.project, n)), None)
        if match is not None:
            found.append(finding(context.path, "logger-in-domain", match, node))
    return found


def root_name(node):
    while isinstance(node, (ast.Attribute, ast.Subscript)):
        node = node.value
    return node.id if isinstance(node, ast.Name) else None


def mutates_self(class_node):
    methods = [
        item
        for item in class_node.body
        if isinstance(item, FUNCTIONS) and item.name not in CONSTRUCTION
    ]
    return any(
        root_name(expression) == "self"
        for method in methods
        for node in ast.walk(method)
        for expression, _kind in mutations_of(node, {})
    )


def mutable_instance(project, path, name):
    statement = tables_of(project, path)[1].get(name)
    value = getattr(statement, "value", None)
    if not isinstance(value, ast.Call):
        return False
    defined = production_definitions(project)
    caller = Caller(project.contexts[path])
    return any(
        mutates_self(defined[key[0]][key[1]])
        for key in caller.resolve(value.func, class_at)
    )


def state_at(project, located):
    path, rest = located
    origin = (path, rest[0])
    if origin in mutated_state(project) or mutable_instance(project, *origin):
        return origin
    return None


class StateReferences:
    def __init__(self, context):
        self.context = context
        self.callers = {}

    def caller(self, node):
        function = enclosing_function(node, self.context.parents)
        if id(function) not in self.callers:
            owner = enclosing_owner(function, self.context.parents)
            self.callers[id(function)] = Caller(self.context, function, owner)
        return self.callers[id(function)]

    def origins(self, node):
        project = self.context.project
        if isinstance(node, ast.ImportFrom):
            names = imported_names(node, self.context)[1:]
            return [
                key for dotted in names for key in follow(project, dotted, state_at)
            ]
        if isinstance(node, ast.Attribute) and isinstance(node.ctx, ast.Load):
            return self.caller(node).resolve(node, state_at)
        return []


def is_reference(node):
    return isinstance(node, ast.ImportFrom) or (
        isinstance(node, ast.Attribute) and isinstance(node.ctx, ast.Load)
    )


def state_findings(context, skipped):
    references = StateReferences(context)
    nodes = sorted(
        (n for n in ast.walk(context.tree) if is_reference(n) and id(n) not in skipped),
        key=lambda node: (node.lineno, node.col_offset),
    )
    origins = [(origin, node) for node in nodes for origin in references.origins(node)]
    seen, found = set(), []
    for origin, node in origins:
        if origin is None or origin in seen or origin[0] == context.path:
            continue
        seen.add(origin)
        subject = f"{context.project.module_name(origin[0])}.{origin[1]}"
        found.append(finding(context.path, "module-state-in-domain", subject, node))
    return found


def check(context):
    if not context.domain:
        return []
    skipped = type_checking_nodes(context.tree, context.aliases)
    return logger_findings(context, skipped) + state_findings(context, skipped)
