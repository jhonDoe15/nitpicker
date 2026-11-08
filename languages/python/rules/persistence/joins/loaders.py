import ast

from checks.common import dotted_name, last_name
from security.resolve.scopes import values_of, where_of

JOINED = {"joinedload", "contains_eager"}
LOADERS = JOINED | {
    "selectinload",
    "subqueryload",
    "immediateload",
    "lazyload",
    "noload",
    "raiseload",
    "defaultload",
}
ORM_ROOTS = ("sqlalchemy.", "sqlmodel.", "flask_sqlalchemy.")
LOAD = "Load"
OPTIONS = "options"
SELECTS = {"select", "query"}
ATTRIBUTE_WRAPPERS = {"of_type", "and_"}
DB_RECEIVER = "db"
FLASK_EXTENSION = "SQLAlchemy"
MAX_HOPS = 4


class Segment:
    def __init__(self, strategy, owner, name, node):
        self.strategy = strategy
        self.owner = owner
        self.name = name
        self.node = node


def is_orm_function(func, context):
    name = dotted_name(func, context.aliases) or ""
    if name.startswith(ORM_ROOTS):
        return True
    receiver = func.value if isinstance(func, ast.Attribute) else None
    if not (isinstance(receiver, ast.Name) and receiver.id == DB_RECEIVER):
        return False
    if receiver.id in context.aliases[0]:
        return True
    return any(
        last_name(value.func) == FLASK_EXTENSION
        for value, _ in values_of(receiver.id, where_of(receiver, context))
        if isinstance(value, ast.Call)
    )


def resolved_name(func, context):
    return (dotted_name(func, context.aliases) or last_name(func) or "").rsplit(".", 1)[-1]


def attribute_parts(node):
    while (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in ATTRIBUTE_WRAPPERS
    ):
        node = node.func.value
    if isinstance(node, ast.Attribute):
        return [(last_name(node.value), node.attr)]
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return [(None, part) for part in node.value.split(".")]
    return []


def segments_of(strategy, call):
    return [
        Segment(strategy, owner, name, argument)
        for argument in call.args
        for owner, name in attribute_parts(argument)
    ]


def loader_base(node, context):
    if not isinstance(node, ast.Call):
        return None
    func = node.func
    if isinstance(func, (ast.Name, ast.Attribute)) and is_orm_function(func, context):
        name = resolved_name(func, context)
        if name in LOADERS:
            return segments_of(name, node)
        if name == LOAD:
            return []
    return None


def loader_path(node, context):
    pending = []
    while True:
        base = loader_base(node, context)
        if base is not None:
            return base + [segment for chunk in reversed(pending) for segment in chunk]
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
            return None
        if node.func.attr not in LOADERS:
            return None
        pending.append(segments_of(node.func.attr, node))
        node = node.func.value


def is_chained(node, context):
    parent = context.parents.get(id(node))
    holder = context.parents.get(id(parent))
    return (
        isinstance(parent, ast.Attribute)
        and parent.value is node
        and isinstance(holder, ast.Call)
        and holder.func is parent
    )


def topmost_options(node, context):
    current = node
    while is_chained(current, context):
        holder = context.parents[id(context.parents[id(current)])]
        if holder.func.attr == OPTIONS:
            return False
        current = holder
    return True


def root_of(node):
    while isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        if node.func.attr in SELECTS and node.args:
            return last_name(node.args[0])
        node = node.func.value
    if isinstance(node, ast.Call) and last_name(node.func) in SELECTS and node.args:
        return last_name(node.args[0])
    if isinstance(node, ast.Attribute) and node.attr == "query":
        return last_name(node.value)
    return None


def earlier_value(name, context):
    values = [
        value
        for value, place in values_of(name.id, where_of(name, context))
        if place.context is context and value.lineno < name.lineno
    ]
    return max(values, key=lambda value: value.lineno) if values else None


def chain_loaders(node, context):
    loaders = []
    current, root, hops = node, None, 0
    while hops <= MAX_HOPS:
        while isinstance(current, ast.Call) and isinstance(current.func, ast.Attribute):
            if current.func.attr == OPTIONS:
                loaders = list(current.args) + loaders
            root = root or root_of(current)
            current = current.func.value
        root = root or root_of(current)
        earlier = earlier_value(current, context) if isinstance(current, ast.Name) else None
        if earlier is None:
            break
        current, hops = earlier, hops + 1
    return loaders, root


def keyword_loaders(node):
    for keyword in node.keywords:
        if keyword.arg == OPTIONS and isinstance(keyword.value, (ast.List, ast.Tuple)):
            return list(keyword.value.elts), (last_name(node.args[0]) if node.args else None)
    return [], None


def option_sets(context):
    found = []
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if isinstance(func, ast.Attribute) and func.attr == OPTIONS and topmost_options(node, context):
            found.append(chain_loaders(node, context))
        loaders, root = keyword_loaders(node)
        if loaders:
            found.append((loaders, root))
    return found


def held_loader(loader, context):
    if not isinstance(loader, ast.Name):
        return loader
    values = values_of(loader.id, where_of(loader, context))
    return values[0][0] if len(values) == 1 and values[0][1].context is context else loader


def loader_paths(loaders, context):
    paths = []
    for loader in loaders:
        path = loader_path(held_loader(loader, context), context)
        if path:
            paths.append(path)
    return paths
