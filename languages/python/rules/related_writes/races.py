import ast

from checks.common import finding, walk_statements, words_of
from kinds.names import call_text, chain_names
from related_writes.units import (
    DJANGO_MANAGER,
    TRIES,
    ancestors,
    enclosing,
    is_decorated_atomic,
)
from transactions.scopes import DATABASE_WORDS

RULE = "check-then-write-race"
DJANGO_READS = {"exists", "count", "first", "last", "get"}
DJANGO_CREATES = {"create", "bulk_create"}
SQL_READS = {"count", "first", "one_or_none", "scalar", "scalar_one_or_none", "get"}
SQL_MODELS = {"query", "select", "select_from", "get"}
LOCKS = {"select_for_update", "with_for_update"}
SAVES = {"save", "add", "add_all"}
CONFLICTS = ("IntegrityError", "UniqueViolation", "DuplicateKey")
EXITS = (ast.Raise, ast.Return)


def text_of(node):
    return ast.unparse(node) if isinstance(node, (ast.Name, ast.Attribute)) else None


def sql_model(call):
    for node in ast.walk(call):
        if not (isinstance(node, ast.Call) and node.args):
            continue
        name = chain_names(node.func)[-1:]
        if name and name[0] in SQL_MODELS and text_of(node.args[0]):
            return text_of(node.args[0])
    return None


def is_locked(call):
    return any(
        (isinstance(node, ast.Attribute) and node.attr in LOCKS)
        or (isinstance(node, ast.keyword) and node.arg == "with_for_update")
        for node in ast.walk(call)
    )


def read_of(call):
    names = chain_names(call.func)
    if len(names) < 2:
        return None
    if DJANGO_MANAGER in names[:-1] and names[-1] in DJANGO_READS:
        model = ".".join(names[: names.index(DJANGO_MANAGER)])
        return (model, is_locked(call)) if model else None
    owners = {(words_of(name) or [""])[-1] for name in names[:-1]}
    if names[-1] in SQL_READS and owners & DATABASE_WORDS:
        model = sql_model(call)
        return (model, is_locked(call)) if model else None
    return None


def reads_in(node):
    return [
        (*read, call)
        for call in ast.walk(node)
        if isinstance(call, ast.Call)
        for read in [read_of(call)]
        if read is not None
    ]


def assigned_reads(function):
    found = {}
    for node in walk_statements(function.body):
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
            if isinstance(target, ast.Name):
                found.setdefault(target.id, []).append((node, reads_in(node.value)))
    return found


def decided_reads(test, assigned, before):
    reads = reads_in(test)
    for name in {n.id for n in ast.walk(test) if isinstance(n, ast.Name)}:
        earlier = [r for node, r in assigned.get(name, []) if node.lineno < before]
        reads.extend(earlier[-1] if earlier else [])
    return reads


def following(node, parents):
    parent = parents.get(id(node))
    for field in ("body", "orelse", "finalbody"):
        statements = getattr(parent, field, None)
        if isinstance(statements, list) and node in statements:
            return statements[statements.index(node) + 1 :]
    return []


def exits(statements):
    return bool(statements) and isinstance(statements[-1], EXITS)


def written_in(statements, model):
    nodes = [n for statement in statements for n in walk_statements([statement])]
    calls = [n for n in nodes if isinstance(n, ast.Call)]
    saves = [c for c in calls if chain_names(c.func)[-1:] and chain_names(c.func)[-1] in SAVES]
    for call in calls:
        names = chain_names(call.func)
        if DJANGO_MANAGER in names[:-1] and names[-1] in DJANGO_CREATES:
            if ".".join(names[: names.index(DJANGO_MANAGER)]) == model:
                return call
        elif saves and text_of(call.func) == model:
            return saves[0]
        elif names[-1:] == ["insert"] and call.args and text_of(call.args[0]) == model:
            return call
    return None


def handles_conflict(node, parents, function):
    for child, parent in ancestors(node, parents, function):
        if isinstance(parent, TRIES) and child in parent.body:
            for handler in parent.handlers:
                if handler.type is not None and any(
                    word in ast.unparse(handler.type) for word in CONFLICTS
                ):
                    return True
    return False


def does_not_exist(handler):
    return handler.type is not None and "DoesNotExist" in ast.unparse(handler.type)


def deciders(function, context):
    assigned = assigned_reads(function)
    for node in walk_statements(function.body):
        if isinstance(node, ast.If):
            region = node.body + node.orelse
            if exits(node.body):
                region = region + following(node, context.parents)
            for model, locked, read in decided_reads(node.test, assigned, node.lineno):
                yield model, locked, read, region
        elif isinstance(node, TRIES):
            for model, locked, read in reads_in(ast.Module(body=node.body, type_ignores=[])):
                for handler in node.handlers:
                    if does_not_exist(handler):
                        yield model, locked, read, handler.body


def race_findings(function, qualified, scope, blocks, context):
    if is_decorated_atomic(function, scope):
        return []
    found, seen = [], set()
    for model, locked, read, region in deciders(function, context):
        write = written_in(region, model)
        if locked or write is None or id(write) in seen:
            continue
        if enclosing(blocks, write) or handles_conflict(write, context.parents, function):
            continue
        seen.add(id(write))
        subject = f"{qualified}|{call_text(read)}|{call_text(write)}"
        found.append(finding(context.path, RULE, subject, write))
    return found
