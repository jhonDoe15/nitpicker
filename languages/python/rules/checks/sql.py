import ast
import re

from checks.common import dotted_name, finding, own_nodes

RULE = "sql-string-formatting"
SQL_TEXT = re.compile(
    r"\b(?:select\s.+?\sfrom\s|delete\s+from\s|(?:insert|replace)\s.+?\svalues\s"
    r"|update\s.+?\sset\s)",
    re.I | re.S,
)
SINKS = {
    "execute",
    "executemany",
    "executescript",
    "text",
    "raw",
    "RawSQL",
    "extra",
    "read_sql",
    "read_sql_query",
    "read_sql_table",
}
SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef)
PASSES = 3


def static_text(node):
    return " ".join(
        part.value
        for part in ast.walk(node)
        if isinstance(part, ast.Constant) and isinstance(part.value, str)
    )


def is_formatted(node):
    if isinstance(node, ast.JoinedStr):
        return any(isinstance(v, ast.FormattedValue) for v in node.values)
    if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Mod, ast.Add)):
        return has_text(node.left) or has_text(node.right)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        return node.func.attr == "format" and has_text(node.func.value)
    return False


def has_text(node):
    return any(
        isinstance(part, ast.Constant) and isinstance(part.value, str)
        for part in ast.walk(node)
    )


def assigned_values(scope):
    values = {}
    for node in own_nodes(scope):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    values.setdefault(target.id, []).append(node.value)
        elif isinstance(node, ast.AugAssign) and isinstance(node.target, ast.Name):
            values.setdefault(node.target.id, []).append(node.value)
    return values


def reaches_formatted_sql(node, values, depth=0):
    if depth > PASSES:
        return False
    if isinstance(node, ast.Name):
        return any(
            reaches_formatted_sql(value, values, depth + 1)
            for value in values.get(node.id, [])
        )
    return is_formatted(node) and bool(SQL_TEXT.search(static_text(node)))


def sink_name(call, aliases):
    function = call.func
    name = function.attr if isinstance(function, ast.Attribute) else None
    name = name or (function.id if isinstance(function, ast.Name) else None)
    if name not in SINKS:
        return None
    return dotted_name(function, aliases) or name


def scope_findings(scope, context):
    values = assigned_values(scope)
    found = []
    for node in own_nodes(scope):
        if not isinstance(node, ast.Call):
            continue
        name = sink_name(node, context.aliases)
        arguments = list(node.args[:1]) + [
            k.value for k in node.keywords if k.arg in {"sql", "query", "statement"}
        ]
        if name and any(reaches_formatted_sql(a, values) for a in arguments):
            found.append(finding(context.path, RULE, name, node))
    return found


def check(context):
    if context.tests:
        return []
    found = scope_findings(context.tree, context)
    for node in ast.walk(context.tree):
        if isinstance(node, SCOPES):
            found.extend(scope_findings(node, context))
    return found
