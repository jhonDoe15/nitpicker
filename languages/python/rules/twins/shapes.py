import ast
import builtins
import copy

from checks.common import LOG_METHODS, dotted_name, last_name
from twins.pairs import sync_candidate

IGNORED_ROOTS = (
    "asyncio.",
    "anyio.",
    "trio.",
    "concurrent.",
    "inspect.",
    "contextvars.",
)
IGNORED_CALLS = {
    "run_in_executor",
    "to_thread",
    "create_task",
    "gather",
    "ensure_future",
    "sleep",
}
IGNORED_EXCEPTIONS = {
    "CancelledError",
    "GeneratorExit",
    "StopIteration",
    "StopAsyncIteration",
}
RECEIVERS = {"self", "cls"}
EXITS = (ast.Return, ast.Raise)


class Mapper(ast.NodeTransformer):
    def __init__(self, known):
        self.known = known

    def mapped(self, name):
        stripped = sync_candidate(name)
        return stripped if stripped in self.known else name

    def visit_Await(self, node):
        return self.visit(node.value)

    def visit_Name(self, node):
        node.id = self.mapped(node.id)
        return node

    def visit_Attribute(self, node):
        self.generic_visit(node)
        node.attr = self.mapped(node.attr)
        return node


def parameters_of(function):
    arguments = function.args
    every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
    names = {item.arg for item in every}
    names.update(item.arg for item in (arguments.vararg, arguments.kwarg) if item)
    return names - RECEIVERS


def exception_names(node):
    if node is None:
        return set()
    items = node.elts if isinstance(node, ast.Tuple) else [node]
    return {last_name(item) for item in items} - {None} - IGNORED_EXCEPTIONS


def caught_types(function):
    found = set()
    for node in ast.walk(function):
        if isinstance(node, ast.ExceptHandler):
            found |= exception_names(node.type)
    return found


def is_guard(statement):
    return (
        isinstance(statement, ast.If)
        and not statement.orelse
        and isinstance(statement.body[-1], EXITS)
    )


def guards_of(function):
    return {ast.unparse(item.test) for item in function.body if is_guard(item)}


def is_counted_call(node, aliases):
    name = last_name(node.func)
    if name is None or name in IGNORED_CALLS or hasattr(builtins, name):
        return False
    if name in LOG_METHODS or (dotted_name(node.func, aliases) or "").startswith(
        IGNORED_ROOTS
    ):
        return False
    return True


def called_names(function, aliases):
    return {
        last_name(node.func)
        for node in ast.walk(function)
        if isinstance(node, ast.Call) and is_counted_call(node, aliases)
    }


def shape_of(function, aliases):
    return {
        "parameter": parameters_of(function),
        "exception": caught_types(function),
        "guard": guards_of(function),
        "call": called_names(function, aliases),
    }


def normalized(function, known):
    return Mapper(known).visit(copy.deepcopy(function))
