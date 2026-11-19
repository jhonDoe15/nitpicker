import ast

from checks.common import own_nodes

ORDERING = (ast.Lt, ast.Gt, ast.LtE, ast.GtE)
SIZED = {"len", "sorted", "list", "tuple", "set", "sum", "min", "max", "enumerate"}
NONE_ATTRIBUTES = {"__class__", "__doc__", "__eq__", "__bool__", "__str__", "__repr__"}


def compare_receivers(node):
    operands = [node.left, *node.comparators]
    for index, operator in enumerate(node.ops):
        if isinstance(operator, ORDERING):
            yield operands[index]
            yield operands[index + 1]
        elif isinstance(operator, (ast.In, ast.NotIn)):
            yield operands[index + 1]


def receivers_of(node):
    if isinstance(node, ast.Attribute) and node.attr not in NONE_ATTRIBUTES:
        yield node.value
    elif isinstance(node, ast.Subscript):
        yield node.value
    elif isinstance(node, (ast.For, ast.AsyncFor, ast.comprehension)):
        yield node.iter
    elif isinstance(node, ast.Compare):
        yield from compare_receivers(node)
    elif isinstance(node, ast.Call):
        function = node.func
        yield function
        if isinstance(function, ast.Name) and function.id in SIZED and node.args:
            yield node.args[0]


def dereferences(function):
    found = []
    for node in own_nodes(function):
        for receiver in receivers_of(node):
            found.append((receiver, node))
    return sorted(found, key=lambda item: position(item[0]))


def position(node):
    return (getattr(node, "lineno", 0), getattr(node, "col_offset", 0))
