import ast

from checks.common import dotted_name

RULE = "forwarding-method-alias"
PUBLISHED_NAMES = {"of", "from_"}
NEUTRAL_BASES = {
    "object",
    "ABC",
    "Generic",
    "Enum",
    "IntEnum",
    "StrEnum",
    "Flag",
    "IntFlag",
    "NamedTuple",
    "TypedDict",
    "Exception",
    "BaseException",
}
FUNCTION_TYPES = (ast.FunctionDef, ast.AsyncFunctionDef)


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


def class_methods(node):
    methods = {}
    for statement in node.body:
        if isinstance(statement, FUNCTION_TYPES):
            methods.setdefault(statement.name, []).append(statement)
        else:
            for name in bound_names(statement):
                methods.setdefault(name, []).append(statement)
    return methods


def bound_names(statement):
    if isinstance(statement, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
        targets = (
            statement.targets if isinstance(statement, ast.Assign) else [statement.target]
        )
        return [target.id for target in targets if isinstance(target, ast.Name)]
    return []


def base_node(base):
    return base.value if isinstance(base, ast.Subscript) else base


def simple_name(name):
    return name.rsplit(".", 1)[-1]


def is_neutral(name):
    last = simple_name(name)
    return last in NEUTRAL_BASES or last.endswith(("Error", "Exception", "Warning"))


def local_class(context, name):
    for statement in context.tree.body:
        if isinstance(statement, ast.ClassDef) and statement.name == name:
            return context, statement
    return None


def project_class(context, dotted):
    located = context.project.locate(dotted)
    owner = context.project.contexts.get(located[0]) if located else None
    return local_class(owner, located[1]) if owner else None


def resolve_base(context, base):
    node = base_node(base)
    dotted = dotted_name(node, context.aliases)
    if isinstance(node, ast.Name) and local_class(context, node.id):
        return local_class(context, node.id)
    return project_class(context, dotted) if dotted else None


def inherited_names(context, node, seen=None):
    seen = set() if seen is None else seen
    if id(node) in seen:
        return set(), False
    seen.add(id(node))
    names, complete = set(), True
    for base in node.bases:
        resolved = resolve_base(context, base)
        if resolved is not None:
            parent, parent_node = resolved
            names |= set(class_methods(parent_node))
            more, closed = inherited_names(parent, parent_node, seen)
            names |= more
            complete = complete and closed
        else:
            dotted = dotted_name(base_node(base), context.aliases) or ""
            complete = complete and is_neutral(dotted)
    keywords = [keyword for keyword in node.keywords if keyword.arg != "metaclass"]
    return names, complete and not keywords


def alias_findings(context, node):
    inherited, complete = inherited_names(context, node)
    if not complete:
        return []
    methods = class_methods(node)
    found = []
    for name, nodes in methods.items():
        wrapper = nodes[0]
        if len(nodes) != 1 or not is_plain_method(wrapper) or name in PUBLISHED_NAMES:
            continue
        call = forwarded_call(wrapper)
        target_name = forwarded_target(wrapper, call) if call else None
        targets = methods.get(target_name, [])
        if (
            name in inherited
            or target_name in (None, name)
            or len(targets) != 1
            or not is_plain_method(targets[0])
            or not same_signature(wrapper, targets[0])
        ):
            continue
        found.append((wrapper, f"{name} -> {target_name}"))
    return found


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
            "subject": f"{'.'.join(names)}.{subject}",
            "line": wrapper.lineno,
        }
        for node, names in class_paths(context.tree)
        for wrapper, subject in alias_findings(context, node)
    ]
