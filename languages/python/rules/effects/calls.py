import ast

from checks.common import call_name
from effects.names import (
    CLIENT_METHODS,
    CONNECT_WITH_HOST,
    FILE_HANDLERS,
    FILE_LOGGING_SETUP,
    INPUT_OUTPUT_FUNCTIONS,
    LAZY_CLIENTS,
    LOCAL_CLIENT_METHODS,
    METADATA,
    METADATA_METHODS,
    QUIET_AT_IMPORT,
    REMOTE_CLIENTS,
    SCHEDULER_PACKAGE,
    SCHEDULER_STARTS,
    SCHEDULER_SUFFIX,
    STARTABLE,
    STARTED_FUNCTIONS,
)
from environment.paths import path_method_calls
from environment.purity import call_rule, loaded_io_module, reference_rule
from smells.io_index import is_input_output_method

KINDS = {"io-in-domain": "io", "clock-now": "clock", "random-in-domain": "random"}
EXTERNAL = "external"
IO = "io"


def path_calls(context):
    def build(_):
        return {id(node): name for node, name in path_method_calls(context)}

    return context.project.memo(("effect-path-calls", context.path), build)


def assigned_pairs(node):
    if isinstance(node, ast.Assign) and len(node.targets) == 1:
        return [(node.targets[0], node.value)]
    if isinstance(node, ast.AnnAssign) and node.value is not None:
        return [(node.target, node.value)]
    if isinstance(node, (ast.With, ast.AsyncWith)):
        return [(item.optional_vars, item.context_expr) for item in node.items]
    return []


def bindings(nodes, aliases):
    pairs = [pair for node in nodes for pair in assigned_pairs(node)]
    named = [
        (target.id, call_name(value, aliases))
        for target, value in pairs
        if isinstance(target, ast.Name)
    ]
    return {name: factory for name, factory in named if factory}


def receiver(call, scope):
    owner = call.func.value
    if isinstance(owner, ast.Call):
        factory = call_name(owner, scope.context.aliases)
        return factory, f"{factory}(...)"
    if isinstance(owner, ast.Name) and owner.id in scope.bound:
        return scope.bound[owner.id], owner.id
    return None, None


def client_kind(factory, method):
    if factory in REMOTE_CLIENTS and method not in LOCAL_CLIENT_METHODS:
        return IO
    lazy = factory in LAZY_CLIENTS
    return (
        IO
        if lazy and (method in CLIENT_METHODS or is_input_output_method(method))
        else None
    )


def started_kind(factory, method):
    starts = STARTABLE.get(factory, set())
    if factory.startswith(SCHEDULER_PACKAGE) and factory.endswith(SCHEDULER_SUFFIX):
        starts = SCHEDULER_STARTS
    return EXTERNAL if method in starts else None


def method_effect(call, scope):
    if not isinstance(call.func, ast.Attribute):
        return None, None
    method = call.func.attr
    owner = call.func.value
    if method in METADATA_METHODS and isinstance(owner, ast.Attribute):
        return (IO, f"{METADATA}.{method}") if owner.attr == METADATA else (None, None)
    factory, written = receiver(call, scope)
    if factory is None:
        return None, None
    kind = client_kind(factory, method) or started_kind(factory, method)
    return (kind, f"{written}.{method}") if kind else (None, None)


def has_keyword(call, name, value=None):
    return any(
        keyword.arg == name
        and (
            value is None
            or (
                isinstance(keyword.value, ast.Constant) and keyword.value.value is value
            )
        )
        for keyword in call.keywords
    )


def started_name(call, name):
    if name in STARTED_FUNCTIONS:
        return name
    if name in CONNECT_WITH_HOST and (call.args or call.keywords):
        return name
    if name == FILE_LOGGING_SETUP and has_keyword(call, "filename"):
        return name
    return (
        name if name in FILE_HANDLERS and not has_keyword(call, "delay", True) else None
    )


def input_output_name(call, name, scope):
    if name in INPUT_OUTPUT_FUNCTIONS:
        return name
    return path_calls(scope.context).get(id(call))


class Scope:
    def __init__(self, context, bound):
        self.context = context
        self.bound = bound


def purity_effects(call, name):
    rule = (call_rule(name, call) or reference_rule(name)) if name else None
    return {KINDS[rule]: name} if rule is not None else {}


def io_name(call, name, scope):
    kind, method = method_effect(call, scope)
    io = input_output_name(call, name, scope) or (method if kind == IO else None)
    return io or loaded_io_module(call, scope.context.aliases), method


def direct_effects(call, scope):
    name = call_name(call, scope.context.aliases)
    found = purity_effects(call, name)
    io, method = io_name(call, name, scope)
    io = found.get(IO) or io
    if io is not None:
        found[IO] = io
    external = started_name(call, name) or method
    if external is None and io is not None and io not in QUIET_AT_IMPORT:
        external = io
    if external is not None:
        found[EXTERNAL] = external
    return found
