import ast

from checks.common import finding, words_of
from dual_write.branches import in_exclusive_arms
from kinds.names import call_text, chain_names
from related_writes.units import (
    base_text,
    direct_writes,
    enclosing,
    is_decorated_atomic,
    is_incidental,
    is_manager_call,
    model_key,
    session_base,
    target_key,
)

RULE = "related-writes-without-transaction"
DJANGO_INSTANCE_METHODS = {"save", "delete", "asave", "adelete"}
SESSION_FACTORIES = {"Session", "AsyncSession", "connect", "begin"}
SETTING = "ATOMIC_REQUESTS"
SAVEPOINT = "begin_nested()"
STORES = {"session", "cache", "sessions", "caches"}


def sets_atomic_requests(node):
    if isinstance(node, ast.Assign):
        names = [t.id for t in node.targets if isinstance(t, ast.Name)]
        return SETTING in names and is_true(node.value)
    if isinstance(node, ast.Dict):
        return any(
            isinstance(key, ast.Constant) and key.value == SETTING and is_true(value)
            for key, value in zip(node.keys, node.values)
        )
    return isinstance(node, ast.keyword) and node.arg == SETTING and is_true(node.value)


def is_true(node):
    return isinstance(node, ast.Constant) and node.value is True


def atomic_requests(project):
    def build(_):
        return any(
            sets_atomic_requests(node)
            for context in project.contexts.values()
            for node in ast.walk(context.tree)
        )

    return project.memo("atomic-requests", build)


def is_view(function):
    names = [argument.arg for argument in function.args.args[:2]]
    return "request" in names


def session_variables(function):
    names = set()
    for node in ast.walk(function):
        if not isinstance(node, (ast.With, ast.AsyncWith)):
            continue
        for item in node.items:
            expression = item.context_expr
            call = expression if isinstance(expression, ast.Call) else None
            factory = chain_names(call.func)[-1:] if call is not None else []
            if factory and factory[0] in SESSION_FACTORIES and item.optional_vars:
                names.update(
                    n.id
                    for n in ast.walk(item.optional_vars)
                    if isinstance(n, ast.Name)
                )
    return names


def is_session_write(call, sessions):
    return not is_manager_call(call) and session_base(call, sessions) is not None


def is_django_write(call):
    if is_manager_call(call):
        return True
    owners = {w for n in chain_names(call.func)[:-1] for w in words_of(n)}
    if owners & STORES:
        return False
    return (
        isinstance(call.func, ast.Attribute)
        and call.func.attr in DJANGO_INSTANCE_METHODS
        and session_base(call) is None
    )


def is_commit(call, bases):
    function = call.func
    return (
        isinstance(function, ast.Attribute)
        and function.attr == "commit"
        and not call.args
        and base_text(function.value) in bases
    )


def commit_calls(function, bases):
    return [
        node
        for node in ast.walk(function)
        if isinstance(node, ast.Call) and is_commit(node, bases)
    ]


def position(node):
    return node.lineno, node.col_offset


def unit_of(call, blocks, commits):
    outer = enclosing(blocks, call)
    if outer:
        return ("block", id(outer[0].node))
    epoch = sum(
        1
        for commit in commits
        if position(commit) < position(call) and not any(enclosing(blocks, commit))
    )
    return ("epoch", epoch)


def first_pair(writes, is_split, parents):
    for index, later in enumerate(writes):
        for earlier in writes[:index]:
            if is_split(earlier, later) and not in_exclusive_arms(
                earlier, later, parents
            ):
                return earlier, later
    return None


def session_pair(function, scope, blocks, parents):
    sessions = session_variables(function)
    writes = [
        call
        for call in direct_writes(function, scope)
        if is_session_write(call, sessions)
        and not is_incidental(call, parents, function)
    ]
    plain = [
        block
        for block in blocks
        if not block.django and not block.label.endswith(SAVEPOINT)
    ]
    commits = commit_calls(function, {session_base(call, sessions) for call in writes})

    def is_split(earlier, later):
        return unit_of(earlier, plain, commits) != unit_of(later, plain, commits) and (
            target_key(earlier) != target_key(later)
        )

    return first_pair(writes, is_split, parents)


def django_pair(function, scope, blocks, context):
    if not scope.django or (atomic_requests(context.project) and is_view(function)):
        return None
    if is_decorated_atomic(function, scope):
        return None
    writes = [
        call
        for call in direct_writes(function, scope)
        if is_django_write(call)
        and not enclosing(blocks, call)
        and not is_incidental(call, context.parents, function)
    ]

    def is_split(earlier, later):
        return model_key(earlier) != model_key(later)

    return first_pair(writes, is_split, context.parents)


def split_findings(function, qualified, scope, blocks, context):
    pair = django_pair(function, scope, blocks, context) or session_pair(
        function, scope, blocks, context.parents
    )
    if pair is None:
        return []
    first, second = pair
    subject = f"{qualified}|{call_text(first)}|{call_text(second)}"
    return [finding(context.path, RULE, subject, second)]
