import ast
import json
import re
import sys


TYPE_CHECKING = "TYPE_CHECKING"
TYPING_MODULES = {"typing", "typing_extensions"}
IMPORT_ERRORS = {"ImportError", "ModuleNotFoundError", "Exception", "BaseException"}
ENVIRONMENT_MODULES = {"sys", "platform"}
ENVIRONMENT_NAMES = {"version_info", "find_spec", "platform", "environ", "getenv"}
FLAG = re.compile(r"^_*[A-Z][A-Z0-9_]*$")
IMPORTS = (ast.Import, ast.ImportFrom)
TRY_NODES = (ast.Try, getattr(ast, "TryStar", ast.Try))
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)


def is_false_assignment(node):
    return (
        isinstance(node, ast.Assign)
        and isinstance(node.value, ast.Constant)
        and node.value.value is False
        and any(isinstance(target, ast.Name) and target.id == TYPE_CHECKING for target in node.targets)
    )


def type_checking_names(tree):
    names = set()
    modules = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module in TYPING_MODULES:
            names.update(a.asname or a.name for a in node.names if a.name == TYPE_CHECKING)
        elif isinstance(node, ast.Import):
            modules.update(a.asname or a.name for a in node.names if a.name in TYPING_MODULES)
    if any(is_false_assignment(node) for node in tree.body):
        names.add(TYPE_CHECKING)
    return names, modules


def is_type_checking(test, flags):
    names, modules = flags
    if isinstance(test, ast.Name):
        return test.id in names
    if isinstance(test, ast.Attribute):
        return (
            test.attr == TYPE_CHECKING
            and isinstance(test.value, ast.Name)
            and test.value.id in modules
        )
    if isinstance(test, ast.BoolOp) and isinstance(test.op, ast.And):
        return any(is_type_checking(value, flags) for value in test.values)
    return False


def branches(node, type_only, flags):
    if is_type_checking(node.test, flags):
        return [(node.body, True), (node.orelse, type_only)]
    negated = isinstance(node.test, ast.UnaryOp) and isinstance(node.test.op, ast.Not)
    if negated and is_type_checking(node.test.operand, flags):
        return [(node.body, type_only), (node.orelse, True)]
    return None


def statement_of(node, state):
    type_only, guarded, local = state
    level, module = (0, None) if isinstance(node, ast.Import) else (node.level, node.module)
    return {
        "level": level,
        "module": module,
        "names": [a.name for a in node.names],
        "typeOnly": type_only,
        "guarded": guarded,
        "local": local,
        "line": node.lineno,
    }


def names_in(node):
    return {
        part.id if isinstance(part, ast.Name) else part.attr
        for part in ast.walk(node)
        if isinstance(part, (ast.Name, ast.Attribute))
    }


def catches_import_error(handler):
    return handler.type is None or bool(names_in(handler.type) & IMPORT_ERRORS)


def guards_imports(node):
    return isinstance(node, TRY_NODES) and any(map(catches_import_error, node.handlers))


def suppresses_import_error(node):
    return any(
        isinstance(item.context_expr, ast.Call)
        and "suppress" in names_in(item.context_expr.func)
        and any(names_in(argument) & IMPORT_ERRORS for argument in item.context_expr.args)
        for item in node.items
    )


def stored_names(target):
    return {part.id for part in ast.walk(target) if isinstance(part, ast.Name)}


def assigned(node):
    if isinstance(node, IMPORTS):
        return {(a.asname or a.name).split(".")[0] for a in node.names}
    if isinstance(node, ast.Assign):
        return set().union(*map(stored_names, node.targets))
    if isinstance(node, ast.AnnAssign):
        return stored_names(node.target)
    return set()


def is_marker(node):
    if isinstance(node, IMPORTS):
        return True
    value = getattr(node, "value", None)
    return isinstance(node, (ast.Assign, ast.AnnAssign)) and isinstance(value, ast.Constant)


def import_flags(tree):
    flags = set()
    for node in filter(guards_imports, ast.walk(tree)):
        for part in node.body + node.orelse:
            for inner in filter(is_marker, ast.walk(part)):
                flags |= assigned(inner)
    for node in ast.walk(tree):
        if isinstance(node, (ast.Assign, ast.AnnAssign)) and node.value is not None:
            if tests_environment(node.value, set(), flag_names=False):
                flags |= assigned(node)
    return flags


def tests_environment(test, flags, flag_names=True):
    for part in ast.walk(test):
        if isinstance(part, ast.Attribute) and isinstance(part.value, ast.Name):
            if part.value.id in ENVIRONMENT_MODULES or (part.value.id, part.attr) == ("os", "name"):
                return True
        found = names_in(part) if isinstance(part, (ast.Name, ast.Attribute)) else set()
        if found & (ENVIRONMENT_NAMES | flags):
            return True
        if flag_names and any(FLAG.match(name) for name in found):
            return True
    return False


def child_states(node, state, flags):
    type_only, guarded, local = state
    local = local or isinstance(node, FUNCTIONS)
    if isinstance(node, TRY_NODES):
        guarding = node.orelse + (node.body + node.handlers if guards_imports(node) else [])
        guarding = set(map(id, guarding))
        return [
            (child, (type_only, guarded or id(child) in guarding, local))
            for child in ast.iter_child_nodes(node)
        ]
    guards = (
        isinstance(node, (ast.With, ast.AsyncWith)) and suppresses_import_error(node)
    ) or (isinstance(node, ast.If) and tests_environment(node.test, flags))
    return [(child, (type_only, guarded or guards, local)) for child in ast.iter_child_nodes(node)]


def collect(root, flags):
    found = []
    environment = import_flags(root)
    stack = [(root, (False, False, False))]
    while stack:
        node, state = stack.pop()
        if isinstance(node, IMPORTS):
            found.append(statement_of(node, state))
            continue
        split = branches(node, state[0], flags) if isinstance(node, ast.If) else None
        if split is None:
            pending = child_states(node, state, environment)
        else:
            pending = [
                (child, (flag, *state[1:])) for statements, flag in split for child in statements
            ]
        stack.extend(reversed(pending))
    return found


def imports_of(tree):
    return collect(tree, type_checking_names(tree))


def scan(root, files):
    scanned = {}
    for relative in files:
        try:
            with open(f"{root}/{relative}", "rb") as handle:
                scanned[relative] = imports_of(ast.parse(handle.read(), relative))
        except (SyntaxError, ValueError, RecursionError, OSError):
            continue
    return scanned


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as handle:
        request = json.load(handle)
    json.dump(scan(request["root"], request["files"]), sys.stdout)
