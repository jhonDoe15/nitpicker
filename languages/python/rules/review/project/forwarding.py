import ast

from review.common import (
    FUNCTION_TYPES,
    body_without_docstring,
    finding,
    positional,
    positional_defaults,
    same_node,
)


def is_name(node, name):
    return isinstance(node, ast.Name) and node.id == name


def forwarded_call(fn):
    body = body_without_docstring(fn.body)
    if len(body) != 1 or not isinstance(body[0], ast.Return):
        return None
    value = body[0].value
    if isinstance(fn, ast.AsyncFunctionDef):
        value = value.value if isinstance(value, ast.Await) else None
    return value if isinstance(value, ast.Call) else None


def forwards_positionals(fn, call):
    names = [parameter.arg for parameter in positional(fn)]
    passed = list(call.args)
    vararg = fn.args.vararg
    if vararg is not None:
        last = passed.pop() if passed else None
        if not (isinstance(last, ast.Starred) and is_name(last.value, vararg.arg)):
            return None
        if len(passed) != len(names):
            return None
    if len(passed) > len(names):
        return None
    if not all(is_name(argument, name) for argument, name in zip(passed, names)):
        return None
    rest = names[len(passed):]
    posonly = {parameter.arg for parameter in fn.args.posonlyargs}
    return None if posonly.intersection(rest) else rest


def forwards_keywords(fn, call, rest):
    named = {keyword.arg: keyword.value for keyword in call.keywords if keyword.arg is not None}
    spread = [keyword.value for keyword in call.keywords if keyword.arg is None]
    expected = rest + [parameter.arg for parameter in fn.args.kwonlyargs]
    if set(named) != set(expected) or not all(is_name(named[name], name) for name in expected):
        return False
    kwarg = fn.args.kwarg
    if kwarg is None:
        return not spread
    return len(spread) == 1 and is_name(spread[0], kwarg.arg)


def forwards_own_parameters(fn, call):
    arguments = fn.args
    has_parameters = bool(
        positional(fn) or arguments.vararg or arguments.kwonlyargs or arguments.kwarg
    )
    rest = forwards_positionals(fn, call) if has_parameters else None
    return rest is not None and forwards_keywords(fn, call, rest)


def positional_kind(fn, parameter):
    return "positional" if parameter in fn.args.posonlyargs else "either"


def shape_of(fn):
    arguments = fn.args
    keyword_only = sorted(
        zip(arguments.kwonlyargs, arguments.kw_defaults), key=lambda pair: pair[0].arg
    )
    spreads = [parameter for parameter in (arguments.vararg, arguments.kwarg) if parameter]
    return (
        [
            (parameter.arg, positional_kind(fn, parameter), parameter.annotation, default)
            for parameter, default in positional_defaults(fn)
        ]
        + [
            (parameter.arg, "keyword", parameter.annotation, default)
            for parameter, default in keyword_only
        ]
        + [(f"*{parameter.arg}", "spread", parameter.annotation, None) for parameter in spreads]
    )


def is_annotated(fn):
    return fn.returns is not None and all(
        annotation is not None for _, _, annotation, _ in shape_of(fn)
    )


def same_signature(wrapper, target):
    own, theirs = shape_of(wrapper), shape_of(target)
    return (
        is_annotated(wrapper)
        and is_annotated(target)
        and bool(wrapper.args.vararg) == bool(target.args.vararg)
        and bool(wrapper.args.kwarg) == bool(target.args.kwarg)
        and len(own) == len(theirs)
        and all(
            mine[:2] == other[:2]
            and same_node(mine[2], other[2])
            and same_node(mine[3], other[3])
            for mine, other in zip(own, theirs)
        )
        and same_node(wrapper.returns, target.returns)
    )


def is_plain(fn):
    return (
        isinstance(fn, FUNCTION_TYPES)
        and not fn.decorator_list
        and not getattr(fn, "type_params", None)
    )


def target_of(index, path, call):
    resolved = index.resolve(path, call.func)
    if resolved is None:
        return None
    target_path, name, nodes = resolved
    if len(nodes) != 1 or not isinstance(nodes[0], FUNCTION_TYPES):
        return None
    if nodes[0].decorator_list:
        return None
    return target_path, name, nodes[0]


def wrapper_finding(index, path, fn):
    call = forwarded_call(fn)
    if call is None or not forwards_own_parameters(fn, call):
        return None
    target = target_of(index, path, call)
    if target is None or target[2] is fn or type(target[2]) is not type(fn):
        return None
    if not same_signature(fn, target[2]):
        return None
    return finding("forwarding-wrapper", path, fn.name, fn.lineno, {"target": target[1]})


def forwarding_findings(index):
    found = []
    for path, tree in index.production_trees():
        for statement in tree.body:
            if is_plain(statement):
                wrapper = wrapper_finding(index, path, statement)
                if wrapper is not None:
                    found.append(wrapper)
    return found
