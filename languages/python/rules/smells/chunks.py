import ast

from checks.common import dotted_name, last_name, words_of
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
CHUNK_WORDS = {
    "chunk",
    "chunks",
    "chunked",
    "batch",
    "batches",
    "batched",
    "slice",
    "partition",
    "page",
    "group",
    "window",
}
UNPACKING = {"enumerate", "zip"}
APPENDING = {"append", "extend", "add"}
SLICING = {"islice", "batched", "chunked", "ichunked", "sliced"}
COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)
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


def is_single_item(iterable):
    size = iterable.args[1] if len(iterable.args) > 1 else None
    return (
        isinstance(size, ast.Constant)
        and isinstance(size.value, int)
        and size.value < 2
    )


def unpacked_pairs(target, iterable):
    if not (
        isinstance(iterable, ast.Call)
        and isinstance(iterable.func, ast.Name)
        and iterable.func.id in UNPACKING
        and iterable.args
    ):
        return [(target, iterable)]
    elements = target.elts if isinstance(target, ast.Tuple) else [target]
    if iterable.func.id == "enumerate":
        return [(elements[-1], iterable.args[0])]
    return list(zip(elements, iterable.args))


def iterates_chunks(loop, target, iterable, context):
    return any(
        names_chunk(loop, inner_target, inner, context)
        for inner_target, inner in unpacked_pairs(target, iterable)
    )


def names_chunk(loop, target, iterable, context):
    if isinstance(target, ast.Name) and set(words_of(target.id)) & CHUNK_WORDS:
        return True
    if isinstance(iterable, ast.Call):
        name = dotted_name(iterable.func, context.aliases)
        return not is_single_item(iterable) and (
            name in CHUNKERS
            or bool(last_words(iterable.func, context.aliases) & CHUNK_WORDS)
        )
    return isinstance(iterable, ast.Name) and built_from_slices(iterable, loop, context)


def pulls_chunks(loop):
    if not isinstance(loop, ast.While):
        return False
    return any(
        isinstance(node, ast.NamedExpr)
        and any(
            isinstance(inner, ast.Subscript)
            and isinstance(inner.slice, ast.Slice)
            or isinstance(inner, ast.Call)
            and last_name(inner.func) in SLICING
            for inner in ast.walk(node.value)
        )
        for node in ast.walk(loop.test)
    )


def appended_names(loop):
    names = set()
    for node in ast.walk(loop):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in APPENDING
            and isinstance(node.func.value, ast.Name)
        ):
            names.add(node.func.value.id)
        elif isinstance(node, ast.AugAssign) and isinstance(node.target, ast.Name):
            names.add(node.target.id)
    return names


def measured_names(loop):
    return {
        argument.id
        for node in ast.walk(loop)
        if isinstance(node, ast.Compare)
        for call in ast.walk(node)
        if isinstance(call, ast.Call)
        and isinstance(call.func, ast.Name)
        and call.func.id == "len"
        for argument in call.args
        if isinstance(argument, ast.Name)
    }


def flushes_at_size(call, loop):
    names = appended_names(loop) & measured_names(loop)
    return bool(names) and passes_whole(call, names)


def loop_pairs(loop):
    if isinstance(loop, (ast.For, ast.AsyncFor)):
        return [(loop.target, loop.iter)]
    if isinstance(loop, COMPREHENSIONS):
        return [(g.target, g.iter) for g in loop.generators]
    return []


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


def reads_whole(node, variables):
    pending = [node]
    while pending:
        current = pending.pop()
        if isinstance(current, ast.Name) and current.id in variables:
            return True
        if isinstance(current, ast.Subscript) and not isinstance(current.slice, ast.Slice):
            pending.append(current.slice)
        else:
            pending.extend(ast.iter_child_nodes(current))
    return False


def passes_whole(call, variables):
    return any(reads_whole(argument, variables) for argument in arguments_of(call))


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
    if pulls_chunks(loop) or flushes_at_size(call, loop):
        return True
    for target, iterable in loop_pairs(loop):
        if isinstance(loop, (ast.For, ast.AsyncFor)):
            source = ranged_source(loop)
            if source is not None and slices_source(call, source):
                return True
        if iterates_chunks(loop, target, iterable, context) and passes_whole(
            call, variables
        ):
            return True
    return False
