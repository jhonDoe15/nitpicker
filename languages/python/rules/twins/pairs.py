import ast

from checks.common import last_name

ASYNC_SUFFIX = "_async"
MINIMUM_NAME = 3
ENGLISH_PREFIXES = ("await",)
DELEGATION_DECORATORS = {"property", "overload", "abstractmethod", "setter"}


def sync_candidate(name):
    stripped = candidate_name(name)
    return stripped if stripped and len(stripped.lstrip("_")) >= MINIMUM_NAME else None


def candidate_name(name):
    if name.startswith("_a") and len(name) > 2 and name[2] != "_":
        return "_" + name[2:]
    if name.startswith(ENGLISH_PREFIXES):
        return None
    if name.startswith("a") and len(name) > 1 and name[1] != "_":
        return name[1:]
    if name.endswith(ASYNC_SUFFIX) and len(name) > len(ASYNC_SUFFIX):
        return name[: -len(ASYNC_SUFFIX)]
    return None


def is_plain(function):
    names = {
        last_name(item.func if isinstance(item, ast.Call) else item)
        for item in function.decorator_list
    }
    return not (names & DELEGATION_DECORATORS)


def scope_functions(body):
    found = {}
    for statement in body:
        if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if is_plain(statement):
                found.setdefault(statement.name, statement)
    return found


def mentions(function, name):
    for node in ast.walk(function):
        if isinstance(node, ast.Name) and node.id == name:
            return True
        if isinstance(node, ast.Attribute) and node.attr == name:
            return True
    return False


def delegates(asynchronous, synchronous):
    return mentions(asynchronous, synchronous.name) or mentions(
        synchronous, asynchronous.name
    )


def twins_in(body):
    functions = scope_functions(body)
    found = []
    for name, function in functions.items():
        if not isinstance(function, ast.AsyncFunctionDef):
            continue
        other = functions.get(sync_candidate(name) or "")
        if isinstance(other, ast.FunctionDef) and not delegates(function, other):
            found.append((function, other, set(functions)))
    return found


def scopes_of(tree):
    yield tree.body, None
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            yield node.body, node.name
