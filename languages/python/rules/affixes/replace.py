import ast
import re

from affixes.boundary import text_of
from affixes.names import is_directory_name, module_constants, name_of
from checks.common import finding

RULE = "unanchored-affix-replace"
SUFFIX_PATTERN = re.compile(r"^\.[a-z0-9]{1,8}$", re.IGNORECASE)
URL_PARTS = {"port", "host", "hostname", "netloc", "path", "origin"}
WORKING_DIRECTORIES = {"getcwd", "home", "homedir", "cwd"}
CHECKS = {"startswith", "endswith"}
SHOWN = 40


def is_prefix_value(node):
    name = name_of(node)
    if name is None or isinstance(node, ast.Constant):
        return False
    if isinstance(node, ast.Call):
        return name in WORKING_DIRECTORIES
    return (isinstance(node, ast.Attribute) and name in URL_PARTS) or is_directory_name(node)


STATEMENT_STEPS = (ast.Return, ast.Expr, ast.Assign, ast.AnnAssign, ast.AugAssign)
COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.GeneratorExp, ast.DictComp)


def enclosing_if(node, parents):
    current = parents.get(id(node))
    while isinstance(current, STATEMENT_STEPS):
        current = parents.get(id(current))
    return current if isinstance(current, ast.If) else None


def guard_root(node, parents):
    current = node
    while True:
        parent = parents.get(id(current))
        if isinstance(parent, (ast.BoolOp, ast.UnaryOp, ast.IfExp)):
            current = parent
        elif isinstance(parent, ast.If) and parent.test is current:
            return parent
        else:
            return enclosing_if(current, parents) or current


def guard_roots(call, parents):
    roots = [guard_root(call, parents)]
    current = parents.get(id(call))
    while current is not None:
        if isinstance(current, COMPREHENSIONS):
            roots.extend(test for generator in current.generators for test in generator.ifs)
        current = parents.get(id(current))
    return roots


def guarded(call, pattern, parents):
    text = ast.unparse(pattern)
    return any(
        node is not call
        and isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in CHECKS
        and node.args
        and ast.unparse(node.args[0]) == text
        for root in guard_roots(call, parents)
        for node in ast.walk(root)
    )


def kind_of(pattern, replacement, constants):
    literal = text_of(pattern, constants)
    if literal is not None:
        suffix = SUFFIX_PATTERN.match(literal) and text_of(replacement, constants) == ""
        return "suffix" if suffix else None
    return "prefix" if is_prefix_value(pattern) else None


def replace_arguments(node):
    func = node.func
    if not isinstance(func, ast.Attribute) or func.attr != "replace" or node.keywords:
        return None
    if len(node.args) not in {2, 3} or any(isinstance(arg, ast.Starred) for arg in node.args):
        return None
    return node.args


def check(context):
    if context.tests:
        return []
    constants = module_constants(context.tree)
    found = []
    for node in ast.walk(context.tree):
        args = replace_arguments(node) if isinstance(node, ast.Call) else None
        if args is None:
            continue
        kind = kind_of(args[0], args[1], constants)
        if kind is not None and not guarded(node, args[0], context.parents):
            found.append(finding(context.path, RULE, f"{kind}|{ast.unparse(node)[:SHOWN]}", node))
    return found
