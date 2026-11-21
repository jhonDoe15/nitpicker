import ast

from checks.common import dotted_name, finding, own_nodes
from processes.subprocess_calls import (
    ASYNC_EXEC_CALLS,
    ASYNC_OPEN_CALLS,
    ASYNC_SHELL_CALLS,
    POPEN_CALLS,
    RESULT_CALLS,
    resolve_expr,
)
from security.resolve.calls import keyword_entries
from security.resolve.scopes import where_of
from security.support import exempt
from signatures.annotations import FUNCTION_TYPES

RULE = "status-only-spawn-check"
GUARDED = True
PROCESS_FACTORIES = POPEN_CALLS | ASYNC_EXEC_CALLS | ASYNC_SHELL_CALLS | ASYNC_OPEN_CALLS
CODE_CALLS = {"subprocess.call"}
EXIT_CALLS = {"sys.exit", "os._exit"}
WAIT_METHODS = {"wait", "communicate"}


def is_check_true(call, where):
    entries = keyword_entries(call.keywords, where)
    for key, value, place in entries.items:
        if key == "check":
            resolved, _ = resolve_expr(value, place)
            return isinstance(resolved, ast.Constant) and resolved.value is True
    return False


def unwrap_await(node):
    return node.value if isinstance(node, ast.Await) else node


def call_dotted(node, aliases):
    inner = unwrap_await(node)
    if isinstance(inner, ast.Call):
        return dotted_name(inner.func, aliases) or "", inner
    return "", None


def waited_processes(scope):
    waited = set()
    for node in own_nodes(scope):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in WAIT_METHODS
            and isinstance(node.func.value, ast.Name)
        ):
            waited.add(node.func.value.id)
    return waited


def collect_bindings(scope, context):
    aliases = context.aliases
    waited = waited_processes(scope)
    result_vars = set()
    unwaited_procs = set()
    waited_procs = set()
    nullable_codes = set()
    int_codes = set()
    for node in own_nodes(scope):
        if isinstance(node, (ast.With, ast.AsyncWith)):
            for item in node.items:
                if isinstance(item.optional_vars, ast.Name):
                    dotted, _ = call_dotted(item.context_expr, aliases)
                    if dotted in PROCESS_FACTORIES:
                        target_set = waited_procs if item.optional_vars.id in waited else unwaited_procs
                        target_set.add(item.optional_vars.id)
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name, value = node.targets[0].id, node.value
            classify_binding(
                name, value, context, aliases, waited,
                result_vars, unwaited_procs, waited_procs, nullable_codes, int_codes,
            )
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.value is not None:
            classify_binding(
                node.target.id, node.value, context, aliases, waited,
                result_vars, unwaited_procs, waited_procs, nullable_codes, int_codes,
            )
    return result_vars, unwaited_procs, waited_procs, nullable_codes, int_codes


def classify_binding(
    name, value, context, aliases, waited,
    result_vars, unwaited_procs, waited_procs, nullable_codes, int_codes,
):
    dotted, call = call_dotted(value, aliases)
    if dotted in RESULT_CALLS and call is not None:
        if not is_check_true(call, where_of(call, context)):
            result_vars.add(name)
        return
    if dotted in PROCESS_FACTORIES:
        (waited_procs if name in waited else unwaited_procs).add(name)
        return
    if dotted in CODE_CALLS:
        int_codes.add(name)
        return
    inner = unwrap_await(value)
    if isinstance(inner, ast.Call) and isinstance(inner.func, ast.Attribute):
        owner = inner.func.value
        if isinstance(owner, ast.Name):
            if inner.func.attr == "poll" and owner.id in (unwaited_procs | waited_procs):
                nullable_codes.add(name)
                return
            if inner.func.attr == "wait" and owner.id in (unwaited_procs | waited_procs):
                int_codes.add(name)
                return
    if isinstance(inner, ast.Attribute) and inner.attr == "returncode":
        if isinstance(inner.value, ast.Name):
            if inner.value.id in unwaited_procs:
                nullable_codes.add(name)
            elif inner.value.id in (result_vars | waited_procs):
                int_codes.add(name)
        else:
            d2, c2 = call_dotted(inner.value, aliases)
            if d2 in RESULT_CALLS and c2 is not None and not is_check_true(c2, where_of(c2, context)):
                int_codes.add(name)


def is_zero(node):
    return isinstance(node, ast.Constant) and node.value == 0 and not isinstance(node.value, bool)


def is_one(node):
    return isinstance(node, ast.Constant) and node.value == 1 and not isinstance(node.value, bool)


def is_none_const(node):
    return isinstance(node, ast.Constant) and node.value is None


def is_neg_one(node):
    return (
        isinstance(node, ast.UnaryOp)
        and isinstance(node.op, ast.USub)
        and is_one(node.operand)
    )


def checks_negative(node, parent):
    if not isinstance(parent, ast.Compare) or len(parent.ops) != 1:
        return False
    left, op, right = parent.left, parent.ops[0], parent.comparators[0]
    if left is node:
        return (isinstance(op, ast.Lt) and is_zero(right)) or (isinstance(op, ast.LtE) and is_neg_one(right))
    if right is node:
        return (isinstance(op, ast.Gt) and is_zero(left)) or (isinstance(op, ast.GtE) and is_neg_one(left))
    return False


