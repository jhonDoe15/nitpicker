import ast

SECONDS_TO_MILLIS = 1000


def number_of(node, constants):
    if isinstance(node, ast.Constant):
        value = node.value
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return value
        return None
    if isinstance(node, ast.Name):
        return constants.get(node.id)
    if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Mult, ast.Add)):
        left = number_of(node.left, constants)
        right = number_of(node.right, constants)
        if left is None or right is None:
            return None
        return left * right if isinstance(node.op, ast.Mult) else left + right
    return None


def assignment_targets(statement):
    if isinstance(statement, ast.Assign):
        return statement.value, [
            target.id for target in statement.targets if isinstance(target, ast.Name)
        ]
    if (
        isinstance(statement, ast.AnnAssign)
        and statement.value is not None
        and isinstance(statement.target, ast.Name)
    ):
        return statement.value, [statement.target.id]
    return None, []


def module_constants(tree):
    counts = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
            counts[node.id] = counts.get(node.id, 0) + 1
    constants = {}
    for statement in tree.body:
        value, names = assignment_targets(statement)
        number = number_of(value, constants) if value is not None else None
        if number is not None:
            constants.update(
                {name: number for name in names if counts.get(name, 0) == 1}
            )
    return constants


def constant_names(node, constants):
    if isinstance(node, ast.Name) and node.id in constants:
        return [node.id]
    if isinstance(node, ast.BinOp):
        return constant_names(node.left, constants) + constant_names(
            node.right, constants
        )
    return []
