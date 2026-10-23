import ast

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
