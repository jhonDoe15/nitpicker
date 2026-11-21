import ast
import re

from checks.common import dotted_name, finding, is_log_owner, own_nodes
from processes.subprocess_calls import (
    ASYNC_EXEC_CALLS,
    ASYNC_OPEN_CALLS,
    ASYNC_SHELL_CALLS,
    NO_TIMEOUT_CALLS,
    POPEN_CALLS,
    RESULT_CALLS,
    scope_reads,
    text_base,
)
from security.support import exempt
from signatures.annotations import FUNCTION_TYPES

RULE = "head-cut-error-output"
GUARDED = True
OUTPUT_NAME = re.compile(
    r"^(?:std(?:err|out)|error_output)$|(?:_stderr|_stdout|_error_output|Stderr|Stdout|ErrorOutput)$"
)
ERROR_CALLEE = re.compile(r"(?:^|[a-z_])(?:Error|Exception)$")
LOG_ERROR_LEVELS = {"error", "critical", "fatal", "exception"}
MEASURED_ENDS = {"find", "rfind", "index", "rindex"}
SHORT_CUT = 40
OUTPUT_CALLS = {"subprocess.check_output"} | NO_TIMEOUT_CALLS
PROCESS_FACTORIES = POPEN_CALLS | ASYNC_EXEC_CALLS | ASYNC_SHELL_CALLS | ASYNC_OPEN_CALLS


def unwrap_await(node):
    return node.value if isinstance(node, ast.Await) else node


def call_dotted(node, aliases):
    inner = unwrap_await(node)
    if isinstance(inner, ast.Call):
        return dotted_name(inner.func, aliases) or ""
    return ""


def collect_output_vars(scope, aliases):
    output_vars = set()
    result_vars = set()
    proc_vars = set()
    for node in own_nodes(scope):
        if isinstance(node, (ast.With, ast.AsyncWith)):
            for item in node.items:
                if isinstance(item.optional_vars, ast.Name) and call_dotted(item.context_expr, aliases) in PROCESS_FACTORIES:
                    proc_vars.add(item.optional_vars.id)
        if not isinstance(node, (ast.Assign, ast.AnnAssign)):
            continue
        value = node.value
        if value is None:
            continue
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        for target in targets:
            record_output_target(target, value, aliases, output_vars, result_vars, proc_vars)
    return output_vars, result_vars


def record_output_target(target, value, aliases, output_vars, result_vars, proc_vars):
    if isinstance(target, (ast.Tuple, ast.List)) and len(target.elts) == 2:
        inner = unwrap_await(value)
        if isinstance(inner, ast.Call) and isinstance(inner.func, ast.Attribute) and inner.func.attr == "communicate":
            for el in target.elts:
                if isinstance(el, ast.Name) and el.id != "_":
                    output_vars.add(el.id)
        return
    if not isinstance(target, ast.Name):
        return
    dotted = call_dotted(value, aliases)
    if dotted in OUTPUT_CALLS:
        output_vars.add(target.id)
    elif dotted in RESULT_CALLS:
        result_vars.add(target.id)
    elif dotted in PROCESS_FACTORIES:
        proc_vars.add(target.id)


def is_output_text(node, output_vars, result_vars, aliases):
    base = text_base(node)
    if isinstance(base, ast.Attribute):
        if OUTPUT_NAME.search(base.attr):
            return True
        if base.attr in {"stdout", "stderr"} and isinstance(base.value, ast.Name):
            return base.value.id in result_vars
        return False
    if isinstance(base, ast.Name):
        return OUTPUT_NAME.search(base.id) is not None or base.id in output_vars
    return call_dotted(base, aliases) in OUTPUT_CALLS


def is_measured_end(node):
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Sub):
        return True
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        return node.func.attr in MEASURED_ENDS
    return False


