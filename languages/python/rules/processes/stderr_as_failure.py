import ast

from checks.common import dotted_name, finding, own_nodes
from processes.subprocess_calls import (
    ASYNC_EXEC_CALLS,
    ASYNC_OPEN_CALLS,
    ASYNC_SHELL_CALLS,
    POPEN_CALLS,
    RESULT_CALLS,
    text_base,
)
from security.support import exempt
from signatures.annotations import FUNCTION_TYPES

RULE = "stderr-as-failure"
GUARDED = True
PROCESS_FACTORIES = POPEN_CALLS | ASYNC_EXEC_CALLS | ASYNC_SHELL_CALLS | ASYNC_OPEN_CALLS
EXIT_CALLS = {"sys.exit", "os._exit"}


def unwrap_await(node):
    return node.value if isinstance(node, ast.Await) else node


def call_name(node, aliases):
    inner = unwrap_await(node)
    if isinstance(inner, ast.Call):
        return dotted_name(inner.func, aliases) or ""
    return ""


def collect_stderr_sources(scope, aliases):
    result_vars = set()
    proc_vars = set()
    stderr_vars = set()
    for node in own_nodes(scope):
        if isinstance(node, (ast.With, ast.AsyncWith)):
            for item in node.items:
                if isinstance(item.optional_vars, ast.Name) and call_name(item.context_expr, aliases) in PROCESS_FACTORIES:
                    proc_vars.add(item.optional_vars.id)
        if not isinstance(node, (ast.Assign, ast.AnnAssign)):
            continue
        value = node.value
        if value is None:
            continue
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        for target in targets:
            record_target(target, value, aliases, result_vars, proc_vars, stderr_vars)
    return result_vars, stderr_vars


def record_target(target, value, aliases, result_vars, proc_vars, stderr_vars):
    if isinstance(target, (ast.Tuple, ast.List)) and len(target.elts) == 2:
        inner = unwrap_await(value)
        if (
            isinstance(inner, ast.Call)
            and isinstance(inner.func, ast.Attribute)
            and inner.func.attr == "communicate"
            and isinstance(target.elts[1], ast.Name)
        ):
            owner = inner.func.value
            if (isinstance(owner, ast.Name) and owner.id in proc_vars) or call_name(owner, aliases) in PROCESS_FACTORIES:
                stderr_vars.add(target.elts[1].id)
        return
    if not isinstance(target, ast.Name):
        return
    name = call_name(value, aliases)
    if name in RESULT_CALLS:
        result_vars.add(target.id)
    elif name in PROCESS_FACTORIES:
        proc_vars.add(target.id)
    elif is_stderr_expr(value, aliases, result_vars, stderr_vars):
        stderr_vars.add(target.id)


def is_stderr_expr(node, aliases, result_vars, stderr_vars):
    base = text_base(node)
    if isinstance(base, ast.Attribute) and base.attr == "stderr":
        if isinstance(base.value, ast.Name):
            return base.value.id in result_vars
        return call_name(base.value, aliases) in RESULT_CALLS
    if isinstance(base, ast.Name):
        return base.id in stderr_vars
    return False


def is_nonzero_exit(node, aliases):
    if not isinstance(node, ast.Call):
        return False
    if (dotted_name(node.func, aliases) or "") not in EXIT_CALLS:
        return False
    if not node.args:
        return False
    code = node.args[0]
    return not (isinstance(code, ast.Constant) and code.value in (0, None))


def statement_fails(stmt, aliases):
    if isinstance(stmt, ast.Raise):
        return True
    if isinstance(stmt, ast.Expr):
        return is_nonzero_exit(stmt.value, aliases)
    if isinstance(stmt, ast.Return) and stmt.value is not None:
        return is_nonzero_exit(stmt.value, aliases)
    return False


def branch_fails(node, aliases):
    if isinstance(node, ast.If):
        return any(statement_fails(stmt, aliases) for stmt in node.body)
    if isinstance(node, ast.IfExp):
        return is_nonzero_exit(node.body, aliases)
    return False


def or_alternatives(test):
    parts = []
    stack = [test]
    while stack:
        current = stack.pop()
        if isinstance(current, ast.BoolOp) and isinstance(current.op, ast.Or):
            stack.extend(reversed(current.values))
        else:
            parts.append(current)
    return parts


def len_argument(node):
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "len"
        and len(node.args) == 1
    ):
        return node.args[0]
    return None


def is_empty_text(node):
    return isinstance(node, ast.Constant) and node.value in ("", b"")


def is_zero(node):
    return isinstance(node, ast.Constant) and node.value == 0 and not isinstance(node.value, bool)


def tested_nonempty_text(expr):
    if isinstance(expr, ast.Compare) and len(expr.ops) == 1:
        left, op, right = expr.left, expr.ops[0], expr.comparators[0]
        if isinstance(op, ast.NotEq):
            if is_empty_text(right):
                return left
            if is_empty_text(left):
                return right
            if is_zero(right):
                return len_argument(left)
            if is_zero(left):
                return len_argument(right)
        if isinstance(op, ast.Gt) and is_zero(right):
            return len_argument(left)
        if isinstance(op, ast.Lt) and is_zero(left):
            return len_argument(right)
        return None
    if isinstance(expr, ast.UnaryOp) and isinstance(expr.op, ast.Not):
        return None
    return len_argument(expr) or expr


def scope_findings(scope, context):
    aliases = context.aliases
    result_vars, stderr_vars = collect_stderr_sources(scope, aliases)
    if not (result_vars or stderr_vars):
        return []
    found = []
    for node in own_nodes(scope):
        if not (isinstance(node, (ast.If, ast.IfExp)) and branch_fails(node, aliases)):
            continue
        for alternative in or_alternatives(node.test):
            text = tested_nonempty_text(alternative)
            if text is not None and is_stderr_expr(text, aliases, result_vars, stderr_vars):
                found.append(finding(context.path, RULE, ast.unparse(alternative), alternative))
    return found


def check(context):
    if exempt(context):
        return []
    found = scope_findings(context.tree, context)
    for node in ast.walk(context.tree):
        if isinstance(node, FUNCTION_TYPES):
            found.extend(scope_findings(node, context))
    return found
