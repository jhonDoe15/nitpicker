import ast

LOOPS = (ast.For, ast.AsyncFor, ast.While)
BLOCKS = ("body", "orelse", "finalbody")


def block_of(node, parent):
    for field in BLOCKS:
        block = getattr(parent, field, None)
        if isinstance(block, list) and any(item is node for item in block):
            return block
    return None


def is_bare_return(node):
    if not isinstance(node, ast.Return):
        return False
    return node.value is None or (
        isinstance(node.value, ast.Constant) and node.value.value is None
    )


def ends_function(statement, function, context):
    node = statement
    while node is not function:
        parent = context.parents.get(id(node))
        if parent is None or isinstance(parent, LOOPS):
            return False
        if isinstance(node, (ast.ExceptHandler, ast.match_case)):
            node = parent
            continue
        block = block_of(node, parent)
        if block is None:
            return False
        rest = block[[id(item) for item in block].index(id(node)) + 1 :]
        if rest and not (len(rest) == 1 and is_bare_return(rest[0])):
            return False
        node = parent
    return True


def argument_names(call):
    values = [*call.args, *(item.value for item in call.keywords)]
    return {
        node.id
        for value in values
        for node in ast.walk(value)
        if isinstance(node, ast.Name)
    }


def argument_returned(call, function):
    names = argument_names(call)
    return any(
        isinstance(node, ast.Return)
        and node.value is not None
        and names
        & {item.id for item in ast.walk(node.value) if isinstance(item, ast.Name)}
        for node in ast.walk(function)
    )


def ends_branch(statement, context):
    parent = context.parents.get(id(statement))
    if not isinstance(parent, ast.If):
        return False
    block = block_of(statement, parent)
    if block is None or block[-1] is not statement:
        return False
    node = parent
    while node is not None and not isinstance(
        node, (ast.FunctionDef, ast.AsyncFunctionDef)
    ):
        if isinstance(node, LOOPS):
            return False
        node = context.parents.get(id(node))
    return node is not None
