import ast

from review.common import (
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
    if len(body) == 1 and isinstance(body[0], ast.Return) and isinstance(body[0].value, ast.Call):
        return body[0].value
    return None


def forwards_positionals(fn, call):
    names = [parameter.arg for parameter in positional(fn)]
    vararg = fn.args.vararg
    expected = len(names) + (1 if vararg else 0)
    if len(call.args) != expected:
        return False
    if vararg is not None:
        last = call.args[-1]
        if not (isinstance(last, ast.Starred) and is_name(last.value, vararg.arg)):
            return False
    return all(is_name(argument, name) for argument, name in zip(call.args, names))


def forwards_keywords(fn, call):
    named = {keyword.arg: keyword.value for keyword in call.keywords if keyword.arg is not None}
    spread = [keyword.value for keyword in call.keywords if keyword.arg is None]
    kwonly = [parameter.arg for parameter in fn.args.kwonlyargs]
    if set(named) != set(kwonly) or not all(is_name(named[name], name) for name in kwonly):
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
    return has_parameters and forwards_positionals(fn, call) and forwards_keywords(fn, call)


def shape_of(fn):
    arguments = fn.args
    keyword_only = sorted(
        zip(arguments.kwonlyargs, arguments.kw_defaults), key=lambda pair: pair[0].arg
    )
    return (
        [(parameter.arg, parameter.annotation, default) for parameter, default in positional_defaults(fn)]
        + [(parameter.arg, parameter.annotation, default) for parameter, default in keyword_only]
        + [(f"*{p.arg}", p.annotation, None) for p in (arguments.vararg, arguments.kwarg) if p]
    )


def is_annotated(fn):
    return fn.returns is not None and all(
        annotation is not None for _, annotation, _ in shape_of(fn)
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
            mine[0] == other[0] and same_node(mine[1], other[1]) and same_node(mine[2], other[2])
            for mine, other in zip(own, theirs)
        )
        and same_node(wrapper.returns, target.returns)
    )


def is_plain(fn):
    return (
        isinstance(fn, ast.FunctionDef)
        and not fn.decorator_list
        and not getattr(fn, "type_params", None)
    )


def target_of(index, path, call):
    resolved = index.resolve(path, call.func)
    if resolved is None:
        return None
    target_path, name, nodes = resolved
    if len(nodes) != 1 or not isinstance(nodes[0], (ast.FunctionDef, ast.AsyncFunctionDef)):
        return None
    if nodes[0].decorator_list:
        return None
    return target_path, name, nodes[0]


def wrapper_finding(index, path, fn):
    call = forwarded_call(fn)
    if call is None or not forwards_own_parameters(fn, call):
        return None
    target = target_of(index, path, call)
    if target is None or target[2] is fn or not same_signature(fn, target[2]):
        return None
    target_path, name, _ = target
    data = {
        "target": name,
        "module": None if target_path == path else index.modules.get(target_path),
        "exported": not fn.name.startswith("_"),
    }
    return finding("forwarding-wrapper", path, fn.name, fn.lineno, data)


def forwarding_findings(index):
    found = []
    for path, tree in index.production_trees():
        for statement in tree.body:
            if is_plain(statement):
                wrapper = wrapper_finding(index, path, statement)
                if wrapper is not None:
                    found.append(wrapper)
    return found
