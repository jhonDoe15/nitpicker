import ast

SET = "set"
ADD = "add"


def is_all(node):
    return isinstance(node, ast.Name) and node.id == "__all__"


def is_string(node):
    return isinstance(node, ast.Constant) and isinstance(node.value, str)


def string_list(node):
    if not isinstance(node, (ast.List, ast.Tuple)):
        return None
    if not all(is_string(element) for element in node.elts):
        return None
    return [element.value for element in node.elts]


def call_exports(call):
    if len(call.args) != 1 or call.keywords:
        return None
    argument = call.args[0]
    if call.func.attr == "append":
        return [argument.value] if is_string(argument) else None
    return string_list(argument) if call.func.attr == "extend" else None


def mutator_call(statement):
    call = statement.value if isinstance(statement, ast.Expr) else None
    if not isinstance(call, ast.Call) or not isinstance(call.func, ast.Attribute):
        return None
    return call if is_all(call.func.value) else None


def export_change(statement):
    if isinstance(statement, ast.Assign) and any(map(is_all, statement.targets)):
        return SET, string_list(statement.value)
    if isinstance(statement, ast.AnnAssign) and is_all(statement.target):
        return SET, string_list(statement.value) if statement.value else None
    if isinstance(statement, ast.AugAssign) and is_all(statement.target):
        plus = isinstance(statement.op, ast.Add)
        return ADD, string_list(statement.value) if plus else None
    call = mutator_call(statement)
    return (ADD, call_exports(call)) if call is not None else None


def module_exports(tree):
    names, unknown, handled = None, False, set()
    for statement in tree.body:
        change = export_change(statement)
        if change is None:
            continue
        handled.add(id(statement))
        kind, added = change
        unknown = added is None or (unknown and kind == ADD)
        if not unknown:
            names = list(added) if kind == SET else (names or []) + added
    nested = (
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.stmt) and id(node) not in handled
    )
    if any(export_change(node) is not None for node in nested):
        return None
    return None if unknown else names
