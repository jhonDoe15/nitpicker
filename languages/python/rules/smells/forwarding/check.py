import ast
import re

from checks.common import finding, imported_module, own_nodes
from environment.roots import is_listed_entry

RULE = "no-forwarding-wrapper"


def contract(context, node):
    if not isinstance(node, ast.FunctionDef) or node.decorator_list or node.returns:
        return None
    source = ast.get_source_segment(context.text, node) or ""
    if re.search(r"#\s*type\s*:", source):
        return None
    arguments = node.args
    parameters = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
    if (
        arguments.defaults
        or arguments.vararg
        or arguments.kwarg
        or any(arguments.kw_defaults)
        or any(parameter.annotation for parameter in parameters)
        or getattr(node, "type_params", [])
        or node.type_comment
        or any(
            isinstance(child, (ast.Yield, ast.YieldFrom)) for child in own_nodes(node)
        )
    ):
        return None
    return (
        tuple(arg.arg for arg in arguments.posonlyargs),
        tuple(arg.arg for arg in arguments.args),
        tuple(arg.arg for arg in arguments.kwonlyargs),
    )


def module_bindings(context):
    bindings = {}
    for node in ast.walk(context.tree):
        if isinstance(node, ast.Attribute) and isinstance(
            node.ctx, (ast.Store, ast.Del)
        ):
            root = node.value
            while isinstance(root, ast.Attribute):
                root = root.value
            if isinstance(root, ast.Name):
                bindings.setdefault(root.id, []).append(node)
        if isinstance(node, ast.ExceptHandler) and node.name:
            bindings.setdefault(node.name, []).append(node)
        if isinstance(node, (ast.MatchAs, ast.MatchStar)) and node.name:
            bindings.setdefault(node.name, []).append(node)
        if isinstance(node, ast.Global):
            for name in node.names:
                bindings.setdefault(name, []).append(node)
        if isinstance(node, ast.ImportFrom) and any(
            alias.name == "*" for alias in node.names
        ):
            return {}
    for node in own_nodes(context.tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            bindings.setdefault(node.name, []).append(node)
        elif isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
            bindings.setdefault(node.id, []).append(node)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                name = alias.asname or alias.name.split(".")[0]
                bindings.setdefault(name, []).append(node)
    return bindings


def unique_binding(context, name):
    bindings = context.project.memo(
        (RULE, context.path), lambda _: module_bindings(context)
    ).get(name, [])
    if len(bindings) != 1:
        return None
    node = bindings[0]
    return node if node in context.tree.body else None


def public_module(context):
    return not any(
        part.startswith("_")
        for part in context.project.module_name(context.path).split(".")
    )


def resolve_target(context, call):
    function = call.func
    if isinstance(function, ast.Name):
        binding = unique_binding(context, function.id)
        if isinstance(binding, ast.FunctionDef):
            return context, binding
        if not isinstance(binding, ast.ImportFrom):
            return None
        module = imported_module(binding, context.project, context.path)
        alias = next(
            alias
            for alias in binding.names
            if (alias.asname or alias.name) == function.id
        )
        name = alias.name
    elif isinstance(function, ast.Attribute) and isinstance(function.value, ast.Name):
        binding = unique_binding(context, function.value.id)
        if not isinstance(binding, ast.Import):
            return None
        alias = next(
            alias
            for alias in binding.names
            if (alias.asname or alias.name.split(".")[0]) == function.value.id
        )
        if not alias.asname and "." in alias.name:
            return None
        module, name = alias.name, function.attr
    else:
        return None
    path = context.project.module_path(module) if module else None
    target_context = context.project.contexts.get(path)
    if target_context is None or not public_module(target_context):
        return None
    module_name = context.project.module_name(path)
    if (
        sum(
            context.project.module_name(other) == module_name
            for other in context.project.contexts
        )
        != 1
    ):
        return None
    target = unique_binding(target_context, name)
    if not isinstance(target, ast.FunctionDef):
        return None
    return target_context, target


def forwards(call, shape):
    positional = shape[0] + shape[1]
    return (
        len(call.args) == len(positional)
        and all(
            isinstance(value, ast.Name) and value.id == name
            for value, name in zip(call.args, positional)
        )
        and len(call.keywords) == len(shape[2])
        and all(
            keyword.arg == name
            and isinstance(keyword.value, ast.Name)
            and keyword.value.id == name
            for keyword, name in zip(call.keywords, shape[2])
        )
    )


def wrapper_target(context, node):
    shape = contract(context, node)
    if shape is None or len(node.body) != 1 or not isinstance(node.body[0], ast.Return):
        return None
    call = node.body[0].value
    if not isinstance(call, ast.Call) or not forwards(call, shape):
        return None
    root = call.func.value if isinstance(call.func, ast.Attribute) else call.func
    if isinstance(root, ast.Name) and root.id in sum(shape, ()):
        return None
    resolved = resolve_target(context, call)
    if resolved is None:
        return None
    owner, target = resolved
    if (
        target.name.startswith("_")
        or target is node
        or owner.tests
        or is_listed_entry(owner)
        or contract(owner, target) != shape
    ):
        return None
    return f"{node.name} -> {owner.project.module_name(owner.path)}.{target.name}"


def check(context):
    if context.tests or is_listed_entry(context):
        return []
    if any(
        isinstance(node, ast.Name) and node.id == "__all__"
        for node in ast.walk(context.tree)
    ):
        return []
    found = []
    for node in context.tree.body:
        if (
            isinstance(node, ast.FunctionDef)
            and node.name.startswith("_")
            and not node.name.startswith("__")
            and unique_binding(context, node.name) is node
        ):
            subject = wrapper_target(context, node)
            if subject is not None:
                found.append(finding(context.path, RULE, subject, node))
    return found
