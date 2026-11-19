import ast

from checks.common import walk_statements
from effect_kinds.tables import WRITE
from transactions.cache_clients import root_of

DICT_FACTORIES = {"dict", "OrderedDict", "defaultdict", "WeakValueDictionary"}
CREATORS = {"create", "get_or_create", "update_or_create", "bulk_create", "merge"}
MAX_PASSES = 3


def is_dict_value(node):
    if isinstance(node, ast.Dict):
        return True
    if isinstance(node, ast.Call):
        name = (
            node.func.id
            if isinstance(node.func, ast.Name)
            else getattr(node.func, "attr", "")
        )
        return name in DICT_FACTORIES
    return False


def dict_names(context):
    def build(_):
        found = set()
        for node in ast.walk(context.tree):
            if not isinstance(node, (ast.Assign, ast.AnnAssign)) or node.value is None:
                continue
            if not is_dict_value(node.value):
                continue
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            found.update(
                t.id if isinstance(t, ast.Name) else t.attr
                for t in targets
                if isinstance(t, (ast.Name, ast.Attribute))
            )
        return found

    return context.project.memo(("local-caches", context.path), build)


def names_in(node):
    return {n.id for n in ast.walk(node) if isinstance(n, ast.Name)}


def bound_names(target):
    return names_in(target) if isinstance(target, (ast.Name, ast.Tuple)) else set()


def is_write(call, scope):
    function = call.func
    method = function.attr if isinstance(function, ast.Attribute) else ""
    return method in CREATORS or WRITE in scope.effects(call)


def seed_names(body, scope):
    found = set()
    for node in walk_statements(body):
        value = getattr(node, "value", None)
        value = value.value if isinstance(value, ast.Await) else value
        if isinstance(node, ast.Assign) and isinstance(value, ast.Call):
            if is_write(value, scope):
                found.update(n for t in node.targets for n in bound_names(t))
        if isinstance(node, ast.Call) and is_write(node, scope):
            found.update(a.id for a in node.args if isinstance(a, ast.Name))
            if isinstance(node.func, ast.Attribute) and isinstance(
                node.func.value, ast.Name
            ):
                found.add(node.func.value.id)
    return found


def written_names(body, scope):
    found = seed_names(body, scope)
    for _ in range(MAX_PASSES):
        for node in walk_statements(body):
            if isinstance(node, ast.Assign) and names_in(node.value) & found:
                found.update(n for t in node.targets for n in bound_names(t))
    return found


def stored_entries(body, context):
    names = dict_names(context)
    for node in walk_statements(body):
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if not isinstance(target, ast.Subscript):
                continue
            owner = target.value
            key = (
                owner.attr
                if isinstance(owner, ast.Attribute)
                else getattr(owner, "id", None)
            )
            if key in names and root_of(owner) is not None:
                yield node, key
