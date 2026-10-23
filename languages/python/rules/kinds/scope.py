import ast

from checks.common import dotted_name, words_of
from effects.clients import (
    CLIENT_OBJECTS,
    CONSTRUCTORS,
    NO_KIND_METHODS,
    imported_kinds,
    imported_module_paths,
    is_value_path,
    message_methods,
    static_names,
    task_names,
)
from effects.idempotency import unsafe_tags
from effects.statements import sql_tags
from effects.tables import (
    DATABASE,
    GENERIC_MESSAGE_METHODS,
    MESSAGE,
    PRODUCER_WORDS,
    REMOTE,
    TASK_METHODS,
    WRITE,
)
from effects.writes import (
    PEEWEE_ROOTS,
    database_receiver,
    is_model,
    is_peewee,
    is_write,
)
from kinds.names import (
    SELF_NAMES,
    call_text,
    chain_names,
    name_kind,
    primary,
    spec_kind,
)
from kinds.receivers import callee_of, is_executor, plain_receiver, shares_method
from kinds.sites import outer_calls

ITERATING = {"map", "filter"}
KEYED = {"sorted", "min", "max"}


def scope_facts(context):
    paths = imported_module_paths(context.tree)
    clients, partials = static_names(context, paths)
    roots = {path.split(".")[0] for path in paths}
    django = any(path.startswith("django.db") for path in paths)
    flags = (django, "stripe" in roots, bool(roots & PEEWEE_ROOTS))
    methods = message_methods(paths)
    return imported_kinds(context.tree), clients, partials, methods, flags


class IoScope:
    def __init__(self, context, index):
        self.context = context
        self.index = index
        self.aliases = context.aliases
        facts = context.project.memo(
            ("io-facts", context.path), lambda _: scope_facts(context)
        )
        self.imported, self.clients, self.partials, self.methods, flags = facts
        self.django, self.stripe, self.peewee = flags
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

    def module_path(self, names):
        root = self.aliases[0].get(names[0]) or self.aliases[1].get(names[0])
        return ".".join([root or names[0], *names[1:]])

    def direct_kind(self, names, spec):
        if spec is not None:
            return None if names[-1] in NO_KIND_METHODS else spec_kind(spec, names[-1])
        if self.is_task_call(names) or self.is_message_call(names):
            return MESSAGE
        entry = self.imported.get(names[0])
        prefix = list(entry[1]) if entry else []
        if entry and names[1 : 1 + len(prefix)] == prefix and len(names) > len(prefix):
            return None if is_value_path(self.module_path(names)) else entry[0]
        return None

    def model_kind(self, names):
        if is_model(names, self.django) or self.peewee and is_peewee(names):
            return DATABASE
        return None

    def callee(self, node):
        key = id(node)
        if key not in self.index.callees:
            self.index.callees[key] = callee_of(node, self.context)
        return self.index.callees[key]

    def project_effects(self, node, names):
        callee = self.callee(node)
        if callee is not None:
            return self.index.functions.get(id(callee), {})
        if len(names) >= 3 and names[0] in SELF_NAMES:
            if shares_method(node, self.context):
                return self.index.method_effects(names[-1])
        return {}

    def callable_effects(self, node, names, text, seen=frozenset()):
        if not names:
            return {}
        if isinstance(node, ast.Name) and node.id in self.partials:
            if node.id in seen:
                return {}
            wrapped = self.partials[node.id]
            inner_names = chain_names(wrapped)
            inner = self.callable_effects(
                wrapped, inner_names, call_text(wrapped), seen | {node.id}
            )
            return {kind: (text,) + path for kind, path in inner.items()}
        if dotted_name(node, self.aliases) in CONSTRUCTORS:
            return {}
        spec = self.client_spec(names)
        kind = self.direct_kind(names, spec)
        if kind is not None:
            return {kind: (text,)}
        if spec is not None:
            return {}
        summary = self.project_effects(node, names)
        if summary:
            return {kind: (text,) + path for kind, path in summary.items()}
        kind = name_kind(names) or self.model_kind(names)
        return {kind: (text,)} if kind is not None else {}

    def site_effects(self, call, site, text):
        names = chain_names(call.func)
        if not names or plain_receiver(call.func, self.context):
            return {}
        found = self.callable_effects(call.func, names, text)
        spec = self.client_spec(names)
        return {**self.direct_tags(call, names, (spec, site, found), text), **found}

    def direct_tags(self, call, names, facts, text):
        spec, site, found = facts
        kind = self.direct_kind(names, spec)
        if spec is None:
            kind = kind or name_kind(names) or self.model_kind(names)
        database = kind == DATABASE or database_receiver(names, spec)
        tags = {WRITE: (text,)} if is_write(names, kind, spec, self.django) else {}
        flags = (database, DATABASE in found)
        tags.update(sql_tags(call, names, flags, site, self.context, text))
        facts = (site, self.context, self.stripe)
        tags.update(unsafe_tags(call, names, kind, facts, text))
        return tags

    def effects(self, call):
        return self.site_effects(call, call, call_text(call))

    def reference_effects(self, reference, call):
        synthetic = ast.Call(func=reference, args=call.args[1:], keywords=call.keywords)
        synthetic = ast.copy_location(synthetic, call)
        return self.site_effects(synthetic, call, call_text(reference))

    def iterated_callable(self, call):
        function = call.func
        if isinstance(function, ast.Name) and function.id in ITERATING:
            return call.args[0] if call.args else None, False
        if isinstance(function, ast.Name) and function.id in KEYED:
            keys = [k.value for k in call.keywords if k.arg == "key"]
            return keys[0] if keys else None, False
        if (
            isinstance(function, ast.Attribute)
            and function.attr == "map"
            and call.args
            and is_executor(function.value, self.context)
        ):
            return call.args[0], True
        return None, False

    def map_effects(self, call):
        argument, executor = self.iterated_callable(call)
        if argument is None:
            return {}, False
        if isinstance(argument, ast.Lambda):
            found = {}
            for inner in outer_calls(ast.walk(argument.body)):
                for kind, path in self.effects(inner).items():
                    found.setdefault(kind, path)
            return found, executor
        names = chain_names(argument)
        return self.callable_effects(argument, names, call_text(argument)), executor

    def submitted_effects(self, call):
        function = call.func
        if not (
            isinstance(function, ast.Attribute)
            and function.attr == "submit"
            and call.args
            and is_executor(function.value, self.context)
        ):
            return {}
        names = chain_names(call.args[0])
        return self.callable_effects(call.args[0], names, call_text(call.args[0]))

    def kind(self, call):
        return primary(self.effects(call))

    def is_io(self, call):
        return primary(self.effects(call)) in {DATABASE, REMOTE}