def head_cut_value(node):
    if not (isinstance(node, ast.Subscript) and isinstance(node.slice, ast.Slice)):
        return None
    sl = node.slice
    if sl.upper is None:
        return None
    if sl.lower is not None and not (isinstance(sl.lower, ast.Constant) and sl.lower.value == 0):
        return None
    if sl.step is not None and not (isinstance(sl.step, ast.Constant) and sl.step.value == 1):
        return None
    if isinstance(sl.upper, ast.UnaryOp) and isinstance(sl.upper.op, ast.USub):
        return None
    if isinstance(sl.upper, ast.Constant) and isinstance(sl.upper.value, int) and sl.upper.value < SHORT_CUT:
        return None
    if is_measured_end(sl.upper):
        return None
    return node.value


def is_error_call(call, aliases):
    func = call.func
    if isinstance(func, ast.Attribute):
        if func.attr in LOG_ERROR_LEVELS and is_log_owner(func.value, aliases):
            return True
        return ERROR_CALLEE.search(func.attr) is not None
    if isinstance(func, ast.Name):
        return ERROR_CALLEE.search(func.id) is not None
    return False


def is_sink_parent(parent, child, aliases):
    if isinstance(parent, ast.Raise):
        return True
    if isinstance(parent, ast.Call) and is_error_call(parent, aliases):
        if child in parent.args:
            return True
        return any(kw.value is child for kw in parent.keywords)
    return False


def climb_step(node, context):
    parent = context.parents.get(id(node))
    if parent is None:
        return None
    if isinstance(parent, (ast.FormattedValue, ast.JoinedStr, ast.BinOp, ast.BoolOp, ast.IfExp)):
        return parent
    if isinstance(parent, (ast.Dict, ast.Tuple, ast.List, ast.keyword)):
        return parent
    if (
        isinstance(parent, ast.Call)
        and isinstance(parent.func, ast.Attribute)
        and parent.func.attr in {"format", "strip", "decode"}
    ):
        return parent
    if isinstance(parent, ast.Call) and isinstance(parent.func, ast.Name) and parent.func.id == "str":
        return parent
    return None


def direct_sink(node, context):
    current = node
    while True:
        parent = context.parents.get(id(current))
        if parent is None:
            return False
        if isinstance(parent, ast.keyword):
            call = context.parents.get(id(parent))
            if isinstance(call, ast.Call) and is_error_call(call, context.aliases):
                return True
        if is_sink_parent(parent, current, context.aliases):
            return True
        nxt = climb_step(current, context)
        if nxt is None:
            return False
        current = nxt


def reaches_sink(node, context, scope):
    if direct_sink(node, context):
        return True
    parent = context.parents.get(id(node))
    target = None
    if isinstance(parent, ast.Assign) and len(parent.targets) == 1 and isinstance(parent.targets[0], ast.Name):
        target = parent.targets[0].id
    elif isinstance(parent, ast.AnnAssign) and isinstance(parent.target, ast.Name):
        target = parent.target.id
    if target is None:
        return False
    return any(direct_sink(read, context) for read in scope_reads(target, scope))


def keeps_end(scope):
    for node in own_nodes(scope):
        if (
            isinstance(node, ast.Subscript)
            and isinstance(node.slice, ast.Slice)
            and node.slice.upper is None
            and node.slice.lower is not None
        ):
            return True
    return False


def scope_findings(scope, context):
    if keeps_end(scope):
        return []
    output_vars, result_vars = collect_output_vars(scope, context.aliases)
    found = []
    for node in own_nodes(scope):
        value = head_cut_value(node)
        if value is None:
            continue
        if is_output_text(value, output_vars, result_vars, context.aliases) and reaches_sink(node, context, scope):
            found.append(finding(context.path, RULE, ast.unparse(node), node))
    return found


def check(context):
    if exempt(context):
        return []
    found = scope_findings(context.tree, context)
    for node in ast.walk(context.tree):
        if isinstance(node, FUNCTION_TYPES):
            found.extend(scope_findings(node, context))
    return found
