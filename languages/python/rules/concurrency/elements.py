import ast
from collections import namedtuple

from checks.common import dotted_name
from checks.loop_scope import COMPREHENSIONS, enclosing_loop
from concurrency.functions import DEFINITIONS, enclosing, is_limiter
from concurrency.remote import is_task_call, remote_of, text_of

Site = namedtuple("Site", "anchor combinator collection work")

COMBINATORS = {"asyncio.gather", "asyncio.wait", "asyncio.as_completed"}
ADDING = {"append", "add"}
MAX_DEPTH = 4


def call_of(callee, args=()):
    return ast.copy_location(
        ast.Call(func=callee, args=list(args), keywords=[]), callee
    )


def appended(name, anchor, context):
    function = enclosing(
        anchor, context.parents, (ast.FunctionDef, ast.AsyncFunctionDef)
    )
    root = function or context.tree
    for node in ast.walk(root):
        is_add = (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in ADDING
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id == name
            and node.args
        )
        loop = enclosing_loop(node, context.parents) if is_add else None
        if isinstance(loop, (ast.For, ast.AsyncFor)):
            yield node.args[0], loop.iter


def expansions(value, anchor, context, depth=0):
    if depth > MAX_DEPTH:
        return
    if isinstance(value, (ast.ListComp, ast.GeneratorExp, ast.SetComp)):
        yield value.elt, value.generators[0].iter
    elif isinstance(value, ast.Call) and getattr(value.func, "id", "") == "map":
        if len(value.args) >= 2:
            yield call_of(value.args[0]), value.args[1]
    elif isinstance(value, ast.Name):
        scope = remote_of(context)
        for bound in scope.names.get(value.id, []):
            if not isinstance(bound, tuple):
                yield from expansions(bound, anchor, context, depth + 1)
        yield from appended(value.id, anchor, context)


def gather_sites(call, context):
    combinator = dotted_name(call.func, context.aliases)
    if combinator not in COMBINATORS:
        return []
    sites = []
    for argument in call.args:
        value = argument.value if isinstance(argument, ast.Starred) else argument
        for element, collection in expansions(value, call, context):
            if isinstance(element, ast.Call) and not is_task_call(
                element, context.aliases
            ):
                sites.append(Site(call, combinator, collection, element))
    return sites


def task_work(call, context):
    if not call.args:
        return None
    if is_task_call(call, context.aliases):
        return call.args[0]
    if isinstance(call.func, ast.Attribute) and call.func.attr == "start_soon":
        return call_of(call.args[0], call.args[1:])
    return None


def draining(loop, context):
    function = enclosing(loop, context.parents, DEFINITIONS)
    for node in ast.walk(loop):
        if not isinstance(node, ast.Call):
            continue
        if dotted_name(node.func, context.aliases) in COMBINATORS:
            return True
        if (
            isinstance(node.func, ast.Attribute)
            and node.func.attr == "acquire"
            and is_limiter(node.func.value, function, context, {})
        ):
            return True
    return False


def task_sites(call, context):
    work = task_work(call, context)
    if work is None or isinstance(context.parents.get(id(call)), ast.Await):
        return []
    loop = enclosing_loop(call, context.parents)
    if isinstance(loop, COMPREHENSIONS):
        collection = loop.generators[0].iter
    elif isinstance(loop, (ast.For, ast.AsyncFor)):
        collection = loop.iter
    else:
        return []
    if draining(loop, context):
        return []
    return [Site(call, text_of(call.func), collection, work)]


def sites_of(call, context):
    return gather_sites(call, context) + task_sites(call, context)
