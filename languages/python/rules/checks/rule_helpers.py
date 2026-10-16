import ast
import os
import re

TEST_DIRECTORIES = {"tests", "test"}
BOUNDARY_DIRECTORY = "adapters"
OPTIONAL_IMPORT_ERRORS = {"ImportError", "ModuleNotFoundError"}
CONSTANT_NAME = re.compile(r"[A-Z][A-Z0-9_]*")


def is_constant(node):
    if isinstance(node, ast.Constant):
        return True
    if isinstance(node, ast.UnaryOp):
        return is_constant(node.operand)
    if isinstance(node, (ast.Tuple, ast.List, ast.Set)):
        return all(is_constant(element) for element in node.elts)
    if isinstance(node, ast.Dict):
        return all(
            key is not None and is_constant(key) and is_constant(value)
            for key, value in zip(node.keys, node.values)
        )
    return False


def is_optional_import(handler):
    caught = (
        handler.type.elts if isinstance(handler.type, ast.Tuple) else [handler.type]
    )
    names = {node.id for node in caught if isinstance(node, ast.Name)}
    return len(names) == len(caught) and names <= OPTIONAL_IMPORT_ERRORS


def is_inert(statement, optional_import):
    if isinstance(statement, ast.Return):
        return statement.value is None or is_constant(statement.value)
    if isinstance(statement, ast.Expr):
        return isinstance(statement.value, ast.Constant)
    if isinstance(statement, (ast.Assign, ast.AnnAssign)):
        return (
            not optional_import
            and statement.value is not None
            and is_constant(statement.value)
        )
    return isinstance(statement, (ast.Pass, ast.Continue))


def type_text(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return f"{type_text(node.value)}.{node.attr}"
    if isinstance(node, ast.Tuple):
        return "(" + ", ".join(type_text(element) for element in node.elts) + ")"
    return "expression"


def is_test_path(path):
    parts = path.split("/")
    name = parts[-1]
    return (
        bool(TEST_DIRECTORIES.intersection(parts[:-1]))
        or name.startswith("test_")
        or name.endswith("_test.py")
        or name == "conftest.py"
    )


def log_call_text(func):
    receiver = func.value
    if isinstance(receiver, (ast.Name, ast.Attribute)):
        return f"{type_text(receiver)}.{func.attr}(...)"
    return f"logger.{func.attr}(...)"


def is_boundary_path(path):
    return BOUNDARY_DIRECTORY in path.split("/")[:-1]


def import_aliases(tree):
    names, modules = {}, {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            for alias in node.names:
                names[alias.asname or alias.name] = f"{node.module}.{alias.name}"
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.asname:
                    modules[alias.asname] = alias.name
    return names, modules


def dotted_name(node, aliases):
    names, modules = aliases
    if isinstance(node, ast.Name):
        return names.get(node.id) or modules.get(node.id) or node.id
    if isinstance(node, ast.Attribute):
        base = dotted_name(node.value, aliases)
        return f"{base}.{node.attr}" if base else None
    return None


def decorator_name(decorator, aliases):
    target = decorator.func if isinstance(decorator, ast.Call) else decorator
    name = dotted_name(target, aliases)
    return name.rsplit(".", 1)[-1] if name else None


def is_frozen(decorator):
    return isinstance(decorator, ast.Call) and any(
        keyword.arg == "frozen"
        and isinstance(keyword.value, ast.Constant)
        and keyword.value.value is True
        for keyword in decorator.keywords
    )


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
        base
        for base in node.bases
        if not (isinstance(base, ast.Name) and base.id == "object")
    ]
    return not bases and not node.keywords and not node.decorator_list
