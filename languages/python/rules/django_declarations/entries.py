import ast
import re

from orm.models import constant

PATH = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
SEARCH_PREFIXES = "^=@$"
ALL_FIELDS = "__all__"


def elements(node):
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        return list(node.elts)
    if isinstance(node, ast.Dict):
        return [key for key in node.keys if key is not None]
    return []


def text_of(node):
    if isinstance(node, ast.Tuple) and node.elts:
        node = node.elts[0]
    value = constant(node)
    return value if isinstance(value, str) else None


def cleaned(text, attribute):
    if attribute == "search_fields":
        text = text.lstrip(SEARCH_PREFIXES)
    elif attribute in ("ordering", "ordering_fields"):
        text = text.lstrip("-")
    parts = text.split("__")
    if text == ALL_FIELDS or not all(PATH.match(part) for part in parts):
        return None
    return text


def entries(value, attribute):
    found = []
    for node in elements(value):
        text = text_of(node)
        text = cleaned(text, attribute) if text is not None else None
        if text is not None:
            found.append((text, node))
    return found
