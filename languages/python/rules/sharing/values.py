import ast

from checks.common import dotted_name
from signatures.scopes import key_of

RULE = "shared-state-mutation"
LITERAL_KINDS = {
    ast.List: "list",
    ast.ListComp: "list",
    ast.Dict: "dict",
    ast.DictComp: "dict",
    ast.Set: "set",
    ast.SetComp: "set",
}
CALL_KINDS = {
    "list": "list",
    "sorted": "list",
    "dict": "dict",
    "defaultdict": "dict",
    "collections.defaultdict": "dict",
    "collections.OrderedDict": "dict",
    "collections.Counter": "dict",
    "set": "set",
    "collections.deque": "deque",
    "bytearray": "bytearray",
}


def mutable_kind(value, aliases):
    for node_type, kind in LITERAL_KINDS.items():
        if isinstance(value, node_type):
            return kind
    if isinstance(value, ast.Call):
        return CALL_KINDS.get(dotted_name(value.func, aliases))
    return None


def module_bindings(tree):
    counts, values = {}, {}
    for statement in tree.body:
        if isinstance(statement, ast.Assign):
            pairs = [(target, statement.value) for target in statement.targets]
        elif isinstance(statement, ast.AnnAssign) and statement.value is not None:
            pairs = [(statement.target, statement.value)]
        else:
            continue
        for target, value in pairs:
            if isinstance(target, ast.Name):
                counts[target.id] = counts.get(target.id, 0) + 1
                values[target.id] = value
    return {name: values[name] for name, count in counts.items() if count == 1}


def shared_values(project):
    def build(_):
        found = {}
        for path, context in project.contexts.items():
            if path in project.test_files:
                continue
            bindings = module_bindings(context.tree)
            kinds = {name: mutable_kind(value, context.aliases) for name, value in bindings.items()}
            found[path] = {name: kind for name, kind in kinds.items() if kind}
        return found

    return project.memo(("shared-module-values",), build)


def binds_locally(function, name):
    if function is None:
        return False
    arguments = function.args
    every = [*arguments.posonlyargs, *arguments.args, *arguments.kwonlyargs]
    if name in {argument.arg for argument in every}:
        return True
    return any(
        isinstance(node, ast.Name) and node.id == name and isinstance(node.ctx, ast.Store)
        for node in ast.walk(function)
    )


def imported_value(node, context):
    full = dotted_name(node, context.aliases)
    module, _, name = (full or "").rpartition(".")
    path = context.project.module_path(module) if module else None
    return shared_values(context.project).get(path, {}).get(name)


def shared_value(node, context, function):
    if isinstance(node, ast.Name):
        local = shared_values(context.project).get(context.path, {}).get(node.id)
        if local and not binds_locally(function, node.id):
            return local
        return None if binds_locally(function, node.id) else imported_value(node, context)
    if isinstance(node, ast.Attribute) and key_of(node) is None:
        return imported_value(node, context)
    return None
