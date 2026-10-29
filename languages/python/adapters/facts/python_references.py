import ast
import re

MODULE_PATH = re.compile(r"[A-Za-z_]\w*(\.[A-Za-z_]\w*)*")
LOADERS = {"import_module", "__import__"}


def called_name(node):
    function = node.func
    return function.attr if isinstance(function, ast.Attribute) else getattr(function, "id", None)


def loaded_path(argument):
    if isinstance(argument, ast.Constant) and isinstance(argument.value, str):
        return argument.value if MODULE_PATH.fullmatch(argument.value) else None
    first = argument.values[0] if isinstance(argument, ast.JoinedStr) and argument.values else None
    prefix = first.value if isinstance(first, ast.Constant) else None
    if isinstance(prefix, str) and prefix.endswith(".") and MODULE_PATH.fullmatch(prefix[:-1]):
        return prefix + "*"
    return None


def dynamic_loads(tree):
    loads = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and called_name(node) in LOADERS and node.args:
            path = loaded_path(node.args[0])
            if path is not None:
                loads.setdefault(path, node.lineno)
    return loads


def fetched_names(tree):
    return sorted(
        {
            node.args[1].value
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and getattr(node.func, "id", None) == "getattr"
            and len(node.args) >= 2
            and isinstance(node.args[1], ast.Constant)
            and isinstance(node.args[1].value, str)
        }
    )


def string_references(tree, loads):
    found = {}
    for node in ast.walk(tree):
        value = node.value if isinstance(node, ast.Constant) else None
        if (
            isinstance(value, str)
            and "." in value
            and value not in loads
            and MODULE_PATH.fullmatch(value)
        ):
            found.setdefault(value, node.lineno)
    return found


def attribute_chain(node):
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    return (node.id if isinstance(node, ast.Name) else None), parts[::-1]


def attribute_uses(tree, bindings):
    found = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.Attribute):
            continue
        root, parts = attribute_chain(node)
        binding = bindings.get(root)
        if binding is not None and binding["kind"] in ("module", "import"):
            found.setdefault((root, *parts), (binding, node.lineno))
    return [
        {"binding": binding, "attributes": list(key[1:]), "line": line}
        for key, (binding, line) in found.items()
    ]


def references_of(tree):
    loads = dynamic_loads(tree)
    strings = string_references(tree, loads)
    return [
        *({"name": name, "line": line, "dynamic": True} for name, line in loads.items()),
        *({"name": name, "line": line} for name, line in strings.items()),
    ]
