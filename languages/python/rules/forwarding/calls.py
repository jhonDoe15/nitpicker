import ast

from checks.common import finding
from forwarding.resolve import (
    enclosing_class,
    find_method,
    parameter_names,
    resolve,
    resolve_class,
)
from reach.flow import walk_scope
from signatures.copies import mentions
from signatures.annotations import FUNCTION_TYPES, qualified_name

RULE = "parameter-not-forwarded"


def is_super_call(call, name):
    func = call.func
    return (
        isinstance(func, ast.Attribute)
        and func.attr == name
        and isinstance(func.value, ast.Call)
        and getattr(func.value.func, "id", "") == "super"
    )


def unknown_expansion(call, function):
    own = {item.arg for item in (function.args.vararg, function.args.kwarg) if item}
    for arg in call.args:
        if isinstance(arg, ast.Starred) and getattr(arg.value, "id", None) not in own:
            return True
    return any(
        item.arg is None and getattr(item.value, "id", None) not in own for item in call.keywords
    )


def used_outside(function, call, name):
    return any(
        isinstance(item, ast.Name)
        and item.id == name
        and isinstance(item.ctx, ast.Load)
        and not any(item is inner for inner in ast.walk(call))
        for item in ast.walk(function)
    )


def base_method(method, context):
    cls = enclosing_class(method, context)
    if cls is None:
        return None
    for base in cls.bases:
        found = resolve_class(base, context)
        target = find_method(found[0], found[1], method.name) if found else None
        if target is not None:
            return target
    return None


def has_super_call(method):
    return any(
        isinstance(node, ast.Call) and getattr(node.func, "id", "") == "super"
        for node in walk_scope(method)
    )


def set_in_kwargs(function, name):
    own = function.args.kwarg.arg if function.args.kwarg else None
    for node in walk_scope(function):
        if isinstance(node, ast.Subscript) and isinstance(node.ctx, ast.Store):
            if (
                getattr(node.value, "id", None) == own
                and getattr(node.slice, "value", None) == name
            ):
                return True
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            owner = getattr(node.func.value, "id", None)
            keyworded = any(item.arg == name for item in node.keywords)
            first = node.args[0] if node.args else None
            named = isinstance(first, ast.Constant) and first.value == name
            if owner == own and node.func.attr in {"update", "setdefault"} and (keyworded or named):
                return True
    return False


def super_findings(method, context):
    if not has_super_call(method):
        return []
    target = base_method(method, context)
    if target is None:
        return []
    shared = set(parameter_names(method)) & set(parameter_names(target))
    owner = qualified_name(method, context)
    found = []
    for call in walk_scope(method):
        if not (isinstance(call, ast.Call) and is_super_call(call, method.name)):
            continue
        if unknown_expansion(call, method):
            continue
        for name in sorted(shared):
            if (
                not mentions(call, name)
                and used_outside(method, call, name)
                and not set_in_kwargs(method, name)
            ):
                subject = f"{name}: {owner} > super().{method.name}"
                found.append(finding(context.path, RULE, subject, call))
    return found


def callee_of(call, method, context):
    func = call.func
    if (
        isinstance(func, ast.Attribute)
        and isinstance(func.value, ast.Name)
        and func.value.id == "self"
    ):
        cls = enclosing_class(method, context)
        return find_method(cls, context, func.attr) if cls else None
    found = resolve(func, context, FUNCTION_TYPES)
    return found[0] if found else None


def keyword_defaults(function):
    arguments = function.args
    positional = [*arguments.posonlyargs, *arguments.args]
    plain = positional[len(positional) - len(arguments.defaults) :] if arguments.defaults else []
    with_default = {argument.arg for argument in plain}
    with_default |= {
        argument.arg
        for argument, default in zip(arguments.kwonlyargs, arguments.kw_defaults)
        if default is not None
    }
    return with_default - {item.arg for item in arguments.posonlyargs}


def call_covers(call, target, name):
    positional = [argument.arg for argument in [*target.args.posonlyargs, *target.args.args]]
    offset = 1 if positional[:1] in (["self"], ["cls"]) else 0
    covered = positional[offset : offset + len(call.args)]
    return name in covered or any(item.arg == name for item in call.keywords)


def forwards_other(call, method, name):
    others = set(parameter_names(method)) - {name}
    return any(
        isinstance(item, ast.Name) and item.id in others
        for arg in [*call.args, *[kw.value for kw in call.keywords]]
        for item in [arg]
    )


def callee_findings(method, context):
    owner = qualified_name(method, context)
    found, seen = [], set()
    for call in walk_scope(method):
        if not isinstance(call, ast.Call) or is_super_call(call, method.name):
            continue
        target = callee_of(call, method, context)
        if target is None or target is method or unknown_expansion(call, method):
            continue
        for name in sorted(set(parameter_names(method)) & keyword_defaults(target)):
            key = (name, target.name)
            if key in seen or mentions(call, name) or call_covers(call, target, name):
                continue
            if (
                forwards_other(call, method, name)
                and not used_outside(method, call, name)
                and not set_in_kwargs(method, name)
            ):
                seen.add(key)
                subject = f"{name}: {owner} > {target.name}"
                found.append(finding(context.path, RULE, subject, call))
    return found
