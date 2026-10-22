import ast

from checks.common import dotted_name, own_nodes, words_of
from effects.clients import (
    CLIENT_OBJECTS,
    CONSTRUCTORS,
    DERIVING,
    imported_kinds,
    imported_module_paths,
    message_methods,
    static_names,
    task_names,
)
from effects.tables import (
    DATABASE,
    GETTER_LOOKUPS,
    GENERIC_MESSAGE_METHODS,
    MESSAGE,
    METHOD_NAMES,
    METHOD_PREFIXES,
    OWNER_KINDS,
    PRIORITY,
    PRODUCER_WORDS,
    REMOTE,
    TASK_METHODS,
)

PASSES = 6
SELF_NAMES = {"self", "cls"}


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


def primary(effects):
    return next((kind for kind in PRIORITY if kind in effects), None)


def spec_kind(spec, method):
    if method in spec.methods:
        return spec.methods[method]
    if spec.default is None:
        return None
    return spec.default if not spec.named or is_input_output_method(method) else None


def name_kind(names):
    owners = names[:-1]
    if not owners or not is_input_output_method(names[-1]):
        return None
    for owner in reversed(owners):
        kind = OWNER_KINDS.get((words_of(owner) or [""])[-1])
        if kind is not None:
            return kind
    return None


class IoIndex:
    def __init__(self):
        self.functions = {}
        self.definitions = {}

    def method_effects(self, name):
        keys = self.definitions.get(name, [])
        if not keys or not all(key in self.functions for key in keys):
            return {}
        common = set.intersection(*(set(self.functions[key]) for key in keys))
        return {kind: self.functions[keys[0]][kind] for kind in common}


def scope_facts(context):
    paths = imported_module_paths(context.tree)
    clients, partials = static_names(context, paths)
    return imported_kinds(context.tree), clients, partials, message_methods(paths)


class IoScope:
    def __init__(self, context, index):
        self.context = context
        self.index = index
        self.aliases = context.aliases
        facts = context.project.memo(
            ("io-facts", context.path), lambda _: scope_facts(context)
        )
        self.imported, self.clients, self.partials, self.methods = facts
        self.tasks = task_names(context.project)

    def client_spec(self, names):
        if len(names) < 2:
            return None
        spec = self.clients.get(names[0])
        if spec is None and len(names) > 2 and names[0] in SELF_NAMES:
            spec = self.clients.get(f"{names[0]}.{names[1]}")
        if spec is None:
            dotted = self.aliases[0].get(names[0]) or self.aliases[1].get(names[0])
            spec = CLIENT_OBJECTS.get(dotted)
        return spec

    def is_task_call(self, names):
        if len(names) < 2 or names[-1] not in TASK_METHODS:
            return False
        root = self.aliases[0].get(names[0]) or self.aliases[1].get(names[0]) or ""
        return root.startswith("celery") or any(n in self.tasks for n in names[:-1])

    def is_message_call(self, names):
        method = names[-1]
        if len(names) < 2 or method not in self.methods:
            return False
        if method not in GENERIC_MESSAGE_METHODS:
            return True
        return any(
            word in PRODUCER_WORDS for owner in names[:-1] for word in words_of(owner)
        )

    def direct_kind(self, names):
        spec = self.client_spec(names)
        if spec is not None:
            return None if names[-1] in DERIVING else spec_kind(spec, names[-1])
        if self.is_task_call(names) or self.is_message_call(names):
            return MESSAGE
        entry = self.imported.get(names[0])
        prefix = list(entry[1]) if entry else []
        if entry and names[1 : 1 + len(prefix)] == prefix and len(names) > len(prefix):
            return entry[0]
        return None

    def function_key(self, node):
        name = dotted_name(node, self.aliases) or ""
        located = self.context.project.locate(name) if "." in name else None
        return located if located else (self.context.path, name)

    def callable_effects(self, node, names, text):
        if not names:
            return {}
        if isinstance(node, ast.Name) and node.id in self.partials:
            wrapped = self.partials[node.id]
            if isinstance(wrapped, ast.Name) and wrapped.id == node.id:
                return {}
            inner_names = chain_names(wrapped)
            inner = self.callable_effects(
                wrapped, inner_names, ".".join(inner_names) + "()"
            )
            return {kind: (text,) + path for kind, path in inner.items()}
        if dotted_name(node, self.aliases) in CONSTRUCTORS:
            return {}
        kind = self.direct_kind(names)
        if kind is not None:
            return {kind: (text,)}
        summary = self.index.functions.get(self.function_key(node), {})
        return {kind: (text,) + path for kind, path in summary.items()}

    def self_effects(self, call, names, text):
        if len(names) < 2 or names[0] not in SELF_NAMES:
            return {}
        if len(names) == 2:
            owner = enclosing_class(call, self.context.parents)
            key = (self.context.path, f"{owner.name}.{names[1]}") if owner else None
            summary = self.index.functions.get(key, {})
        else:
            summary = self.index.method_effects(names[-1])
        return {kind: (text,) + path for kind, path in summary.items()}

    def effects(self, call):
        names = chain_names(call.func)
        if not names:
            return {}
        text = ".".join(names) + "()"
        found = self.callable_effects(call.func, names, text)
        found = found or self.self_effects(call, names, text)
        if found:
            return found
        kind = name_kind(names)
        return {kind: (text,)} if kind is not None else {}

    def map_effects(self, call):
        if not (
            isinstance(call.func, ast.Name) and call.func.id == "map" and call.args
        ):
            return {}
        names = chain_names(call.args[0])
        return self.callable_effects(call.args[0], names, ".".join(names) + "()")

    def kind(self, call):
        return primary(self.effects(call))

    def is_io(self, call):
        return primary(self.effects(call)) in {DATABASE, REMOTE}

    def maps_io(self, call):
        return primary(self.map_effects(call)) in {DATABASE, REMOTE}


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
            changed = False
            for context in project.contexts.values():
                if not context.tests:
                    changed = mark_io_functions(context, index) or changed
            if not changed:
                break
        return index

    return project.memo("io-index", build)


def calls_in_order(function):
    calls = [node for node in own_nodes(function) if isinstance(node, ast.Call)]
    return sorted(calls, key=lambda node: (node.lineno, node.col_offset))


def mark_io_functions(context, index):
    scope = IoScope(context, index)
    changed = False
    for qualified, _name, function in methods_and_functions(context.tree):
        summary = index.functions.get((context.path, qualified), {})
        for call in calls_in_order(function):
            for kind, path in scope.effects(call).items():
                if kind not in summary:
                    summary[kind] = path
                    index.functions[(context.path, qualified)] = summary
                    changed = True
    return changed
