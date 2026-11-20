import ast

from affixes.names import name_of, words_of

BOUNDARY_CHARACTERS = "/\\.:-_@?#=&"
SEPARATOR_WORDS = {"sep", "separator", "slash", "delimiter"}
MAX_DEPTH = 6


def text_of(node, constants):
    if isinstance(node, ast.Name):
        node = constants.get(node.id, node)
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def ends_with_character(text):
    return text == "" or text[-1] in BOUNDARY_CHARACTERS


def names_separator(node):
    name = name_of(node)
    return name is not None and any(word in SEPARATOR_WORDS for word in words_of(name))


def joined_ends(node, constants, depth):
    last = node.values[-1] if node.values else None
    if last is None:
        return True
    if isinstance(last, ast.Constant):
        return ends_with_character(last.value)
    return ends_with_boundary(last.value, constants, depth + 1)


def call_ends(node, constants, depth):
    if names_separator(node.func):
        return True
    name = name_of(node.func)
    return (
        name in {"join", "joinpath", "concat"}
        and bool(node.args)
        and ends_with_boundary(node.args[-1], constants, depth + 1)
    )


def ends_with_boundary(node, constants, depth=0):
    text = text_of(node, constants)
    if depth > MAX_DEPTH:
        return True
    if text is not None:
        return ends_with_character(text)
    if isinstance(node, ast.JoinedStr):
        return joined_ends(node, constants, depth)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return ends_with_boundary(node.right, constants, depth + 1)
    if isinstance(node, ast.Call):
        return call_ends(node, constants, depth)
    if isinstance(node, ast.IfExp):
        return any(ends_with_boundary(branch, constants, depth + 1) for branch in (node.body, node.orelse))
    return names_separator(node)


def starts_with_boundary(node, constants):
    text = text_of(node, constants)
    if text is not None:
        return text == "" or text[0] in ".@/"
    if isinstance(node, ast.JoinedStr):
        first = node.values[0] if node.values else None
        return isinstance(first, ast.Constant) and first.value != "" and first.value[0] in ".@/"
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return starts_with_boundary(node.left, constants)
    return False


def leading_text(node, constants):
    text = text_of(node, constants)
    if text is not None:
        return text
    if isinstance(node, ast.JoinedStr):
        first = node.values[0] if node.values else None
        return first.value if isinstance(first, ast.Constant) else None
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return leading_text(node.left, constants)
    return None
