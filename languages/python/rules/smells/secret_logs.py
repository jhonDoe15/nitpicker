import ast
import re

from checks.common import dotted_name, finding, is_log_call, words_of
from smells.secrets import is_secret_name

CONSTANT_NAME = re.compile(r"^[A-Z][A-Z0-9_]*$")
STATUS_KEYS = {"has", "is"}
FORMATTERS = {"str", "repr", "format", "ascii", "bytes"}
OUTPUT_FUNCTIONS = {"print", "pprint.pprint", "sys.stdout.write", "sys.stderr.write"}


def own_names(node):
    if isinstance(node, ast.Name):
        return [node.id]
    if isinstance(node, ast.Attribute):
        return [node.attr]
    if isinstance(node, ast.Subscript) and isinstance(node.slice, ast.Constant):
        return [node.slice.value] if isinstance(node.slice.value, str) else []
    if isinstance(node, ast.Call):
        return call_key_names(node)
    return []


def call_key_names(node):
    function = node.func
    if isinstance(function, ast.Attribute) and function.attr == "get" and node.args:
        key = node.args[0]
        if isinstance(key, ast.Constant) and isinstance(key.value, str):
            return [key.value]
    return []


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
    if isinstance(node, ast.Starred):
        return [node.value]
    if isinstance(node, ast.keyword):
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


def dictionary_names(node):
    names = []
    if isinstance(node, ast.Dict):
        for key, value in zip(node.keys, node.values):
            if isinstance(key, ast.Constant) and isinstance(key.value, str):
                if own_names(value):
                    names.append(key.value)
    return names


def keyword_name(node):
    named = isinstance(node, ast.keyword) and node.arg is not None
    if named and isinstance(node.value, (ast.Name, ast.Attribute, ast.Subscript)):
        return [node.arg]
    return []


def logged_names(arguments):
    names = []
    pending = list(arguments)
    for node in pending:
        names.extend(own_names(node))
        names.extend(keyword_name(node))
        names.extend(dictionary_names(node))
        pending.extend(logged_children(node))
    return names


def is_status_name(name):
    return (words_of(name) or [""])[0] in STATUS_KEYS


def is_output_call(node, aliases):
    return (
        isinstance(node, ast.Call)
        and dotted_name(node.func, aliases) in OUTPUT_FUNCTIONS
    )


def log_findings(context):
    found = []
    for node in ast.walk(context.tree):
        if not (
            is_log_call(node, context.aliases) or is_output_call(node, context.aliases)
        ):
            continue
        names = logged_names(list(node.args) + list(node.keywords))
        secrets = {
            name
            for name in names
            if is_secret_name(name)
            and not CONSTANT_NAME.match(name)
            and not is_status_name(name)
        }
        for name in sorted(secrets):
            found.append(finding(context.path, "secret-in-log", name, node))
    return found


def check(context):
    if context.tests:
        return []
    return log_findings(context)
