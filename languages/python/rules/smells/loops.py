import ast

from checks.common import dotted_name, finding, words_of

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
CONCURRENT_COMBINATORS = {"asyncio.gather", "asyncio.wait", "asyncio.as_completed"}
COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)
ARITHMETIC = (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod, ast.Pow, ast.FloorDiv)


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


def is_input_output_call(call, imported):
    names = chain_names(call.func)
    if not names:
        return False
    if names[0] in imported:
        return True
    owners = names[:-1]
    return (
        bool(owners)
        and is_input_output_method(names[-1])
        and any((words_of(owner) or [""])[-1] in OWNER_WORDS for owner in owners)
    )


def loop_parents(tree):
    return {id(c): p for p in ast.walk(tree) for c in ast.iter_child_nodes(p)}


def ancestors(node, parents):
    chain = [node]
    while id(chain[-1]) in parents:
        chain.append(parents[id(chain[-1])])
    return chain


def in_loop_body(parent, child):
    if isinstance(parent, (ast.For, ast.AsyncFor)):
        return child in parent.body
    return isinstance(parent, ast.While) and (
        child in parent.body or child is parent.test
    )


def is_evaluated_once(comprehension, chain, index):
    first = comprehension.generators[0]
    return chain[index - 1] is first and index >= 2 and chain[index - 2] is first.iter


def enclosing_loop(node, parents):
    chain = ancestors(node, parents)
    for index in range(1, len(chain)):
        child, parent = chain[index - 1], chain[index]
        if isinstance(parent, FUNCTIONS):
            return None
        if in_loop_body(parent, child):
            return parent
        if isinstance(parent, COMPREHENSIONS) and not is_evaluated_once(
            parent, chain, index
        ):
            return parent
    return None


def is_concurrent(comprehension, parents, aliases):
    node = parents.get(id(comprehension))
    if isinstance(node, ast.Starred):
        node = parents.get(id(node))
    return (
        isinstance(node, ast.Call)
        and dotted_name(node.func, aliases) in CONCURRENT_COMBINATORS
    )


def is_self_update(node, name):
    if isinstance(node, ast.AugAssign):
        return isinstance(node.op, ARITHMETIC)
    return isinstance(node.value, ast.BinOp) and any(
        isinstance(side, ast.Name) and side.id == name
        for side in (node.value.left, node.value.right)
    )


def is_paging_loop(loop):
    if not isinstance(loop, ast.While):
        return False
    tested = {n.id for n in ast.walk(loop.test) if isinstance(n, ast.Name)}
    for node in ast.walk(loop):
        targets = []
        if isinstance(node, ast.Assign):
            targets = node.targets
        elif isinstance(node, (ast.AugAssign, ast.AnnAssign)):
            targets = [node.target]
        for target in targets:
            if isinstance(target, ast.Name) and target.id in tested:
                if not (
                    isinstance(node, (ast.Assign, ast.AugAssign))
                    and is_self_update(node, target.id)
                ):
                    return True
    return False


def exits_loop(statements):
    return any(
        isinstance(n, (ast.Return, ast.Break)) for s in statements for n in ast.walk(s)
    )


def is_retry_attempt(call, loop, parents):
    if not isinstance(loop, (ast.For, ast.AsyncFor, ast.While)):
        return False
    node = call
    while node is not None and node is not loop:
        parent = parents.get(id(node))
        if isinstance(parent, ast.Try) and node in parent.body and parent in loop.body:
            handlers_continue = all(
                not any(
                    isinstance(n, (ast.Raise, ast.Return, ast.Break))
                    for s in h.body
                    for n in ast.walk(s)
                )
                for h in parent.handlers
            )
            return (
                bool(parent.handlers) and handlers_continue and exits_loop(parent.body)
            )
        node = parent
    return False


def check(context):
    if context.tests:
        return []
    imported = imported_input_output_names(context.tree)
    parents = loop_parents(context.tree)
    found = []
    inner_calls = {
        id(node.func.value)
        for node in ast.walk(context.tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
    }
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call) or id(node) in inner_calls:
            continue
        if not is_input_output_call(node, imported):
            continue
        loop = enclosing_loop(node, parents)
        if loop is None:
            continue
        container = loop
        if isinstance(container, COMPREHENSIONS) and is_concurrent(
            container, parents, context.aliases
        ):
            continue
        if is_paging_loop(container) or is_retry_attempt(node, container, parents):
            continue
        callee = ".".join(chain_names(node.func))
        found.append(finding(context.path, "io-in-loop", f"{callee}()", node))
    return found
