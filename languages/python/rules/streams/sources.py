import ast

STREAMING_METHODS = {"iterator", "yield_per", "stream_scalars", "partitions"}
CURSOR_METHODS = {"cursor"}


def calls_in_chain(node):
    while True:
        if isinstance(node, ast.Await):
            node = node.value
        elif isinstance(node, ast.Call):
            yield node
            node = node.func
        elif isinstance(node, ast.Attribute):
            node = node.value
        else:
            return


def is_true(node):
    return isinstance(node, ast.Constant) and node.value is True


def option_dict_streams(node):
    return isinstance(node, ast.Dict) and any(
        isinstance(key, ast.Constant)
        and key.value == "stream_results"
        and is_true(value)
        for key, value in zip(node.keys, node.values)
    )


def has_stream_option(call):
    return any(
        (keyword.arg == "stream_results" and is_true(keyword.value))
        or (keyword.arg == "execution_options" and option_dict_streams(keyword.value))
        for keyword in call.keywords
    )


def streams_statement(call):
    return (
        isinstance(call.func, ast.Attribute)
        and call.func.attr == "stream"
        and bool(call.args)
        and not isinstance(call.args[0], ast.Constant)
    )


def streams_results(call):
    inner = [nested for argument in call.args for nested in calls_in_chain(argument)]
    return (
        has_stream_option(call)
        or streams_statement(call)
        or any(has_stream_option(nested) for nested in inner)
    )


def is_named_cursor(call):
    return (
        isinstance(call.func, ast.Attribute)
        and call.func.attr in CURSOR_METHODS
        and any(keyword.arg == "name" for keyword in call.keywords)
    )


def stream_names(function):
    names = set()
    for node in ast.walk(function):
        if isinstance(node, ast.Assign) and (
            (isinstance(node.value, ast.Call) and is_named_cursor(node.value))
            or is_stream_source(node.value, set())
        ):
            names.update(t.id for t in node.targets if isinstance(t, ast.Name))
        if isinstance(node, (ast.With, ast.AsyncWith)):
            for item in node.items:
                variable = item.optional_vars
                if (
                    isinstance(item.context_expr, ast.Call)
                    and is_named_cursor(item.context_expr)
                    and isinstance(variable, ast.Name)
                ):
                    names.add(variable.id)
    return names


def is_stream_source(node, cursors):
    if isinstance(node, ast.Name):
        return node.id in cursors
    chain = list(calls_in_chain(node))
    return any(
        (isinstance(call.func, ast.Attribute) and call.func.attr in STREAMING_METHODS)
        or streams_results(call)
        for call in chain
    )