def misses_signal_compare(node, parent):
    if not isinstance(parent, ast.Compare) or len(parent.ops) != 1:
        return False
    left, op, right = parent.left, parent.ops[0], parent.comparators[0]
    if left is node:
        return (
            (isinstance(op, ast.Gt) and is_zero(right))
            or (isinstance(op, ast.GtE) and is_one(right))
            or (isinstance(op, ast.LtE) and is_zero(right))
            or (isinstance(op, ast.Lt) and is_one(right))
        )
    if right is node:
        return (
            (isinstance(op, ast.Lt) and is_zero(left))
            or (isinstance(op, ast.LtE) and is_one(left))
            or (isinstance(op, ast.GtE) and is_zero(left))
            or (isinstance(op, ast.Gt) and is_one(left))
        )
    return False


def checks_none(node, parent):
    if (
        isinstance(parent, ast.Compare)
        and len(parent.ops) == 1
        and isinstance(parent.ops[0], (ast.Is, ast.IsNot))
    ):
        other = parent.comparators[0] if parent.left is node else parent.left
        return is_none_const(other)
    if isinstance(parent, ast.Call) and isinstance(parent.func, ast.Name):
        return parent.func.id == "isinstance" and bool(parent.args) and parent.args[0] is node
    return False


def in_truthy_test(node, context):
    current = node
    parent = context.parents.get(id(current))
    if isinstance(parent, ast.UnaryOp) and isinstance(parent.op, ast.Not):
        return True
    while isinstance(parent, ast.BoolOp):
        current = parent
        parent = context.parents.get(id(current))
    if isinstance(parent, (ast.If, ast.IfExp, ast.While)):
        return parent.test is current
    return isinstance(parent, ast.UnaryOp) and isinstance(parent.op, ast.Not)


def is_exit_arg(node, parent, aliases):
    return (
        isinstance(parent, ast.Call)
        and bool(parent.args)
        and parent.args[0] is node
        and (dotted_name(parent.func, aliases) or "") in EXIT_CALLS
    )


def in_message(node, parent):
    if isinstance(parent, ast.FormattedValue):
        return True
    if isinstance(parent, ast.Call) and isinstance(parent.func, ast.Name) and parent.func.id == "str":
        return bool(parent.args) and parent.args[0] is node
    return False


def status_uses(scope, context):
    result_vars, unwaited_procs, waited_procs, nullable_codes, int_codes = collect_bindings(scope, context)
    aliases = context.aliases
    int_groups = {}
    nullable_groups = {}
    for node in own_nodes(scope):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
            if node.id in nullable_codes:
                nullable_groups.setdefault(node.id, []).append(node)
            elif node.id in int_codes:
                int_groups.setdefault(node.id, []).append(node)
        elif isinstance(node, ast.Attribute) and node.attr == "returncode":
            if isinstance(node.value, ast.Name):
                if node.value.id in unwaited_procs:
                    nullable_groups.setdefault(f"{node.value.id}.returncode", []).append(node)
                elif node.value.id in (result_vars | waited_procs):
                    int_groups.setdefault(f"{node.value.id}.returncode", []).append(node)
            else:
                dotted, call = call_dotted(node.value, aliases)
                if dotted in RESULT_CALLS and call is not None and not is_check_true(call, where_of(call, context)):
                    int_groups.setdefault(f"direct:{id(node)}", []).append(node)
        elif (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "poll"
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id in (unwaited_procs | waited_procs)
        ):
            nullable_groups.setdefault(f"{node.func.value.id}.poll", []).append(node)
    return int_groups, nullable_groups


def check_int_group(nodes, context):
    if any(checks_negative(node, context.parents.get(id(node))) for node in nodes):
        return []
    found = []
    for node in nodes:
        parent = context.parents.get(id(node))
        if misses_signal_compare(node, parent):
            found.append(finding(context.path, RULE, ast.unparse(parent), parent))
    return found


def check_nullable_group(nodes, context):
    if any(checks_none(node, context.parents.get(id(node))) for node in nodes):
        return check_int_group(nodes, context)
    found = []
    for node in nodes:
        parent = context.parents.get(id(node))
        if is_exit_arg(node, parent, context.aliases) or misses_signal_compare(node, parent):
            found.append(finding(context.path, RULE, ast.unparse(parent), parent))
        elif in_truthy_test(node, context) or in_message(node, parent):
            found.append(finding(context.path, RULE, ast.unparse(node), node))
    return found


def scope_findings(scope, context):
    int_groups, nullable_groups = status_uses(scope, context)
    found = []
    for nodes in int_groups.values():
        found.extend(check_int_group(nodes, context))
    for nodes in nullable_groups.values():
        found.extend(check_nullable_group(nodes, context))
    return found


def check(context):
    if exempt(context):
        return []
    found = scope_findings(context.tree, context)
    for node in ast.walk(context.tree):
        if isinstance(node, FUNCTION_TYPES):
            found.extend(scope_findings(node, context))
    return found
