import ast

from checks.common import call_name, dotted_name, finding, last_name

RULE = "global-state-leak-in-test"
ENVIRON = "os.environ"
ENVIRON_METHODS = {"update", "setdefault", "pop", "popitem", "clear"}
ENVIRON_CALLS = {"os.putenv": ENVIRON, "os.unsetenv": ENVIRON}
TIMEZONE = "time.tzset"
LOCALE = "locale.setlocale"
TEARDOWNS = {
    "tearDown",
    "tearDownClass",
    "asyncTearDown",
    "teardown_method",
    "teardown_class",
    "teardown_function",
    "teardown_module",
    "tearDownModule",
}
CLEANUP_CALLS = {
    "addCleanup",
    "addClassCleanup",
    "addfinalizer",
    "enterContext",
    "enter_context",
    "callback",
}
PATCH_DICT = ("patch.dict",)
RELOAD = {"importlib.reload"}


def environ_target(node, aliases):
    if isinstance(node, ast.Subscript):
        return dotted_name(node.value, aliases) == ENVIRON
    return False


def environ_change(node, aliases):
    if isinstance(node, (ast.Assign, ast.AugAssign, ast.Delete)):
        targets = node.targets if hasattr(node, "targets") else [node.target]
        if any(environ_target(target, aliases) for target in targets):
            return ENVIRON
    if not isinstance(node, ast.Call):
        return None
    name = call_name(node, aliases)
    if name in ENVIRON_CALLS:
        return ENVIRON_CALLS[name]
    owner, _, method = (name or "").rpartition(".")
    return ENVIRON if owner == ENVIRON and method in ENVIRON_METHODS else None


def runtime_change(node, aliases):
    if not isinstance(node, ast.Call):
        return None
    name = call_name(node, aliases)
    if name == TIMEZONE:
        return TIMEZONE
    sets = len(node.args) >= 2 or any(word.arg == "locale" for word in node.keywords)
    return LOCALE if name == LOCALE and sets else None


def imported_root(node, aliases):
    while isinstance(node, ast.Attribute):
        node = node.value
    names, modules = aliases[:2]
    return isinstance(node, ast.Name) and (node.id in names or node.id in modules)


def project_owner(owner, project):
    return project.module_path(owner) is not None or project.locate(owner) is not None


def module_change(node, context):
    if not isinstance(node, (ast.Assign, ast.AugAssign)):
        return None
    targets = node.targets if isinstance(node, ast.Assign) else [node.target]
    for target in targets:
        if not isinstance(target, ast.Attribute) or not imported_root(
            target.value, context.aliases
        ):
            continue
        owner = dotted_name(target.value, context.aliases)
        if owner and project_owner(owner, context.project):
            return f"{owner}.{target.attr}"
    return None


def change_of(node, context):
    return (
        environ_change(node, context.aliases)
        or runtime_change(node, context.aliases)
        or module_change(node, context)
    )


def reloaded(node, aliases):
    if call_name(node, aliases) not in RELOAD or not node.args:
        return None
    return dotted_name(node.args[0], aliases)


def restores(nodes, family, context, skip):
    for node in nodes:
        if id(node) == skip:
            continue
        if change_of(node, context) == family:
            return True
        module = reloaded(node, context.aliases)
        if module and family.startswith(f"{module}."):
            return True
    return False


def walked(statements):
    return [node for statement in statements for node in ast.walk(statement)]


def functions_of(tree):
    return [
        node
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]


def is_test_module(tree):
    names = [
        node.name
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
    ]
    return any(name.startswith(("test", "Test")) for name in names)


def enclosing(context, node, kinds):
    found = []
    current = context.parents.get(id(node))
    while current is not None:
        if isinstance(current, kinds):
            found.append(current)
        current = context.parents.get(id(current))
    return found


def yield_line(function):
    lines = [
        node.lineno
        for node in walked(function.body)
        if isinstance(node, (ast.Yield, ast.YieldFrom))
    ]
    return min(lines) if lines else None


