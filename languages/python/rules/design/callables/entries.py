import ast
import builtins

from design.callables.frameworks import framework_match
from design.calls.calls import resolve_call
from design.resolve.evaluate import evaluate
from design.resolve.lookup import external_bases, linear
from design.resolve.symbols import Function, Klass, is_main_guard
from design.support.astutil import body_nodes, own_nodes
from design.support.attributes import is_dunder
from design.support.decorators import is_neutral

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
    named = [v for v in values if isinstance(v, (ast.Name, ast.Attribute))]
    resolved = [evaluate(scope, value) for value in named]
    return [entry[1] for entry in resolved if entry is not None and entry[0] == "func"]


def is_builtin_call(scope, call):
    func = call.func
    return (
        isinstance(func, ast.Name)
        and func.id in BUILTIN_NAMES
        and func.id not in scope.sites
    )


def module_functions(module):
    functions = list(module.all_functions)
    for klass in module.classes.values():
        functions.extend(f for nested in klass.all_classes() for f in nested.functions)
    return functions


def scopes_to_scan(index):
    for module in index.modules.values():
        yield index.module_scope(module), module.tree
        for function in module_functions(module):
            yield index.scope_of(function), function.node


def main_guard_targets(index, module):
    scope = index.module_scope(module)
    guards = [s for s in module.tree.body if is_main_guard(s)]
    calls = [n for g in guards for n in ast.walk(g) if isinstance(n, ast.Call)]
    resolved = [resolve_call(scope, call) for call in calls]
    return {
        r.target.id for r in resolved if r is not None and r.target.name != "__init__"
    }


def find_callbacks(index):
    callbacks = set()
    for module in index.modules.values():
        callbacks.update(main_guard_targets(index, module))
    for scope, root in scopes_to_scan(index):
        for call in foreign_calls(scope, root):
            callbacks.update(
                f.id
                for f in callback_references(scope, call)
                if isinstance(f, Function)
            )
    return callbacks


def foreign_calls(scope, root):
    nodes = own_nodes(root) if isinstance(root, ast.Module) else body_nodes(root)
    calls = [n for n in nodes if isinstance(n, ast.Call)]
    return [
        call
        for call in calls
        if not is_builtin_call(scope, call) and resolve_call(scope, call) is None
    ]
