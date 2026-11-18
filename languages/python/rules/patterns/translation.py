import ast
import re

from checks.common import finding, shown

GUARDED = True
RULE = "pattern-translation"
REGEX_TOKENS = {
    ".*",
    ".+",
    ".",
    ".?",
    "(.*)",
    "(.+)",
    "[^/]*",
    "[^/]+",
    "[^/]",
    "([^/]*)",
    "([^/]+)",
    "[\\s\\S]*",
}
ESCAPING_REPLACEMENT = re.compile(r"\\g<|\\\d|^\\+[%_]$")
ESCAPE_NAME = re.compile(r"escape|quote", re.IGNORECASE)
REGEX_FUNCTIONS = {
    "compile",
    "match",
    "search",
    "fullmatch",
    "findall",
    "finditer",
    "sub",
    "subn",
    "split",
}


def constant_text(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def link_of(node):
    if not isinstance(node, ast.Call) or node.keywords:
        return None
    func = node.func
    if isinstance(func, ast.Attribute) and func.attr == "replace" and len(node.args) == 2:
        return func.value, constant_text(node.args[1])
    is_sub = isinstance(func, ast.Attribute) and func.attr == "sub"
    if is_sub and isinstance(func.value, ast.Name) and func.value.id == "re" and len(node.args) == 3:
        return node.args[2], constant_text(node.args[1])
    return None


def chain_of(top):
    replacements = []
    current = top
    while True:
        link = link_of(current)
        if link is None:
            return replacements, current
        replacements.append(link[1])
        current = link[0]


def is_top(node, parents):
    parent = parents.get(id(node))
    if isinstance(parent, ast.Attribute) and parent.value is node:
        return link_of(parents.get(id(parent))) is None
    if isinstance(parent, ast.Call) and link_of(parent) is not None:
        return link_of(parent)[0] is not node
    return True


def call_name(node):
    if isinstance(node, ast.Call):
        func = node.func
        return func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")
    return node.id if isinstance(node, ast.Name) else ""


def is_constant_root(root):
    return isinstance(root, ast.Constant) or (
        isinstance(root, ast.JoinedStr) and all(isinstance(part, ast.Constant) for part in root.values)
    )


def reaches_regex(node, parents):
    parent = parents.get(id(node))
    if not (isinstance(parent, ast.Call) and parent.args and parent.args[0] is node):
        return False
    func = parent.func
    owner = isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name)
    return owner and func.value.id == "re" and func.attr in REGEX_FUNCTIONS


def bound_name(node, parents):
    parent = parents.get(id(node))
    if isinstance(parent, ast.Assign) and len(parent.targets) == 1:
        target = parent.targets[0]
        return target.id if isinstance(target, ast.Name) else None
    return None


def scope_of(node, parents):
    current = parents.get(id(node))
    while current is not None and not isinstance(
        current, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Module)
    ):
        current = parents.get(id(current))
    return current


def flows_to_regex(node, parents):
    if reaches_regex(node, parents):
        return True
    name = bound_name(node, parents)
    scope = scope_of(node, parents)
    return name is not None and scope is not None and any(
        isinstance(use, ast.Name)
        and use.id == name
        and isinstance(use.ctx, ast.Load)
        and reaches_regex(use, parents)
        for use in ast.walk(scope)
    )


def kind_of(replacements):
    texts = [text for text in replacements if text is not None]
    likes = [text for text in texts if text in ("%", "_")]
    if "%" in likes and len(likes) >= 2:
        return "like"
    return "regex" if any(text in REGEX_TOKENS for text in texts) else None


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if link_of(node) is None or not is_top(node, context.parents):
            continue
        replacements, root = chain_of(node)
        kind = kind_of(replacements)
        escaped = any(ESCAPING_REPLACEMENT.search(text or "") for text in replacements)
        if (
            len(replacements) < 2
            or kind is None
            or escaped
            or is_constant_root(root)
            or ESCAPE_NAME.search(call_name(root))
        ):
            continue
        if kind == "like" or flows_to_regex(node, context.parents):
            subject = f"{kind}|{shown(ast.unparse(root))}"
            found.append(finding(context.path, RULE, subject, node))
    return found
