import ast

from checks.common import dotted_name

MUTABLE_CONSTRUCTORS = {
    "dict",
    "list",
    "set",
    "bytearray",
    "dict.fromkeys",
    "collections.defaultdict",
    "collections.OrderedDict",
    "collections.Counter",
    "collections.deque",
    "collections.ChainMap",
    "collections.UserDict",
    "collections.UserList",
    "weakref.WeakValueDictionary",
    "weakref.WeakKeyDictionary",
    "weakref.WeakSet",
    "queue.Queue",
    "queue.LifoQueue",
    "queue.PriorityQueue",
    "queue.SimpleQueue",
    "array.array",
    "defaultdict",
    "OrderedDict",
    "Counter",
    "deque",
}
INSTANCE_FACTORIES = {"types.SimpleNamespace", "SimpleNamespace"}
IMMUTABLE_BASES = {
    "Enum",
    "IntEnum",
    "StrEnum",
    "Flag",
    "IntFlag",
    "NamedTuple",
    "TypedDict",
    "Protocol",
    "Exception",
    "BaseException",
}


def is_mutable_value(node, aliases):
    if isinstance(
        node, (ast.Dict, ast.List, ast.Set, ast.DictComp, ast.ListComp, ast.SetComp)
    ):
        return True
    if isinstance(node, ast.Call):
        function = (
            node.func.value if isinstance(node.func, ast.Subscript) else node.func
        )
        return dotted_name(function, aliases) in MUTABLE_CONSTRUCTORS
    return False


def is_frozen(node):
    return any(
        isinstance(decorator, ast.Call)
        and any(
            keyword.arg == "frozen"
            and isinstance(keyword.value, ast.Constant)
            and keyword.value.value is True
            for keyword in decorator.keywords
        )
        for decorator in node.decorator_list
    )


def is_mutable_class(node, aliases):
    bases = {
        (dotted_name(base, aliases) or "").rsplit(".", 1)[-1] for base in node.bases
    }
    return not is_frozen(node) and not (
        bases & IMMUTABLE_BASES or any(base.endswith("Error") for base in bases)
    )


def assigned_pairs(statement):
    if isinstance(statement, ast.AnnAssign) and statement.value is not None:
        return [(statement.target, statement.value)]
    if not isinstance(statement, ast.Assign):
        return []
    pairs = []
    for target in statement.targets:
        value = statement.value
        if isinstance(target, ast.Tuple) and isinstance(value, ast.Tuple):
            pairs.extend(zip(target.elts, value.elts))
        else:
            pairs.append((target, value))
    return pairs


def class_attributes(node, aliases):
    if is_frozen(node) or not is_mutable_class(node, aliases) or node.decorator_list:
        return {}
    found = {}
    for statement in node.body:
        for target, value in assigned_pairs(statement):
            if isinstance(target, ast.Name) and is_mutable_value(value, aliases):
                found[f"{node.name}.{target.id}"] = statement
    return found


def project_class(call, context):
    name = dotted_name(call.func, context.aliases) or ""
    if name in INSTANCE_FACTORIES:
        return True
    located = context.project.locate(name) if "." in name else (context.path, name)
    owner = context.project.contexts.get(located[0]) if located else None
    if owner is None:
        return False
    return any(
        isinstance(node, ast.ClassDef)
        and node.name == located[1]
        and is_mutable_class(node, owner.aliases)
        for node in owner.tree.body
    )


def module_tables(context):
    collections, instances, attributes = {}, {}, {}
    for statement in context.tree.body:
        for target, value in assigned_pairs(statement):
            if not isinstance(target, ast.Name) or target.id == "__all__":
                continue
            if is_mutable_value(value, context.aliases):
                collections.setdefault(target.id, statement)
            elif isinstance(value, ast.Call) and project_class(value, context):
                instances.setdefault(target.id, statement)
        if isinstance(statement, ast.ClassDef):
            attributes.update(class_attributes(statement, context.aliases))
    return collections, instances, attributes


def tables_of(project, path):
    def build(_):
        return module_tables(project.contexts[path])

    return project.memo(("state", path), build)
