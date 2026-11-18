import ast

from checks.common import finding
from query_text.problems import OPAQUE, is_full_query, query_text_problem, run_together

RULE = "malformed-query-text"
QUERY_CALLS = {
    "execute", "executemany", "executescript", "query", "text", "raw", "prepare", "fetch", "fetchrow",
    "fetchval", "fetchall", "read_sql", "read_sql_query", "exec_driver_sql", "mogrify",
}
FINAL_PARENTS = (ast.Return, ast.Lambda, ast.keyword)


def is_concatenation(node):
    return isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add)


def flatten(node):
    return flatten(node.left) + flatten(node.right) if is_concatenation(node) else [node]


def plain_text(node):
    return node.value if isinstance(node, ast.Constant) and isinstance(node.value, str) else None


def text_of(node):
    plain = plain_text(node)
    if plain is not None:
        return plain
    if isinstance(node, ast.JoinedStr):
        return "".join(
            part.value if isinstance(part, ast.Constant) else OPAQUE for part in node.values
        )
    return OPAQUE


def is_query_call(node):
    if not isinstance(node, ast.Call):
        return False
    name = node.func.attr if isinstance(node.func, ast.Attribute) else getattr(node.func, "id", None)
    return name in QUERY_CALLS


def assigned_name(node, parents):
    parent = parents.get(id(node))
    if isinstance(parent, (ast.Assign, ast.AugAssign, ast.AnnAssign)):
        target = parent.targets[0] if isinstance(parent, ast.Assign) else parent.target
        return target.id if isinstance(target, ast.Name) else None, parent
    return None, None


def later_statements(statement, parents):
    later, current = [], statement
    while current is not None and not isinstance(current, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Module)):
        block = parents.get(id(current))
        for field in ("body", "orelse", "finalbody"):
            statements = getattr(block, field, None)
            if isinstance(statements, list) and current in statements:
                later.extend(statements[statements.index(current) + 1 :])
        if isinstance(block, (ast.For, ast.AsyncFor, ast.While)):
            return None
        current = block
    return later


def extends_name(statement, name):
    for each in ast.walk(statement):
        targets = each.targets if isinstance(each, ast.Assign) else [getattr(each, "target", None)]
        if isinstance(each, (ast.Assign, ast.AugAssign)) and any(
            isinstance(target, ast.Name) and target.id == name for target in targets
        ):
            return True
    return False


def is_complete(node, text, parents):
    parent = parents.get(id(node))
    if is_query_call(parent):
        return True
    if isinstance(parent, FINAL_PARENTS):
        return is_full_query(text)
    name, statement = assigned_name(node, parents)
    later = later_statements(statement, parents) if statement is not None else None
    if name is None or later is None:
        return False
    return not any(extends_name(each, name) for each in later)


def adjacent_problem(operands):
    for left, right in zip(operands, operands[1:]):
        before, after = plain_text(left), plain_text(right)
        problem = run_together(before, after) if before is not None and after is not None else None
        if problem is not None:
            return problem
    return None


def subject_of(problem):
    if problem["kind"] == "count":
        return f"count|{problem['columns']} {problem['values']}"
    return f"{problem['kind']}|{problem['snippet']}"


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        parent = context.parents.get(id(node))
        if is_concatenation(node) and not is_concatenation(parent):
            operands = flatten(node)
        elif isinstance(node, (ast.Constant, ast.JoinedStr)) and not is_concatenation(parent):
            if isinstance(node, ast.Constant) and not isinstance(node.value, str):
                continue
            if isinstance(parent, (ast.JoinedStr, ast.Expr)):
                continue
            operands = [node]
        else:
            continue
        text = "".join(text_of(operand) for operand in operands)
        problem = query_text_problem(text, is_complete(node, text, context.parents)) or adjacent_problem(operands)
        if problem is not None:
            found.append(finding(context.path, RULE, subject_of(problem), node))
    return found
