import ast
import io
import tokenize

from source_text import refuse

FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
FORBIDDEN_NODES = (
    ast.Global,
    ast.Nonlocal,
    ast.Yield,
    ast.YieldFrom,
    ast.Import,
    ast.ImportFrom,
    ast.ClassDef,
    ast.Match,
    ast.Delete,
) + FUNCTIONS
FORBIDDEN_NAMES = {
    "super",
    "locals",
    "vars",
    "eval",
    "exec",
    "globals",
    "dir",
    "__class__",
    "__builtins__",
}
SKIPPED = "the code declares a function or class, imports, deletes, yields or reads its own scope"


def is_mangled(name):
    return name.startswith("__") and not name.endswith("__")


def forbidden(nodes):
    for root in nodes:
        for node in ast.walk(root):
            if isinstance(node, FORBIDDEN_NODES):
                refuse(SKIPPED)
            if isinstance(node, ast.Name) and node.id in FORBIDDEN_NAMES:
                refuse(SKIPPED)
            text = node.id if isinstance(node, ast.Name) else getattr(node, "attr", "")
            if is_mangled(text):
                refuse("the code uses a private name that Python mangles by class")


def bound_names(root):
    names = set()
    for node in ast.walk(root):
        if isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
            names.add(node.id)
        elif isinstance(node, ast.arg):
            names.add(node.arg)
        elif isinstance(node, ast.ExceptHandler) and node.name:
            names.add(node.name)
    return names


def comprehension_targets(root):
    names = set()
    for node in ast.walk(root):
        if isinstance(node, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
            for generator in node.generators:
                names.update(bound_names(generator.target))
    return names


def stored_names(nodes):
    found = set()
    for root in nodes:
        for node in ast.walk(root):
            if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
                found.add(node.id)
            elif isinstance(node, ast.ExceptHandler) and node.name:
                found.add(node.name)
    return found


def defined_names(nodes):
    found = stored_names(nodes)
    for root in nodes:
        for node in ast.walk(root):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                found.add(node.name)
            elif isinstance(node, ast.alias):
                found.add((node.asname or node.name).split(".")[0])
    return found


def loaded_names(nodes):
    found = []
    for root in nodes:
        for node in ast.walk(root):
            if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
                if node.id not in found:
                    found.append(node.id)
    return found


def used_names(nodes):
    found = []
    for root in nodes:
        for node in ast.walk(root):
            if isinstance(node, ast.Name) and node.id not in found:
                found.append(node.id)
    return found


def identifiers(tree):
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            names.add(node.id)
        elif isinstance(node, ast.arg):
            names.add(node.arg)
        elif isinstance(node, ast.Attribute):
            names.add(node.attr)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, ast.alias):
            names.add((node.asname or node.name).split(".")[0])
        elif isinstance(node, ast.keyword) and node.arg:
            names.add(node.arg)
    return names


def comments_in(text, first, last):
    found = []
    try:
        for token in tokenize.generate_tokens(io.StringIO(text).readline):
            if token.type == tokenize.COMMENT and first <= token.start[0] <= last:
                found.append(token.string.strip())
    except (tokenize.TokenError, IndentationError, SyntaxError):
        refuse("the file could not be tokenized")
    return found
