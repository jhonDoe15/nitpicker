import ast
import re

TEST_DIRECTORIES = {"tests", "test"}
BOUNDARY_DIRECTORY = "adapters"
DOMAIN_DIRECTORY = "domain"
LOG_METHODS = {
    "debug",
    "info",
    "warning",
    "warn",
    "error",
    "exception",
    "critical",
    "fatal",
    "log",
}
LOG_OWNER = re.compile(
    r"^_*(?:log|logger|logging|LOG|LOGGER)$|_(?:log|logger|LOG|LOGGER)$|[a-z0-9](?:Logger|Log)$"
)


def finding(path, rule, subject, node):
    return {"rule": rule, "path": path, "subject": subject, "line": node.lineno}


def directories(path):
    return path.split("/")[:-1]


def is_test_path(path):
    parts = path.split("/")
    name = parts[-1]
    return (
        bool(TEST_DIRECTORIES.intersection(parts[:-1]))
        or name.startswith("test_")
        or name.endswith("_test.py")
        or name == "conftest.py"
    )


def is_boundary_path(path):
    return BOUNDARY_DIRECTORY in directories(path)


def is_domain_path(path):
    return DOMAIN_DIRECTORY in directories(path) and not is_test_path(path)


def import_aliases(tree):
    names, modules = {}, {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
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


def call_name(node, aliases):
    if isinstance(node, ast.Call):
        return dotted_name(node.func, aliases)
    return None


def last_name(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def is_log_call(node, aliases):
    if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
        return False
    if node.func.attr not in LOG_METHODS:
        return False
    owner = node.func.value
    if isinstance(owner, ast.Call):
        return (dotted_name(owner.func, aliases) or "").endswith("getLogger")
    name = last_name(owner)
    return name is not None and LOG_OWNER.search(name) is not None


def string_value(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def functions_of(tree):
    return [
        node
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]


def own_nodes(root):
    pending = list(ast.iter_child_nodes(root))
    while pending:
        node = pending.pop()
        yield node
        if not isinstance(
            node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)
        ):
            pending.extend(ast.iter_child_nodes(node))


def words_of(name):
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", name)
    spaced = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", spaced)
    return [word.lower() for word in re.split(r"[^A-Za-z0-9]+", spaced) if word]


def type_text(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return f"{type_text(node.value)}.{node.attr}"
    if isinstance(node, ast.Tuple):
        return "(" + ", ".join(type_text(element) for element in node.elts) + ")"
    return "expression"
