import ast

from checks.common import dotted_name
from effect_kinds.specs import (
    BOTO_ROOTS,
    CONFLICT,
    DERIVE_PASSES,
    FACTORIES,
    SELF_PREFIXES,
    UNBOUND,
    bound_value,
    call_name_of,
    holds_entry,
    is_value_path,
    matching_key,
    spec_of_value,
)
from effect_kinds.tables import MESSAGE_MODULES, MODULE_KINDS, PARTIALS, TASK_DECORATORS


def target_key(target):
    if isinstance(target, ast.Name):
        return target.id
    if isinstance(target, ast.Attribute) and isinstance(target.value, ast.Name):
        if target.value.id in {"self", "cls"}:
            return f"{target.value.id}.{target.attr}"
    return None


def binding_pairs(node):
    if isinstance(node, ast.Assign):
        return [(t, node.value) for t in node.targets]
    if isinstance(node, ast.AnnAssign) and node.value is not None:
        return [(node.target, node.value)]
    if isinstance(node, (ast.With, ast.AsyncWith)):
        return [(i.optional_vars, i.context_expr) for i in node.items]
    return []


FUNCTION_NODES = (ast.FunctionDef, ast.AsyncFunctionDef)


def scope_chain(node, parents):
    chain = []
    while id(node) in parents:
        node = parents[id(node)]
        if isinstance(node, FUNCTION_NODES):
            chain.append(id(node))
    return [*chain, None]


def lookup_spec(clients, key, chain):
    slots = clients.get(key)
    if not slots:
        return None
    if key.startswith(SELF_PREFIXES):
        found = list(slots.values())
        return found[0] if all(spec == found[0] for spec in found) else CONFLICT
    for scope in chain:
        if scope in slots:
            spec = slots[scope]
            return agreed(slots) if spec is UNBOUND else spec
    return None


def is_client(clients, name):
    return any(spec is not UNBOUND for spec in clients.get(name, {}).values())


def agreed(slots):
    found = [spec for spec in slots.values() if spec is not UNBOUND]
    if not found:
        return None
    return found[0] if all(spec == found[0] for spec in found) else None


def scoped(clients, chain):
    return lambda name: lookup_spec(clients, name, chain)


def bind_spec(clients, key, scope, spec):
    slots = clients.setdefault(key, {})
    old = slots.get(scope)
    unset = old is None or old is UNBOUND
    slots[scope] = spec if unset or old == spec else CONFLICT


def bind_parameters(clients, tree, aliases):
    for node in ast.walk(tree):
        if not isinstance(node, FUNCTION_NODES):
            continue
        arguments = node.args
        every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
        for argument in every:
            if argument.arg in {"self", "cls"}:
                continue
            annotation = argument.annotation
            spec = (
                FACTORIES.get(dotted_name(annotation, aliases)) if annotation else None
            )
            bind_spec(clients, argument.arg, id(node), spec or UNBOUND)


def imported_module_paths(tree):
    paths = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            paths.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            paths.append(node.module)
            paths.extend(f"{node.module}.{alias.name}" for alias in node.names)
    return paths


def static_names(context, paths):
    aliases = context.aliases
    imports_boto = any(matching_key(path, dict.fromkeys(BOTO_ROOTS)) for path in paths)
    clients, partials = {}, {}
    pairs = [
        (target_key(target), value, scope_chain(node, context.parents))
        for node in ast.walk(context.tree)
        for target, value in binding_pairs(node)
        if target is not None and target_key(target) is not None
    ]
    bind_parameters(clients, context.tree, aliases)
    for _ in range(DERIVE_PASSES):
        for key, value, chain in pairs:
            spec = spec_of_value(value, aliases, imports_boto, scoped(clients, chain))
            if spec is not None:
                bind_spec(clients, key, chain[0], spec)
            elif call_name_of(value, aliases) in PARTIALS and bound_value(value).args:
                partials[key] = bound_value(value).args[0]
    return clients, partials


def imported_kinds(tree):
    kinds = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                add_module_kind(kinds, alias)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            add_from_kind(kinds, node)
    return kinds


def add_module_kind(kinds, alias):
    key = matching_key(alias.name, MODULE_KINDS)
    if key is None:
        return
    if alias.asname:
        kinds[alias.asname] = (MODULE_KINDS[key], ())
        return
    root = alias.name.split(".")[0]
    previous = kinds.get(root)
    if previous is None or previous[1]:
        kinds[root] = (MODULE_KINDS[key], tuple(key.split(".")[1:]))


def add_from_kind(kinds, node):
    module_key = matching_key(node.module, MODULE_KINDS)
    for alias in node.names:
        path = f"{node.module}.{alias.name}"
        key = module_key or matching_key(path, MODULE_KINDS)
        if key is not None and (not is_value_path(path) or holds_entry(path)):
            kinds[alias.asname or alias.name] = (MODULE_KINDS[key], ())


def message_methods(paths):
    methods = set()
    for path in paths:
        key = matching_key(path, MESSAGE_MODULES)
        if key is not None:
            methods |= MESSAGE_MODULES[key]
    return methods


def is_task_decorator(decorator, context):
    node = decorator.func if isinstance(decorator, ast.Call) else decorator
    name = dotted_name(node, context.aliases) or ""
    return name in TASK_DECORATORS or name.endswith(".task") or name == "task"


def imports_celery(context):
    return any(
        value.startswith("celery")
        for table in context.aliases[:2]
        for value in table.values()
    )


def task_names(project):
    def build(_):
        found = set()
        for context in project.contexts.values():
            if not imports_celery(context):
                continue
            for node in ast.walk(context.tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    if any(is_task_decorator(d, context) for d in node.decorator_list):
                        found.add(node.name)
        return found

    return project.memo("celery-tasks", build)