def after_yield(function):
    line = yield_line(function)
    if line is None:
        return []
    return [node for node in walked(function.body) if getattr(node, "lineno", 0) > line]


def finally_nodes(function):
    return [
        node
        for statement in ast.walk(function)
        if isinstance(statement, ast.Try)
        for node in walked(statement.finalbody)
    ]


def teardowns(context, node):
    classes = enclosing(context, node, ast.ClassDef)
    owners = [context.tree, *classes]
    found = [
        statement
        for owner in owners
        for statement in owner.body
        if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef))
        and statement.name in TEARDOWNS
    ]
    called = {
        part.func.attr if isinstance(part.func, ast.Attribute) else part.func.id
        for function in found
        for part in ast.walk(function)
        if isinstance(part, ast.Call)
        and isinstance(part.func, (ast.Name, ast.Attribute))
    }
    helpers = [
        statement
        for owner in owners
        for statement in owner.body
        if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef))
        and statement.name in called
    ]
    return found + helpers


def patched_dict(context, node):
    blocks = enclosing(context, node, (ast.With, ast.AsyncWith))
    functions = enclosing(context, node, (ast.FunctionDef, ast.AsyncFunctionDef))
    managers = [item.context_expr for block in blocks for item in block.items]
    decorators = [part for function in functions for part in function.decorator_list]
    return any(
        (call_name(expression, context.aliases) or "").endswith(PATCH_DICT)
        for expression in managers + decorators
    )


def family_word(family):
    if family == ENVIRON:
        return "environ"
    parts = family.split(".")
    return parts[-1] if family in (TIMEZONE, LOCALE) else parts[-2]


def cleanup_restores(call, family, context):
    text = " ".join(ast.unparse(argument) for argument in call.args)
    if family_word(family) in text:
        return True
    named = {last_name(argument) for argument in call.args}
    return any(
        restores(list(ast.walk(function)), family, context, None)
        for function in functions_of(context.tree)
        if function.name in named
    )


def cleanup_targets(context):
    return {
        last_name(argument)
        for node in ast.walk(context.tree)
        if isinstance(node, ast.Call)
        and (call_name(node, context.aliases) or "").rpartition(".")[2] in CLEANUP_CALLS
        for argument in node.args
    }


def calls_cleanup(function, family, context):
    return any(
        isinstance(node, ast.Call)
        and (call_name(node, context.aliases) or "").rpartition(".")[2] in CLEANUP_CALLS
        and cleanup_restores(node, family, context)
        for node in ast.walk(function)
    )


def is_session_setup(functions):
    return not functions or functions[-1].name.startswith("pytest_")


def own_restore_site(node, function, sites):
    inside = {id(part) for site in sites for part in ast.walk(site)}
    return id(node) in inside or (
        function is not None
        and id(node) in {id(part) for part in after_yield(function)}
    )


def is_restored(node, family, context):
    functions = enclosing(context, node, (ast.FunctionDef, ast.AsyncFunctionDef))
    if is_session_setup(functions):
        return True
    function = functions[0] if functions else None
    if function is not None and function.name in cleanup_targets(context):
        return True
    sites = teardowns(context, node)
    finals = finally_nodes(function) if function else []
    if own_restore_site(node, function, sites) or id(node) in {
        id(part) for part in finals
    }:
        return True
    if family == ENVIRON and patched_dict(context, node):
        return True
    if function is not None and calls_cleanup(function, family, context):
        return True
    zones = walked(sites) + finals + (after_yield(function) if function else [])
    if not is_test_module(context.tree):
        zones = list(ast.walk(context.tree))
    return restores(zones, family, context, id(node))


def check(context):
    if not context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        family = change_of(node, context)
        if family and not is_restored(node, family, context):
            found.append(finding(context.path, RULE, family, node))
    return found
