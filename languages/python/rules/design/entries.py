import ast
import builtins

from design.astutil import own_nodes
from design.attributes import is_dunder
from design.calls import resolve_call
from design.decorators import is_neutral
from design.evaluate import evaluate
from design.frameworks import framework_match
from design.lookup import external_bases, linear
from design.symbols import Function, Klass, is_main_guard

BUILTIN_NAMES = set(dir(builtins))


def overrides_project_method(index, owner, name):
    for entry in linear(index, owner)[1:]:
        if isinstance(entry, Klass) and name in entry.members:
            return True
    return False


def overrides_framework_method(index, owner, name):
    return any(framework_match(base, name) for base in external_bases(index, owner))


def is_script_main(index, function):
    if function.owner is not None or function.name != "main":
        return False
    module = function.module
    return (
        module.has_main_guard
        or module.path.endswith("__main__.py")
        or module.path in index.entry_files
    )


def is_entry(index, function):
    if any(not is_neutral(name) for name in function.decorators):
        return True
    if function.id in index.callbacks:
        return True
    if function.owner is None:
        return is_script_main(index, function)
    name = function.name
    if is_dunder(name):
        return name != "__init__"
    return overrides_project_method(
        index, function.owner, name
    ) or overrides_framework_method(index, function.owner, name)


def callback_references(scope, call):
    values = list(call.args) + [keyword.value for keyword in call.keywords]
    found = []
    for value in values:
        if isinstance(value, (ast.Name, ast.Attribute)):
            resolved = evaluate(scope, value)
            if resolved is not None and resolved[0] == "func":
                found.append(resolved[1])
    return found


def is_builtin_call(scope, call):
    func = call.func
    return (
        isinstance(func, ast.Name)
        and func.id in BUILTIN_NAMES
        and func.id not in scope.sites
    )


def scopes_to_scan(index):
    for module in index.modules.values():
        yield index.module_scope(module), module.tree
        for function in module.all_functions:
            yield index.scope_of(function), function.node
        for klass in module.classes.values():
            for nested in klass.all_classes():
                for function in nested.functions:
                    yield index.scope_of(function), function.node


def main_guard_targets(index, module):
    scope = index.module_scope(module)
    found = set()
    for statement in module.tree.body:
        if not is_main_guard(statement):
            continue
        for node in ast.walk(statement):
            resolution = (
                resolve_call(scope, node) if isinstance(node, ast.Call) else None
            )
            if resolution is not None and resolution.target.name != "__init__":
                found.add(resolution.target.id)
    return found


def find_callbacks(index):
    callbacks = set()
    for module in index.modules.values():
        callbacks.update(main_guard_targets(index, module))
    for scope, root in scopes_to_scan(index):
        for node in own_nodes(root):
            if not isinstance(node, ast.Call) or is_builtin_call(scope, node):
                continue
            if resolve_call(scope, node) is None:
                callbacks.update(
                    f.id
                    for f in callback_references(scope, node)
                    if isinstance(f, Function)
                )
    return callbacks
