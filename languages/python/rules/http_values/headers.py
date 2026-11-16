import ast
import re

from checks.common import finding, shown
from http_values.origins import (
    is_structured_origin,
    is_value_origin,
    last_name,
    origin_of,
    scope_nodes,
    single_assignments,
    text_of,
)

CASE_RULE = "http-value-case"
SPLIT_RULE = "hand-split-http-header"
GUARDED = True
LETTERS = re.compile(r"[A-Za-z]")
SEPARATORS = re.compile(r"^[\s,;]*[,;][\s,;]*$")
COOKIE_PREFIX = re.compile(r"^__(?:Host|Secure)-")
MIME_TABLE = re.compile(r"mime|content_?type", re.IGNORECASE)
TEXT_METHODS = {"startswith", "endswith", "find", "index"}
LOOKUP_METHODS = {"get", "setdefault"}
SPLIT_METHODS = {"split", "rsplit", "partition", "rpartition"}
REGEX_FUNCTIONS = {"match", "search", "fullmatch", "findall", "finditer"}
FUNCTION_TYPES = (ast.FunctionDef, ast.AsyncFunctionDef)
LOWERING = {"lower", "casefold", "upper"}
PARSING_PATTERN = re.compile(r"[,;]|q\s*=|charset|boundary", re.IGNORECASE)


def literal_strings(node):
    if isinstance(node, (ast.Tuple, ast.List, ast.Set)):
        return [text for item in node.elts if (text := text_of(item)) is not None]
    text = text_of(node)
    return [] if text is None else [text]


def has_letters(node):
    return any(LETTERS.search(text) for text in literal_strings(node))


def is_regex_ignoring_case(call, pattern):
    flags = [*call.args[2:], *[keyword.value for keyword in call.keywords]]
    named = any(re.search(r"\bI(?:GNORECASE)?\b", ast.unparse(flag)) for flag in flags)
    return named or pattern.startswith("(?i")


def regex_call(node):
    if not isinstance(node, ast.Call) or last_name(node.func) not in REGEX_FUNCTIONS | {
        "split"
    }:
        return None
    if not isinstance(node.func, ast.Attribute) or last_name(node.func.value) != "re":
        return None
    pattern = text_of(node.args[0]) if node.args else None
    return (
        (pattern, node.args[1]) if pattern is not None and len(node.args) > 1 else None
    )


def compare_origin(node, env):
    operands = [node.left, *node.comparators]
    for side in operands:
        origin = origin_of(side, env)
        others = [item for item in operands if item is not side]
        if origin is not None and (
            any(has_letters(item) for item in others)
            or (
                any(isinstance(op, (ast.In, ast.NotIn)) for op in node.ops)
                and side is node.left
                and any(isinstance(item, (ast.Name, ast.Attribute)) for item in others)
            )
        ):
            return origin
    return None


def lookup_origin(node, env):
    if isinstance(node, ast.Subscript):
        table, key = node.value, node.slice
    elif (
        isinstance(node, ast.Call)
        and last_name(node.func) in LOOKUP_METHODS
        and node.args
    ):
        table = node.func.value if isinstance(node.func, ast.Attribute) else None
        key = node.args[0]
    else:
        return None
    origin = origin_of(key, env)
    if origin is None or table is None or is_header_bag(table):
        return None
    if origin[0] == "extension":
        return origin if MIME_TABLE.search(last_name(table) or "") else None
    return origin


def is_header_bag(node):
    return (last_name(node) or "").lower().endswith("headers")


def text_use(node, env):
    if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
        return None
    if node.func.attr in TEXT_METHODS and node.args and has_letters(node.args[0]):
        return origin_of(node.func.value, env)
    found = regex_call(node)
    if (
        found is not None
        and LETTERS.search(found[0])
        and not is_regex_ignoring_case(node, found[0])
    ):
        return origin_of(found[1], env)
    return None


def without_extension(origin):
    return None if origin is not None and origin[0] == "extension" else origin


def case_origin(node, env):
    if isinstance(node, ast.Compare):
        return without_extension(compare_origin(node, env))
    if isinstance(node, ast.Match):
        cases = [
            case.pattern
            for case in node.cases
            if isinstance(case.pattern, ast.MatchValue)
            and has_letters(case.pattern.value)
        ]
        return without_extension(origin_of(node.subject, env)) if cases else None
    return lookup_origin(node, env) or without_extension(text_use(node, env))


def split_origin(node, env):
    if not isinstance(node, ast.Call):
        return None
    if (
        isinstance(node.func, ast.Attribute)
        and node.func.attr in SPLIT_METHODS
        and node.args
        and (text_of(node.args[0]) or "") != ""
        and SEPARATORS.match(text_of(node.args[0]))
    ):
        return origin_of(node.func.value, env)
    found = regex_call(node)
    if found is not None and PARSING_PATTERN.search(found[0]):
        return origin_of(found[1], env)
    return None


def cookie_prefix(node):
    if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
        return False
    receiver = node.func.value
    lowered = isinstance(receiver, ast.Call) and last_name(receiver.func) in LOWERING
    prefix = text_of(node.args[0]) if node.args else None
    return (
        node.func.attr == "startswith"
        and prefix is not None
        and COOKIE_PREFIX.match(prefix) is not None
        and not lowered
    )


def name_lookup(node, env):
    if isinstance(node, ast.Subscript):
        table, key = node.value, text_of(node.slice)
    elif isinstance(node, ast.Call) and last_name(node.func) == "get" and node.args:
        table = node.func.value if isinstance(node.func, ast.Attribute) else None
        key = text_of(node.args[0])
    else:
        return False
    plain = table is not None and plain_copy(table, env)
    return plain and key is not None and any(char.isupper() for char in key)


def plain_copy(table, env, depth=0):
    value = env.get(table.id) if isinstance(table, ast.Name) else table
    if depth > 2 or value is None:
        return False
    if isinstance(value, ast.Name):
        return plain_copy(value, env, depth + 1)
    copies = (
        isinstance(value, ast.Call) and last_name(value.func) == "dict" and value.args
    )
    comprehension = isinstance(value, ast.DictComp) and any(
        "headers" in ast.unparse(generator.iter).lower()
        for generator in value.generators
    )
    return bool(copies and is_header_bag(value.args[0])) or comprehension


def scope_findings(scope, context):
    env = single_assignments(scope)
    found = []
    for node in scope_nodes(scope):
        subject = shown(ast.unparse(node).replace("\n", " "), 60)
        split = split_origin(node, env)
        if is_structured_origin(split):
            found.append(finding(context.path, SPLIT_RULE, subject, node))
        elif (
            is_value_origin(case_origin(node, env))
            or cookie_prefix(node)
            or name_lookup(node, env)
        ):
            found.append(finding(context.path, CASE_RULE, subject, node))
    return found


def check(context):
    if context.tests:
        return []
    scopes = [context.tree] + [
        node for node in ast.walk(context.tree) if isinstance(node, FUNCTION_TYPES)
    ]
    return [item for scope in scopes for item in scope_findings(scope, context)]
