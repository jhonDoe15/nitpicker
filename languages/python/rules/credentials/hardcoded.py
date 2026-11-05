import ast

from checks.common import dotted_name, finding
from credentials.sources import assignments, reads_settings
from credentials.values import has_credential_shape, is_hardcoded_secret, is_secret_name

TEXT_CONVERSIONS = {"str", "bytes"}
WRAPPERS = {"field", "Field"}
SECRET_WRAPPERS = {"SecretStr", "SecretBytes"}
NOT_THE_VALUE = {
    "format",
    "format_map",
    "startswith",
    "endswith",
    "join",
    "split",
    "count",
}


def is_encode(node):
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "encode"
    )


def converted(node):
    if is_encode(node):
        return node.func.value
    named = isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
    if named and node.func.id in TEXT_CONVERSIONS and node.args:
        return node.args[0]
    return None


def folded_text(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, (str, bytes)):
        value = node.value
        return value.decode("latin-1") if isinstance(value, bytes) else value
    if converted(node) is not None:
        return folded_text(converted(node))
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        left, right = folded_text(node.left), folded_text(node.right)
        return left + right if left is not None and right is not None else None
    if isinstance(node, ast.JoinedStr):
        parts = [folded_text(v) for v in node.values if isinstance(v, ast.Constant)]
        return "".join(parts) if parts and all(p is not None for p in parts) else None
    return None


def unwrapped(node, aliases):
    if not isinstance(node, ast.Call):
        return node
    name = (dotted_name(node.func, aliases) or "").rsplit(".", 1)[-1]
    if name in WRAPPERS:
        defaults = [k.value for k in node.keywords if k.arg == "default"]
        return defaults[0] if defaults else (node.args[0] if node.args else node)
    return node


def opening_literal(node):
    method = isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
    if method and node.func.attr not in NOT_THE_VALUE:
        return node.func.value
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return node.left
    return None


def branches(node, aliases):
    if isinstance(node, ast.BoolOp):
        return list(node.values)
    if isinstance(node, ast.IfExp):
        return [node.body, node.orelse]
    if isinstance(node, ast.Call) and reads_settings(node, aliases):
        fallbacks = [k.value for k in node.keywords if k.arg == "default"]
        return fallbacks + node.args[1:2]
    opening = opening_literal(node)
    return [opening] if opening is not None else []


def literal_strings(node, aliases):
    node = unwrapped(node, aliases)
    text = folded_text(node)
    if text is not None:
        return [(text, node)]
    return [
        leaf
        for branch in branches(node, aliases)
        for leaf in literal_strings(branch, aliases)
    ]


def hardcoded_findings(context):
    found = []
    for name, value, node in assignments(context):
        if name is None or not is_secret_name(name):
            continue
        for text, literal in literal_strings(value, context.aliases):
            if is_hardcoded_secret(text, name):
                found.append(finding(context.path, "hardcoded-secret", name, literal))
    return unique(found + wrapped_secret_findings(context))


def unique(findings):
    seen = {}
    for item in findings:
        seen.setdefault((item["line"], item["subject"]), item)
    return list(seen.values())


def wrapped_secret_findings(context):
    found = []
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call) or not node.args:
            continue
        name = (dotted_name(node.func, context.aliases) or "").rsplit(".", 1)[-1]
        text = folded_text(node.args[0])
        wrapped = name in SECRET_WRAPPERS and text is not None
        if wrapped and is_hardcoded_secret(text, "passphrase"):
            found.append(finding(context.path, "hardcoded-secret", name, node))
    return found


def shape_findings(context):
    return [
        finding(context.path, "credential-shape", "credential", node)
        for node in ast.walk(context.tree)
        if isinstance(node, ast.Constant)
        and isinstance(node.value, str)
        and has_credential_shape(node.value)
    ]


def check(context):
    if context.tests:
        return []
    return hardcoded_findings(context) + shape_findings(context)
