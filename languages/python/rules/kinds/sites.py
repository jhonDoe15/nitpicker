import ast

from checks.common import walk_statements


def by_position(nodes):
    return sorted(nodes, key=lambda node: (node.lineno, node.col_offset))


def outer_calls(nodes):
    calls = [node for node in nodes if isinstance(node, ast.Call)]
    receivers = {
        id(call.func.value) for call in calls if isinstance(call.func, ast.Attribute)
    }
    return by_position(call for call in calls if id(call) not in receivers)


def calls_in_order(function):
    nodes = walk_statements(function.body)
    return by_position(node for node in nodes if isinstance(node, ast.Call))
