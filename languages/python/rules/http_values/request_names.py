import ast


def is_request(node):
    if isinstance(node, ast.Name):
        return node.id == "request"
    return (
        isinstance(node, ast.Attribute)
        and node.attr == "request"
        and isinstance(node.value, ast.Name)
    )


def is_request_attribute(node, names):
    return (
        isinstance(node, ast.Attribute)
        and node.attr in names
        and is_request(node.value)
    )


def is_request_user(node):
    return is_request_attribute(node, {"user"})
