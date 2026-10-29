import ast

from aliases.bases import FUNCTION_TYPES, class_methods, inherited_names

RULE = "forwarding-method-alias"
PUBLISHED_NAMES = {"of", "from_"}


def body_without_docstring(body):
    first = body[0] if body else None
    is_docstring = (
        isinstance(first, ast.Expr)
        and isinstance(first.value, ast.Constant)
        and isinstance(first.value.value, str)
    )
    return body[1:] if is_docstring else body


def same_node(left, right):
    return (left is None) == (right is None) and (
        left is None or ast.dump(left) == ast.dump(right)
    )


def is_name(node, name):
    return isinstance(node, ast.Name) and node.id == name


def is_dunder(name):
    return name.startswith("__") and name.endswith("__")


def is_plain_method(fn):
    return (
        isinstance(fn, FUNCTION_TYPES)
        and not fn.decorator_list
        and not getattr(fn, "type_params", None)
        and not is_dunder(fn.name)
    )


def bound_parameters(fn):
    arguments = fn.args
    positional = arguments.posonlyargs + arguments.args
    return positional[0].arg if positional else None, positional[1:]


def forwarded_call(fn):
    body = body_without_docstring(fn.body)
    if len(body) != 1:
        return None
    statement = body[0]
    value = statement.value if isinstance(statement, (ast.Return, ast.Expr)) else None
    if isinstance(fn, ast.AsyncFunctionDef) and isinstance(value, ast.Await):
        value = value.value
    returns_value = isinstance(statement, ast.Return)
    returns_none = isinstance(fn.returns, ast.Constant) and fn.returns.value is None
    if not isinstance(value, ast.Call) or not (returns_value or returns_none):
        return None
    return value


def forwards_positionals(fn, positional, call):
    passed = list(call.args)
    vararg = fn.args.vararg
    if vararg is not None:
        last = passed.pop() if passed else None
        if not (isinstance(last, ast.Starred) and is_name(last.value, vararg.arg)):
            return None
    names = [parameter.arg for parameter in positional]
    if len(passed) > len(names) or not all(
        is_name(argument, name) for argument, name in zip(passed, names)
    ):
        return None
    rest = names[len(passed) :]
    posonly = {parameter.arg for parameter in fn.args.posonlyargs}
    return None if posonly.intersection(rest) else rest


def forwards_keywords(fn, call, rest):
    named = {
        keyword.arg: keyword.value for keyword in call.keywords if keyword.arg
    }
    spread = [keyword.value for keyword in call.keywords if keyword.arg is None]
    expected = rest + [parameter.arg for parameter in fn.args.kwonlyargs]
    if set(named) != set(expected) or len(named) != len(call.keywords) - len(spread):
        return False
    if not all(is_name(named[name], name) for name in expected):
        return False
    kwarg = fn.args.kwarg
    if kwarg is None:
        return not spread
    return len(spread) == 1 and is_name(spread[0], kwarg.arg)


def forwarded_target(fn, call):
    receiver, positional = bound_parameters(fn)
    func = call.func
    arguments = fn.args
    has_parameters = bool(
        positional or arguments.vararg or arguments.kwonlyargs or arguments.kwarg
    )
    if not (
        receiver
        and has_parameters
        and isinstance(func, ast.Attribute)
        and is_name(func.value, receiver)
    ):
        return None
    rest = forwards_positionals(fn, positional, call)
    return func.attr if rest is not None and forwards_keywords(fn, call, rest) else None


def kind_of(fn, parameter):
    return "positional" if parameter in fn.args.posonlyargs else "either"


def shape_of(fn):
    arguments = fn.args
    positional = arguments.posonlyargs + arguments.args
    defaults = [None] * (len(positional) - len(arguments.defaults)) + arguments.defaults
    keyword_only = sorted(
        zip(arguments.kwonlyargs, arguments.kw_defaults), key=lambda pair: pair[0].arg
    )
    spreads = [item for item in (arguments.vararg, arguments.kwarg) if item]
    return (
        [
            (parameter.arg, kind_of(fn, parameter), parameter.annotation, default)
            for parameter, default in list(zip(positional, defaults))[1:]
        ]
        + [
            (parameter.arg, "keyword", parameter.annotation, default)
            for parameter, default in keyword_only
        ]
        + [(f"*{item.arg}", "spread", item.annotation, None) for item in spreads]
    )


def is_annotated(fn):
    return fn.returns is not None and all(
        annotation is not None for _, _, annotation, _ in shape_of(fn)
    )


def same_signature(wrapper, target):
    own, theirs = shape_of(wrapper), shape_of(target)
    return (
        type(wrapper) is type(target)
        and is_annotated(wrapper)
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


def visibility(name):
    return 2 if name.startswith("__") else 1 if name.startswith("_") else 0


def alias_findings(context, node):
    inherited, complete = inherited_names(context, node)
    if not complete:
        return []
    methods = class_methods(node)
    direct = {id(statement) for statement in node.body}
    found = []
    for name, nodes in methods.items():
        wrapper = nodes[0]
        if (
            len(nodes) != 1
            or id(wrapper) not in direct
            or not is_plain_method(wrapper)
            or name in PUBLISHED_NAMES
        ):
            continue
        call = forwarded_call(wrapper)
        target_name = forwarded_target(wrapper, call) if call else None
        targets = methods.get(target_name, [])
        if (
            name in inherited
            or target_name in (None, name)
            or len(targets) != 1
            or id(targets[0]) not in direct
            or not is_plain_method(targets[0])
            or not same_signature(wrapper, targets[0])
        ):
            continue
        rename = visibility(name) < visibility(target_name)
        found.append((wrapper, name, {"target": target_name, "rename": rename}))
    return later_of_mutual(found, methods)


def later_of_mutual(found, methods):
    targets = {name: detail["target"] for _, name, detail in found}
    return [
        entry
        for entry in found
        if targets.get(entry[2]["target"]) != entry[1]
        or methods[entry[2]["target"]][0].lineno < entry[0].lineno
    ]


def class_paths(tree):
    stack = [(tree, [])]
    while stack:
        parent, names = stack.pop()
        for child in ast.iter_child_nodes(parent):
            if isinstance(child, ast.ClassDef):
                yield child, names + [child.name]
                stack.append((child, names + [child.name]))
            elif not isinstance(child, FUNCTION_TYPES):
                stack.append((child, names))


def check(context):
    if context.tests:
        return []
    return [
        {
            "rule": RULE,
            "path": context.path,
            "subject": f"{'.'.join(names)}.{name}",
            "detail": detail,
            "line": wrapper.lineno,
        }
        for node, names in class_paths(context.tree)
        for wrapper, name, detail in alias_findings(context, node)
    ]
