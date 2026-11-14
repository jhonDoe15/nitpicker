import ast

from checks.common import dotted_name, finding
from security.resolve.booleans import is_none
from security.resolve.calls import argument, has_double_star
from security.resolve.classes import attribute_values
from security.resolve.scopes import MAX_HOPS, definition, lookup, where_of
from security.support import exempt

RULE = "unbounded-wait"
GUARDED = True
FUTURE, THREAD, EXECUTOR = "Future", "Thread", "executor"
FUTURE_TYPES = {"concurrent.futures.Future", "concurrent.futures._base.Future"}
FUTURE_CALLS = FUTURE_TYPES | {"asyncio.run_coroutine_threadsafe"}
EXECUTORS = {
    "concurrent.futures.ThreadPoolExecutor",
    "concurrent.futures.ProcessPoolExecutor",
    "concurrent.futures.thread.ThreadPoolExecutor",
    "concurrent.futures.process.ProcessPoolExecutor",
}
THREADS = {"threading.Thread", "threading.Timer", "multiprocessing.Process"}
KINDS = {name: FUTURE for name in FUTURE_CALLS} | {name: EXECUTOR for name in EXECUTORS}
KINDS |= {name: THREAD for name in THREADS}
MODULE_WAITS = {"concurrent.futures.wait": 1, "concurrent.futures.as_completed": 1}
METHOD_WAITS = {FUTURE: {"result": 0, "exception": 0}, THREAD: {"join": 0}}


def annotation_kind(annotation, context):
    if isinstance(annotation, ast.Constant) and isinstance(annotation.value, str):
        try:
            annotation = ast.parse(annotation.value, mode="eval").body
        except (SyntaxError, ValueError):
            return None
    if isinstance(annotation, ast.BinOp) and isinstance(annotation.op, ast.BitOr):
        return annotation_kind(annotation.left, context) or annotation_kind(
            annotation.right, context
        )
    if isinstance(annotation, ast.Subscript):
        outer = dotted_name(annotation.value, context.aliases) or ""
        if outer.rsplit(".", 1)[-1] in {"Optional", "Union"}:
            return annotation_kind(annotation.slice, context)
        annotation = annotation.value
    if isinstance(annotation, ast.Tuple):
        kinds = {annotation_kind(item, context) for item in annotation.elts} - {None}
        return kinds.pop() if len(kinds) == 1 else None
    if annotation is None:
        return None
    return KINDS.get(dotted_name(annotation, context.aliases))


def subclass_kind(call, where, depth):
    found = definition(call.func, where)
    if found is None or depth > MAX_HOPS:
        return None
    cls, place = found
    kinds = {
        KINDS.get(dotted_name(base, place.context.aliases)) or subclass_base(base, place, depth)
        for base in cls.bases
    }
    kinds.discard(None)
    return kinds.pop() if len(kinds) == 1 else None


def subclass_base(base, where, depth):
    return subclass_kind(ast.Call(func=base, args=[], keywords=[]), where, depth + 1)


def call_kind(call, where, depth):
    function = call.func
    name = dotted_name(function, where.context.aliases)
    if name in KINDS:
        return KINDS[name]
    if isinstance(function, ast.Attribute) and function.attr == "submit":
        return FUTURE if kind_of(function.value, where, depth + 1) == EXECUTOR else None
    return subclass_kind(call, where, depth)


def element_kind(node, where, depth):
    if isinstance(node, ast.ListComp):
        return kind_of(node.elt, where, depth)
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)) and node.elts:
        kinds = {kind_of(element, where, depth) for element in node.elts}
        return kinds.pop() if len(kinds) == 1 else None
    if isinstance(node, ast.Name):
        return agreed(
            element_kind(value, place, depth + 1)
            for kind, value, place in lookup(node.id, where)
            if kind == "value"
        )
    return None


def agreed(kinds):
    found = set(kinds)
    return found.pop() if len(found) == 1 else None


def bound_kind(entry, depth):
    kind, value, place = entry
    if kind == "value":
        return kind_of(value, place, depth + 1)
    if kind == "iter":
        return element_kind(value, place, depth)
    if kind == "param":
        return annotation_kind(value, place.context)
    return None


def attribute_kind(node, where, depth):
    entries = attribute_values(node, where) or []
    return agreed(kind_of(value, place, depth + 1) for value, place in entries)


def kind_of(node, where, depth=0):
    if depth > MAX_HOPS or node is None:
        return None
    if isinstance(node, ast.Call):
        return call_kind(node, where, depth)
    if isinstance(node, ast.Name):
        return agreed(bound_kind(entry, depth) for entry in lookup(node.id, where))
    if isinstance(node, ast.Attribute):
        return attribute_kind(node, where, depth)
    return None


def unbounded(call, position, where):
    if has_double_star(call) or any(isinstance(item, ast.Starred) for item in call.args):
        return False
    timeout = argument(call, position, "timeout")
    return timeout is None or is_none(timeout, where)


def problem(call, where):
    name = dotted_name(call.func, where.context.aliases)
    if name in MODULE_WAITS:
        return name if unbounded(call, MODULE_WAITS[name], where) else None
    if not isinstance(call.func, ast.Attribute):
        return None
    kind = kind_of(call.func.value, where)
    position = METHOD_WAITS.get(kind, {}).get(call.func.attr)
    if position is None or not unbounded(call, position, where):
        return None
    return f"{kind}.{call.func.attr}"


def check(context):
    if exempt(context):
        return []
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, ast.Call):
            subject = problem(node, where_of(node, context))
            if subject is not None:
                found.append(finding(context.path, RULE, subject, node))
    return found
