import ast

from checks.common import dotted_name, words_of
from security.resolve.scopes import values_of, where_of

CHUNKERS = {
    "itertools.batched",
    "more_itertools.chunked",
    "more_itertools.ichunked",
    "more_itertools.batched",
    "more_itertools.sliced",
    "more_itertools.chunked_even",
    "toolz.partition_all",
    "cytoolz.partition_all",
}
CHUNK_WORDS = {"chunk", "chunks", "chunked", "batch", "batches", "batched", "slice"}
WRAPPERS = {"list", "tuple", "set", "frozenset", "sorted"}


def last_words(node, aliases):
    name = dotted_name(node, aliases) or ""
    return set(words_of(name.rsplit(".", 1)[-1]))


def is_slice(node):
    return isinstance(node, ast.Subscript) and isinstance(node.slice, ast.Slice)


def built_from_slices(name, loop, context):
    values = values_of(name.id, where_of(loop, context))
    return len(values) == 1 and (
        isinstance(values[0][0], (ast.ListComp, ast.GeneratorExp))
        and is_slice(values[0][0].elt)
    )


def iterates_chunks(loop, context):
    target, iterable = loop.target, loop.iter
    if isinstance(target, ast.Name) and set(words_of(target.id)) & CHUNK_WORDS:
        return True
    if isinstance(iterable, ast.Call):
        name = dotted_name(iterable.func, context.aliases)
        return name in CHUNKERS or bool(
            last_words(iterable.func, context.aliases) & CHUNK_WORDS
        )
    return isinstance(iterable, ast.Name) and built_from_slices(iterable, loop, context)


def chain_calls(call):
    calls = []
    node = call
    while isinstance(node, (ast.Call, ast.Attribute, ast.Await, ast.Subscript)):
        if isinstance(node, ast.Call):
            calls.append(node)
            node = node.func
        else:
            node = node.value
    return calls


def arguments_of(call):
    for inner in chain_calls(call):
        yield from inner.args
        yield from (keyword.value for keyword in inner.keywords)


def unwrapped(argument):
    if isinstance(argument, ast.Starred):
        argument = argument.value
    if (
        isinstance(argument, ast.Call)
        and isinstance(argument.func, ast.Name)
        and argument.func.id in WRAPPERS
        and len(argument.args) == 1
    ):
        return argument.args[0]
    return argument


def passes_whole(call, variables):
    return any(
        isinstance(value, ast.Name) and value.id in variables
        for value in map(unwrapped, arguments_of(call))
    )


def ranged_source(loop):
    iterable = loop.iter
    if not (
        isinstance(iterable, ast.Call)
        and isinstance(iterable.func, ast.Name)
        and iterable.func.id == "range"
        and len(iterable.args) == 3
    ):
        return None
    bound = iterable.args[1]
    if (
        isinstance(bound, ast.Call)
        and isinstance(bound.func, ast.Name)
        and bound.func.id == "len"
        and len(bound.args) == 1
        and isinstance(bound.args[0], ast.Name)
    ):
        return bound.args[0].id
    return None


def slices_source(call, source):
    return any(
        is_slice(value)
        and isinstance(value.value, ast.Name)
        and value.value.id == source
        for value in map(unwrapped, arguments_of(call))
    )


def is_chunked(call, loop, variables, context):
    if not isinstance(loop, (ast.For, ast.AsyncFor)):
        return False
    source = ranged_source(loop)
    if source is not None and slices_source(call, source):
        return True
    return iterates_chunks(loop, context) and passes_whole(call, variables)
