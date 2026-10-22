import ast
from collections import namedtuple

from checks.common import dotted_name, words_of
from effects.tables import DATABASE

Scope = namedtuple("Scope", "kind label body")
TRANSACTIONS = {
    "django.db.transaction.atomic",
    "django.db.transaction.commit_on_success",
}
TRANSACTION_METHODS = {"begin", "begin_nested", "transaction", "atomic"}
DATABASE_WORDS = {
    "session",
    "engine",
    "conn",
    "connection",
    "db",
    "database",
    "sessionmaker",
}
LOCK_FACTORIES = {
    "threading.Lock",
    "threading.RLock",
    "threading.Condition",
    "asyncio.Lock",
    "asyncio.Condition",
    "anyio.Lock",
    "trio.Lock",
    "multiprocessing.Lock",
    "multiprocessing.RLock",
    "filelock.FileLock",
    "filelock.SoftFileLock",
    "filelock.UnixFileLock",
}
LOCK_WORDS = {"lock", "rlock", "mutex"}
REDIS_LOCK_OWNERS = {"redis", "cache", "client", "r", "conn"}
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


def receiver_text(node):
    parts = []
    while isinstance(node, (ast.Attribute, ast.Call)):
        if isinstance(node, ast.Call):
            node = node.func
        else:
            parts.append(node.attr)
            node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
    return ".".join(reversed(parts))


def transaction_label(expression, scope):
    call = expression.func if isinstance(expression, ast.Call) else expression
    name = dotted_name(call, scope.aliases) or ""
    if name in TRANSACTIONS:
        return f"{receiver_text(call)}()"
    if not (isinstance(expression, ast.Call) and isinstance(call, ast.Attribute)):
        return None
    if call.attr not in TRANSACTION_METHODS:
        return None
    owner = receiver_text(call.value)
    words = {word for part in owner.split(".") for word in words_of(part)}
    spec = scope.client_spec([*owner.split("."), call.attr])
    if words & DATABASE_WORDS or (spec is not None and spec.default == DATABASE):
        return f"{owner}.{call.attr}()"
    return None


def lock_names(project):
    def build(_):
        found = set()
        for context in project.contexts.values():
            for node in ast.walk(context.tree):
                if (
                    isinstance(node, (ast.Assign, ast.AnnAssign))
                    and node.value is not None
                ):
                    factory = dotted_name(
                        getattr(node.value, "func", None), context.aliases
                    )
                    targets = (
                        node.targets if isinstance(node, ast.Assign) else [node.target]
                    )
                    if factory in LOCK_FACTORIES:
                        found.update(
                            t.id if isinstance(t, ast.Name) else t.attr
                            for t in targets
                            if isinstance(t, (ast.Name, ast.Attribute))
                        )
        return found

    return project.memo("lock-names", build)


def lock_label(expression, scope):
    names = lock_names(scope.context.project)
    if isinstance(expression, (ast.Name, ast.Attribute)):
        last = expression.id if isinstance(expression, ast.Name) else expression.attr
        words = words_of(last)
        if last in names or (words and words[-1] in LOCK_WORDS):
            return receiver_text(expression)
        return None
    if isinstance(expression, ast.Call):
        name = dotted_name(expression.func, scope.aliases)
        if name in LOCK_FACTORIES:
            return f"{receiver_text(expression.func)}()"
        function = expression.func
        if isinstance(function, ast.Attribute) and function.attr == "lock":
            owner = receiver_text(function.value)
            spec = scope.client_spec([*owner.split("."), "lock"])
            words = {word for part in owner.split(".") for word in words_of(part)}
            if (
                spec is not None and spec.default == DATABASE
            ) or words & REDIS_LOCK_OWNERS:
                return f"{owner}.lock()"
    return None


def decorator_scopes(function, scope):
    labels = (transaction_label(d, scope) for d in function.decorator_list)
    return [Scope("transaction", label, function.body) for label in labels if label]


def held_scopes(context, scope):
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, (ast.With, ast.AsyncWith)):
            for item in node.items:
                label = transaction_label(item.context_expr, scope)
                if label is not None:
                    found.append(Scope("transaction", label, node.body))
                    continue
                label = lock_label(item.context_expr, scope)
                if label is not None:
                    found.append(Scope("lock", label, node.body))
        elif isinstance(node, FUNCTIONS):
            found.extend(decorator_scopes(node, scope))
    return found
