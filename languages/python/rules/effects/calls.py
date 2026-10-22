import ast

from checks.common import call_name
from effects.names import (
    CLIENT_METHODS,
    CONNECT_WITH_HOST,
    FILE_HANDLERS,
    INPUT_OUTPUT_FUNCTIONS,
    LAZY_CLIENTS,
    QUIET_AT_IMPORT,
    SCHEDULER_PACKAGE,
    SCHEDULER_STARTS,
    SCHEDULER_SUFFIX,
    STARTABLE,
    STARTED_FUNCTIONS,
)
from environment.purity import call_rule, loaded_io_module, path_method_calls
from environment.purity import reference_rule
from smells.io_index import is_input_output_method

KINDS = {"io-in-domain": "io", "clock-now": "clock", "random-in-domain": "random"}
EXTERNAL = "external"


def path_calls(context):
    def build(_):
        return {id(node): name for node, name in path_method_calls(context)}

    return context.project.memo(("effect-path-calls", context.path), build)


def bindings(nodes, aliases):
    bound = {}
    for node in nodes:
        pairs = []
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            pairs = [(node.targets[0], node.value)]
        elif isinstance(node, (ast.With, ast.AsyncWith)):
            pairs = [(item.optional_vars, item.context_expr) for item in node.items]
        for target, value in pairs:
            factory = call_name(value, aliases)
            if isinstance(target, ast.Name) and factory:
                bound[target.id] = factory
    return bound


def receiver_factory(call, scope):
    owner = call.func.value
    if isinstance(owner, ast.Call):
        return call_name(owner, scope.context.aliases)
    return scope.bound.get(owner.id) if isinstance(owner, ast.Name) else None


def method_effect(call, scope):
    if not isinstance(call.func, ast.Attribute):
        return None, None
    factory = receiver_factory(call, scope)
    method = call.func.attr
    if factory is None:
        return None, None
    name = f"{factory}.{method}"
    if factory in LAZY_CLIENTS and (
        method in CLIENT_METHODS or is_input_output_method(method)
    ):
        return "io", name
    starts = STARTABLE.get(factory, set())
    if factory.startswith(SCHEDULER_PACKAGE) and factory.endswith(SCHEDULER_SUFFIX):
        starts = SCHEDULER_STARTS
    return (EXTERNAL, name) if method in starts else (None, None)


def delays_opening(call):
    return any(
        keyword.arg == "delay"
        and isinstance(keyword.value, ast.Constant)
        and keyword.value.value is True
        for keyword in call.keywords
    )


def started_name(call, name):
    if name in STARTED_FUNCTIONS:
        return name
    if name in CONNECT_WITH_HOST and (call.args or call.keywords):
        return name
    return name if name in FILE_HANDLERS and not delays_opening(call) else None


def input_output_name(call, name, scope):
    if name in INPUT_OUTPUT_FUNCTIONS:
        return name
    return path_calls(scope.context).get(id(call))


class Scope:
    def __init__(self, context, bound):
        self.context = context
        self.bound = bound


def direct_effects(call, scope):
    name = call_name(call, scope.context.aliases)
    found = {}
    rule = (call_rule(name, call) or reference_rule(name)) if name else None
    if rule is not None:
        found[KINDS[rule]] = name
    kind, method = method_effect(call, scope)
    io = found.get("io") or input_output_name(call, name, scope)
    io = io or (method if kind == "io" else None)
    if io is not None:
        found["io"] = io
    loaded = loaded_io_module(call, scope.context.aliases)
    if loaded is not None:
        found.setdefault("io", loaded)
    external = started_name(call, name) or (method if kind else None)
    if external is None and io is not None and io not in QUIET_AT_IMPORT:
        external = io
    if external is not None:
        found[EXTERNAL] = external
    return found
