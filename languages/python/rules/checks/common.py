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
ALIAS_PASSES = 3
LOGGER_MODULES = {"logging", "structlog", "loguru"}
LOGURU_LOGGER = "loguru.logger"
TYPE_CHECKING_NAMES = {
    "TYPE_CHECKING",
    "typing.TYPE_CHECKING",
    "typing_extensions.TYPE_CHECKING",
}
LOGGER_FACTORIES = {"getLogger", "get_logger", "LoggerAdapter", "wrap_logger"}
LOG_OWNER = re.compile(
    r"^_*(?:log|logger|logging|LOG|LOGGER)$|_(?:log|logger|LOG|LOGGER)$|[a-z0-9](?:Logger|Log)$"
)


def finding(path, rule, subject, node):
    end = getattr(node, "end_lineno", None) or node.lineno
    return {"rule": rule, "path": path, "subject": subject, "line": node.lineno, "end": end}


def directories(path):
    return path.split("/")[:-1]


def is_boundary_path(path):
    return BOUNDARY_DIRECTORY in directories(path)


def is_domain_path(path, tests=False):
    return DOMAIN_DIRECTORY in directories(path) and not tests


def import_aliases(tree, project=None, path=None):
    names, modules = {}, {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            module = imported_module(node, project, path)
            for alias in node.names if module else []:
                names[alias.asname or alias.name] = f"{module}.{alias.name}"
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.asname:
                    modules[alias.asname] = alias.name
                else:
                    root = alias.name.split(".")[0]
                    modules.setdefault(root, root)
    add_assigned_aliases(tree, names, modules)
    return names, modules, logger_names(tree, names, modules)


def imported_module(node, project, path):
    if node.level == 0:
        return node.module
    return project.relative_module(path, node.level, node.module) if project else None


def resolve_chain(node, names, modules):
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if not isinstance(node, ast.Name):
        return None
    root = names.get(node.id) or modules.get(node.id)
    if root is None:
        return None
    return ".".join([root] + parts[::-1])


def add_assigned_aliases(tree, names, modules):
    assigned = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            if isinstance(node.targets[0], ast.Name):
                assigned.setdefault(node.targets[0].id, []).append(node.value)
    for _ in range(ALIAS_PASSES):
        for name, values in assigned.items():
            target = (
                resolve_chain(values[0], names, modules) if len(values) == 1 else None
            )
            if target and name not in names and name not in modules:
                names[name] = target


def logger_names(tree, names, modules):
    found = set()
    for node in ast.walk(tree):
        value = getattr(node, "value", None)
        targets = (
            node.targets
            if isinstance(node, ast.Assign)
            else [getattr(node, "target", None)]
        )
        if not isinstance(node, (ast.Assign, ast.AnnAssign)) or value is None:
            continue
        factory = value.func if isinstance(value, ast.Call) else value
        dotted = resolve_chain(factory, names, modules) or ""
        if dotted.rsplit(".", 1)[-1] in LOGGER_FACTORIES or dotted == LOGURU_LOGGER:
            found.update(filter(None, (last_name(target) for target in targets)))
    return found


def dotted_name(node, aliases):
    names, modules = aliases[:2]
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
    return node.func.attr in LOG_METHODS and is_log_owner(node.func.value, aliases)


def is_log_owner(owner, aliases):
    if isinstance(owner, ast.Call):
        return (dotted_name(owner.func, aliases) or "").rsplit(".", 1)[
            -1
        ] in LOGGER_FACTORIES
    name = last_name(owner)
    if name is None:
        return False
    return (
        LOG_OWNER.search(name) is not None
        or name in aliases[2]
        or dotted_name(owner, aliases) == LOGURU_LOGGER
    )


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
    if isinstance(node, ast.Starred):
        return f"*{type_text(node.value)}"
    if isinstance(node, ast.Tuple):
        return "(" + ", ".join(type_text(element) for element in node.elts) + ")"
    return "expression"


def is_type_checking(node, aliases):
    return dotted_name(node, aliases) in TYPE_CHECKING_NAMES


def is_type_checking_block(node, aliases):
    return isinstance(node, ast.If) and is_type_checking(node.test, aliases)


def type_checking_nodes(tree, aliases):
    inside = set()
    for node in ast.walk(tree):
        if is_type_checking_block(node, aliases):
            inside.update(id(child) for part in node.body for child in ast.walk(part))
    return inside
