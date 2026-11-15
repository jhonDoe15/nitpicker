import ast
import re

FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


def binders(root, name):
    kinds = []
    for node in ast.walk(root):
        if isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
            if node.id == name:
                kinds.append("assign")
        elif isinstance(node, ast.arg) and node.arg == name:
            kinds.append("argument")
        elif isinstance(node, FUNCTIONS + (ast.ClassDef,)) and node.name == name:
            kinds.append("definition")
        elif isinstance(node, ast.ExceptHandler) and node.name == name:
            kinds.append("assign")
        elif isinstance(node, ast.alias):
            if (node.asname or node.name.split(".")[0]) == name:
                kinds.append("import")
        elif isinstance(node, (ast.Global, ast.Nonlocal)) and name in node.names:
            kinds.append("assign")
        elif isinstance(node, (ast.MatchAs, ast.MatchStar)) and node.name == name:
            kinds.append("assign")
        elif isinstance(node, ast.MatchMapping) and node.rest == name:
            kinds.append("assign")
    return kinds


def names_mentioned(index, name):
    word = re.compile(r"(?<![\w])" + re.escape(name) + r"(?![\w])")
    if any(word.search(text) for text in getattr(index, "extra_texts", [])):
        return True
    for tree in index.trees.values():
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                value = node.value
                if value == name or (
                    not any(c.isspace() for c in value) and value.endswith(("." + name, ":" + name))
                ):
                    return True
    return False


def module_functions(tree, name):
    return [
        node
        for node in tree.body
        if isinstance(node, FUNCTIONS + (ast.ClassDef,)) and node.name == name
    ]
