import ast
import os
import re

CONSTANT_NAME = re.compile(r"[A-Z][A-Z0-9_]*")


def string_constants(body):
    constants = []
    for statement in body:
        if isinstance(statement, ast.Assign) and len(statement.targets) == 1:
            target, value = statement.targets[0], statement.value
        elif isinstance(statement, ast.AnnAssign):
            target, value = statement.target, statement.value
        else:
            continue
        if (
            isinstance(target, ast.Name)
            and CONSTANT_NAME.fullmatch(target.id)
            and isinstance(value, ast.Constant)
            and isinstance(value.value, str)
        ):
            constants.append((target.id, value.value))
    return constants


def common_prefix(names):
    prefix = os.path.commonprefix(names)
    return prefix[: prefix.rfind("_") + 1]


def normalized(text):
    return text.lower().replace("-", "_").replace(" ", "_")


def is_enum_like(name, value, prefix):
    return normalized(value) in (normalized(name), normalized(name[len(prefix) :]))


def is_enum_group(constants, prefix):
    return all(is_enum_like(name, value, prefix) for name, value in constants)


def is_plain_class(node):
    bases = [
        base for base in node.bases if not (isinstance(base, ast.Name) and base.id == "object")
    ]
    return not bases and not node.keywords and not node.decorator_list
