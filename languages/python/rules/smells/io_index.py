import ast

from checks.common import dotted_name, own_nodes, words_of
from index.clients import PER_ITEM_CLIENT_FACTORIES

INPUT_OUTPUT_MODULES = {
    "requests",
    "httpx",
    "aiohttp",
    "urllib3",
    "urllib.request",
    "http.client",
    "sqlite3",
    "psycopg",
    "psycopg2",
    "pymysql",
    "asyncpg",
    "pymongo",
    "redis",
    "boto3",
}
OWNER_WORDS = {
    "repo",
    "repository",
    "dao",
    "db",
    "database",
    "session",
    "cursor",
    "conn",
    "connection",
    "client",
    "pool",
    "http",
    "api",
    "gateway",
    "objects",
    "collection",
    "redis",
}
METHOD_PREFIXES = {
    "find",
    "fetch",
    "load",
    "read",
    "query",
    "select",
    "insert",
    "update",
    "upsert",
    "delete",
    "remove",
    "save",
    "create",
    "count",
    "execute",
    "executemany",
    "write",
    "list",
}
GETTER_LOOKUPS = {"by", "all", "many", "one", "page"}
METHOD_NAMES = {
    "exists",
    "send",
    "post",
    "put",
    "patch",
    "request",
    "raw",
    "run",
    "filter",
    "first",
    "all",
    "one",
    "one_or_none",
    "scalar",
    "scalars",
    "commit",
    "refresh",
    "get_or_create",
    "update_or_create",
    "bulk_create",
    "bulk_update",
}
PARTIALS = {"functools.partial", "partial"}
PASSES = 4


def is_input_output_method(name):
    first, *rest = words_of(name) or [""]
    if first == "get":
        return not rest or rest[0] in GETTER_LOOKUPS
    return name in METHOD_NAMES or first in METHOD_PREFIXES


def chain_names(node):
    names = []
    while True:
        if isinstance(node, ast.Await):
            node = node.value
        elif isinstance(node, ast.Call):
            node = node.func
        elif isinstance(node, ast.Attribute):
            names.insert(0, node.attr)
            node = node.value
        elif isinstance(node, ast.Subscript):
            node = node.value
        else:
            if isinstance(node, ast.Name):
                names.insert(0, node.id)
            return names


def imported_input_output_names(tree):
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name in INPUT_OUTPUT_MODULES:
                    names.add((alias.asname or alias.name).split(".")[0])
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            if node.module in INPUT_OUTPUT_MODULES:
                names.update(alias.asname or alias.name for alias in node.names)
    return names


def bound_value(node):
    return node.value if isinstance(node, ast.Await) else node


def call_name_of(value, aliases):
    value = bound_value(value)
    return dotted_name(value.func, aliases) if isinstance(value, ast.Call) else None


def static_names(context):
    aliases = context.aliases
    clients, partials = set(), {}
    for node in ast.walk(context.tree):
        pairs = []
        if isinstance(node, ast.Assign):
            pairs = [(t, node.value) for t in node.targets]
        elif isinstance(node, (ast.With, ast.AsyncWith)):
            pairs = [(i.optional_vars, i.context_expr) for i in node.items]
        for target, value in pairs:
            if not isinstance(target, ast.Name):
                continue
            name = call_name_of(value, aliases)
            if name in PER_ITEM_CLIENT_FACTORIES:
                clients.add(target.id)
            elif name in PARTIALS and bound_value(value).args:
                partials[target.id] = bound_value(value).args[0]
    return clients, partials


def enclosing_class(node, parents):
    while id(node) in parents:
        node = parents[id(node)]
        if isinstance(node, ast.ClassDef):
            return node
    return None


def methods_and_functions(tree):
    found = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            found.append((node.name, node.name, node))
        elif isinstance(node, ast.ClassDef):
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    found.append((f"{node.name}.{item.name}", item.name, item))
    return found


class IoIndex:
    def __init__(self):
        self.functions = set()
        self.definitions = {}

    def method_does_io(self, name):
        keys = self.definitions.get(name, [])
        return bool(keys) and all(key in self.functions for key in keys)


class IoScope:
    def __init__(self, context, index):
        self.context = context
        self.index = index
        self.aliases = context.aliases
        self.imported = imported_input_output_names(context.tree)
        self.clients, self.partials = context.project.memo(
            ("io-static", context.path), lambda _: static_names(context)
        )

    def is_callable_io(self, node):
        names = chain_names(node)
        if not names:
            return False
        if isinstance(node, ast.Name) and node.id in self.partials:
            wrapped = self.partials[node.id]
            return not (isinstance(wrapped, ast.Name) and wrapped.id == node.id) and (
                self.is_callable_io(wrapped)
            )
        if names[0] in self.imported or names[0] in self.clients:
            return True
        return self.is_project_function(node)

    def is_project_function(self, node):
        name = dotted_name(node, self.aliases) or ""
        located = self.context.project.locate(name) if "." in name else None
        key = located if located else (self.context.path, name)
        return key in self.index.functions

    def is_self_call(self, call):
        names = chain_names(call.func)
        if not names or names[0] not in {"self", "cls"} or len(names) < 2:
            return False
        if len(names) == 2:
            owner = enclosing_class(call, self.context.parents)
            key = (self.context.path, f"{owner.name}.{names[1]}") if owner else None
            return key in self.index.functions
        return self.index.method_does_io(names[-1])

    def is_io(self, call):
        names = chain_names(call.func)
        if not names:
            return False
        if self.is_callable_io(call.func) or self.is_self_call(call):
            return True
        owners = names[:-1]
        return (
            bool(owners)
            and is_input_output_method(names[-1])
            and any((words_of(owner) or [""])[-1] in OWNER_WORDS for owner in owners)
        )

    def maps_io(self, call):
        return (
            isinstance(call.func, ast.Name)
            and call.func.id == "map"
            and bool(call.args)
            and self.is_callable_io(call.args[0])
        )


def io_index(project):
    def build(_):
        index = IoIndex()
        for context in project.contexts.values():
            if context.tests:
                continue
            for qualified, name, _node in methods_and_functions(context.tree):
                if qualified != name:
                    index.definitions.setdefault(name, []).append(
                        (context.path, qualified)
                    )
        for _ in range(PASSES):
            before = len(index.functions)
            for context in project.contexts.values():
                if not context.tests:
                    mark_io_functions(context, index)
            if len(index.functions) == before:
                break
        return index

    return project.memo("io-index", build)


def mark_io_functions(context, index):
    scope = IoScope(context, index)
    for qualified, _name, function in methods_and_functions(context.tree):
        key = (context.path, qualified)
        if key not in index.functions and any(
            isinstance(node, ast.Call) and scope.is_io(node)
            for node in own_nodes(function)
        ):
            index.functions.add(key)
