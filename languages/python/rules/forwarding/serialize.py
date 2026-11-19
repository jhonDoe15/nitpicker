import ast

from checks.common import finding, last_name
from forwarding.calls import RULE
from forwarding.resolve import parameter_names
from signatures.annotations import FUNCTION_TYPES


def method_named(cls, name):
    return next(
        (item for item in cls.body if isinstance(item, FUNCTION_TYPES) and item.name == name),
        None,
    )


def contract_return(serialize, cls):
    for node in ast.walk(serialize):
        if (
            isinstance(node, ast.Return)
            and isinstance(node.value, ast.Tuple)
            and len(node.value.elts) == 2
            and isinstance(node.value.elts[1], ast.Dict)
            and looks_like_classpath(node.value.elts[0], cls)
        ):
            return node
    return None


def looks_like_classpath(node, cls):
    if any((last_name(base) or "").endswith("Trigger") for base in cls.bases):
        return True
    return isinstance(node, ast.Constant) and isinstance(node.value, str) and "." in node.value


def serialized_names(table):
    if any(key is None for key in table.keys):
        return None
    names = {key.value for key in table.keys if isinstance(key, ast.Constant)}
    for value in table.values:
        names.update(
            item.attr
            for item in ast.walk(value)
            if isinstance(item, ast.Attribute)
            and isinstance(item.value, ast.Name)
            and item.value.id == "self"
        )
        names.update(item.id for item in ast.walk(value) if isinstance(item, ast.Name))
    return names


def serialize_findings(cls, context):
    init, serialize = method_named(cls, "__init__"), method_named(cls, "serialize")
    if init is None or serialize is None:
        return []
    node = contract_return(serialize, cls)
    if node is None:
        return []
    names = serialized_names(node.value.elts[1])
    if names is None:
        return []
    return [
        finding(context.path, RULE, f"{name}: {cls.name}.serialize", node)
        for name in parameter_names(init)
        if name not in names
    ]
