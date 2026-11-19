import ast

from checks.common import dotted_name


def callee_key(call, context):
    func = call.func
    if (
        isinstance(func, ast.Attribute)
        and isinstance(func.value, ast.Name)
        and func.value.id == "self"
    ):
        return context.path, func.attr
    full = dotted_name(func, context.aliases) or ""
    module, _, name = full.rpartition(".")
    if not module:
        return context.path, name
    return context.project.module_path(module), name
