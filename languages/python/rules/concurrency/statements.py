import ast
from typing import NamedTuple

COMPOUND = (
    ast.If,
    ast.While,
    ast.For,
    ast.AsyncFor,
    ast.Try,
    ast.With,
    ast.AsyncWith,
)
if hasattr(ast, "TryStar"):
    COMPOUND += (ast.TryStar,)
if hasattr(ast, "Match"):
    COMPOUND += (ast.Match,)


def is_compound(statement):
    return isinstance(statement, COMPOUND)


def headers_of(statement):
    if isinstance(statement, (ast.If, ast.While)):
        return [statement.test]
    if isinstance(statement, (ast.For, ast.AsyncFor)):
        return [statement.iter]
    if isinstance(statement, (ast.With, ast.AsyncWith)):
        return [item.context_expr for item in statement.items]
    if hasattr(ast, "Match") and isinstance(statement, ast.Match):
        return [statement.subject]
    return []


def blocks_of(statement):
    if hasattr(ast, "Match") and isinstance(statement, ast.Match):
        return [case.body for case in statement.cases]
    blocks = [statement.body]
    blocks.extend(handler.body for handler in getattr(statement, "handlers", []))
    blocks.append(getattr(statement, "orelse", []))
    blocks.append(getattr(statement, "finalbody", []))
    return [block for block in blocks if block]


def written_targets(statement):
    if isinstance(statement, ast.Assign):
        pending = list(statement.targets)
    elif isinstance(statement, (ast.AugAssign, ast.AnnAssign)) and statement.value:
        pending = [statement.target]
    else:
        return []
    found = []
    while pending:
        target = pending.pop(0)
        if isinstance(target, (ast.Tuple, ast.List)):
            pending[:0] = target.elts
        elif isinstance(target, ast.Starred):
            pending.insert(0, target.value)
        else:
            found.append(target)
    return found


def header_names(statement):
    if isinstance(statement, (ast.For, ast.AsyncFor)):
        targets = [statement.target]
    elif isinstance(statement, (ast.With, ast.AsyncWith)):
        targets = [item.optional_vars for item in statement.items if item.optional_vars]
    else:
        targets = []
    return {
        node.id
        for target in targets
        for node in ast.walk(target)
        if isinstance(node, ast.Name)
    }


def paired(target, value):
    if isinstance(target, ast.Starred):
        return paired(target.value, value)
    if not isinstance(target, (ast.Tuple, ast.List)):
        return [(target, value)]
    if isinstance(value, (ast.Tuple, ast.List)) and len(value.elts) == len(target.elts):
        return [pair for t, v in zip(target.elts, value.elts) for pair in paired(t, v)]
    return [pair for item in target.elts for pair in paired(item, value)]


class Saved(NamedTuple):
    locations: frozenset
    locks: frozenset
    awaited: bool


def reads_through(text, target):
    location = ast.unparse(target)
    if text == location or text.startswith((location + ".", location + "[")):
        return True
    if not isinstance(target, ast.Subscript):
        return False
    container = ast.unparse(target.value)
    return text == container or text.startswith(container + ".")


def merge(*states):
    merged = {}
    for state in states:
        for name, parts in state.items():
            merged[name] = tuple(dict.fromkeys(merged.get(name, ()) + parts))
    return merged


def without(saved, names):
    return {name: parts for name, parts in saved.items() if name not in names}


def mark_awaited(saved):
    return {
        name: tuple(part._replace(awaited=True) for part in parts)
        for name, parts in saved.items()
    }


def released(saved, locks):
    if not locks:
        return saved
    return {
        name: tuple(
            (
                Saved(part.locations, part.locks - locks, True)
                if part.locks & locks
                else part
            )
            for part in parts
        )
        for name, parts in saved.items()
    }


def forget_overwritten(statement, saved):
    targets = written_targets(statement)
    kept = {}
    for name, parts in saved.items():
        left = tuple(
            part
            for part in parts
            if not any(
                reads_through(place, target)
                for place in part.locations
                for target in targets
            )
        )
        if left:
            kept[name] = left
    return kept
