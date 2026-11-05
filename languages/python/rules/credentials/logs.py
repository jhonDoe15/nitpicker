import ast
import re

from checks.common import dotted_name, finding, is_log_call, last_name, words_of
from credentials.sources import ENVIRONMENT_READERS
from credentials.values import is_secret_name

CONSTANT_NAME = re.compile(r"^[A-Z][A-Z0-9_]*$")
STATUS_WORDS = {"has", "is"}
FORMATTERS = {"str", "repr", "format", "ascii", "bytes"}
OUTPUT_FUNCTIONS = {
    "print",
    "pprint.pprint",
    "sys.stdout.write",
    "sys.stderr.write",
    "click.echo",
    "click.secho",
    "warnings.warn",
}
RECEIVER = re.compile(r"tokenizer$", re.IGNORECASE)


def string_key(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def read_key(node, aliases):
    if not isinstance(node, ast.Call) or not node.args:
        return None
    function = node.func
    reads = dotted_name(function, aliases) in ENVIRONMENT_READERS
    gets = isinstance(function, ast.Attribute) and function.attr == "get"
    return string_key(node.args[0]) if reads or gets else None


def own_names(node, aliases):
    if isinstance(node, ast.Name):
        return [(node.id, False)]
    if isinstance(node, ast.Attribute):
        receiver = last_name(node.value) or ""
        return [] if RECEIVER.search(receiver) else [(node.attr, False)]
    if isinstance(node, ast.Subscript) and string_key(node.slice) is not None:
        return [(node.slice.value, True)]
    key = read_key(node, aliases)
    return [(key, True)] if key is not None else []


def logged_children(node):
    if isinstance(node, ast.JoinedStr):
        return [v.value for v in node.values if isinstance(v, ast.FormattedValue)]
    if isinstance(node, ast.Dict):
        return [v for k, v in zip(node.keys, node.values) if k is not None]
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        return list(node.elts)
    if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Mod)):
        return [node.left, node.right]
    if isinstance(node, ast.BoolOp):
        return list(node.values)
    if isinstance(node, (ast.Starred, ast.keyword, ast.NamedExpr)):
        return [node.value]
    if isinstance(node, ast.Call):
        return call_arguments(node)
    return []


def call_arguments(node):
    function = node.func
    formats = isinstance(function, ast.Attribute) and function.attr == "format"
    wraps = isinstance(function, ast.Name) and function.id in FORMATTERS
    if formats or wraps:
        return list(node.args) + [k.value for k in node.keywords]
    return []


def is_status_name(name):
    return (words_of(name) or [""])[0] in STATUS_WORDS


def names_a_value(node, aliases):
    names = own_names(node, aliases)
    return bool(names) and not is_status_name(names[-1][0])


def paired_keys(node, aliases):
    if isinstance(node, ast.keyword) and node.arg is not None:
        return [(node.arg, True)] if names_a_value(node.value, aliases) else []
    if not isinstance(node, ast.Dict):
        return []
    return [
        (key.value, True)
        for key, value in zip(node.keys, node.values)
        if string_key(key) is not None and names_a_value(value, aliases)
    ]


def logged_names(arguments, aliases):
    names = []
    pending = list(arguments)
    for node in pending:
        names.extend(own_names(node, aliases))
        names.extend(paired_keys(node, aliases))
        pending.extend(logged_children(node))
    return names


def is_logged_secret(name, key):
    constant = not key and CONSTANT_NAME.match(name)
    return is_secret_name(name) and not constant and not is_status_name(name)


def sink_arguments(node, aliases):
    if isinstance(node, ast.Raise) and isinstance(node.exc, ast.Call):
        return list(node.exc.args) + list(node.exc.keywords)
    if not isinstance(node, ast.Call):
        return None
    output = dotted_name(node.func, aliases) in OUTPUT_FUNCTIONS
    if output or is_log_call(node, aliases):
        return list(node.args) + list(node.keywords)
    return None


def log_findings(context):
    found = []
    for node in ast.walk(context.tree):
        arguments = sink_arguments(node, context.aliases)
        if arguments is None:
            continue
        names = logged_names(arguments, context.aliases)
        secrets = {name for name, key in names if is_logged_secret(name, key)}
        for name in sorted(secrets):
            found.append(finding(context.path, "secret-in-log", name, node))
    return found


def check(context):
    if context.tests:
        return []
    return log_findings(context)
