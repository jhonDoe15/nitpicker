import ast

from checks.common import finding, last_name, shown
from signatures.annotations import FUNCTION_TYPES
from truthiness.numbers import scope_nodes
from tuples.messages import message_tuples
from tuples.shapes import holds_sequence, sequence_names, tuple_returners
from tuples.source import is_wrapped, wrapped_text

SINGLE_RULE = "parenthesised-tuple-argument"
MESSAGE_RULE = "message-tuple-argument"
GUARDED = True
KEYWORDS = {"args", "parameters"}
QUERY_CALLS = {"execute", "executemany", "run_sql"}
STARTERS = {"apply_async": 1, "Thread": 3, "Process": 3}
ARGUMENT_STRINGS = {
    "run",
    "Popen",
    "call",
    "check_call",
    "check_output",
    "create_subprocess_exec",
    "parse_args",
    "parse_known_args",
}
REDUCERS = {"__reduce__", "__reduce_ex__"}


def positional_slot(call):
    name = last_name(call.func)
    index = 1 if name in QUERY_CALLS else STARTERS.get(name)
    has_star = any(isinstance(item, ast.Starred) for item in call.args)
    if index is None or has_star or len(call.args) <= index:
        return []
    return [("", call.args[index])]


def call_slots(call):
    if last_name(call.func) in ARGUMENT_STRINGS:
        return []
    keywords = [
        (f"{item.arg}=", item.value) for item in call.keywords if item.arg in KEYWORDS
    ]
    return keywords + positional_slot(call)


def reduce_slots(node, scope):
    is_reducer = isinstance(scope, FUNCTION_TYPES) and scope.name in REDUCERS
    is_pair = (
        is_reducer
        and isinstance(node, ast.Return)
        and isinstance(node.value, ast.Tuple)
        and len(node.value.elts) >= 2
    )
    return [("", node.value.elts[1])] if is_pair else []


def scope_findings(scope, context):
    nodes = list(scope_nodes(scope))
    returners = tuple_returners(context)
    names = sequence_names(scope, nodes, returners)
    found = []
    for node in nodes:
        slots = call_slots(node) if isinstance(node, ast.Call) else []
        for prefix, value in slots + reduce_slots(node, scope):
            if not holds_sequence(value, names, returners) and is_wrapped(
                value, context
            ):
                subject = wrapped_text(value, context, prefix)
                found.append(finding(context.path, SINGLE_RULE, subject, value))
    for message in message_tuples(nodes, context):
        subject = shown(ast.unparse(message).replace("\n", " "), 60)
        found.append(finding(context.path, MESSAGE_RULE, subject, message))
    return found


def check(context):
    if context.tests:
        return []
    scopes = [context.tree] + [
        node for node in ast.walk(context.tree) if isinstance(node, FUNCTION_TYPES)
    ]
    return [item for scope in scopes for item in scope_findings(scope, context)]
