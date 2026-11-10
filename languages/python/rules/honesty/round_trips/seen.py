import ast

FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
TEST_PREFIX = "test"


def mentioned(node):
    names = set()
    for item in ast.walk(node):
        if isinstance(item, ast.Name):
            names.add(item.id)
        elif isinstance(item, ast.Attribute):
            names.add(item.attr)
        elif isinstance(item, ast.arg):
            names.add(item.arg)
    return names


def is_test(node):
    return node.name.startswith(TEST_PREFIX)


def functions(tree):
    return [node for node in ast.walk(tree) if isinstance(node, FUNCTIONS)]


def helper_table(contexts):
    helpers = {}
    for context in contexts:
        for node in functions(context.tree):
            if not is_test(node):
                helpers.setdefault(node.name, set()).update(mentioned(node))
    return helpers


def reachable(names, helpers):
    seen = set(names)
    pending = list(names)
    for name in pending:
        for inner in helpers.get(name, ()):
            if inner not in seen:
                seen.add(inner)
                pending.append(inner)
    return frozenset(seen)


def tested_names(project):
    contexts = [context for context in project.contexts.values() if context.tests]
    helpers = helper_table(contexts)
    return [
        reachable(mentioned(node), helpers)
        for context in contexts
        for node in functions(context.tree)
        if is_test(node)
    ]
