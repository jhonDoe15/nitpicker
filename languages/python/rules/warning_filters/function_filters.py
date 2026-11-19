import ast

from checks.common import dotted_name, finding, last_name, own_nodes
from security.support import support_group
from environment.roots import has_main_guard, is_main_guard
from exit_status.commands import is_command

RULE = "warning-filter-in-function"
CATCH = "warnings.catch_warnings"
FILTERS = {
    "warnings.catch_warnings",
    "warnings.simplefilter",
    "warnings.filterwarnings",
    "warnings.resetwarnings",
}
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
MAIN_MODULE = "__main__.py"
MAIN_NAME = "main"
COMMAND_BASES = {"BaseCommand", "AppCommand", "LabelCommand"}


def guard_calls(tree):
    names = set()
    for statement in tree.body:
        if isinstance(statement, ast.If) and is_main_guard(statement):
            names.update(
                node.func.id
                for node in ast.walk(statement)
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
            )
    return names


def is_command_handle(context, function):
    owner = context.parents.get(id(function))
    return (
        function.name == "handle"
        and isinstance(owner, ast.ClassDef)
        and any(last_name(base) in COMMAND_BASES for base in owner.bases)
    )


def is_published(context, function):
    module = context.project.module_name(context.path)
    published = context.options.get("entryPoints", [])
    return f"{module}:{function.name}" in published


def is_entry(context, function, guarded):
    return (
        (function.name == MAIN_NAME and has_main_guard(context.tree))
        or function.name in guarded
        or is_command(function, context.aliases, set())
        or is_command_handle(context, function)
        or is_published(context, function)
    )


def inside_entry(context, function, exempt):
    parent = context.parents.get(id(function))
    while parent is not None:
        if id(parent) in exempt:
            return True
        parent = context.parents.get(id(parent))
    return False


def is_exempt_file(context):
    path = context.path
    return (
        context.tests or path.endswith(MAIN_MODULE) or support_group(path) is not None
    )


def is_catch(item, aliases):
    expression = item.context_expr
    return (
        isinstance(expression, ast.Call)
        and dotted_name(expression.func, aliases) == CATCH
    )


def inside_catch(context, node, function):
    parent = context.parents.get(id(node))
    while parent is not None and parent is not function:
        if isinstance(parent, (ast.With, ast.AsyncWith)) and any(
            is_catch(item, context.aliases) for item in parent.items
        ):
            return True
        parent = context.parents.get(id(parent))
    return False


def filter_calls(context, function):
    for node in own_nodes(function):
        if not isinstance(node, ast.Call):
            continue
        dotted = dotted_name(node.func, context.aliases)
        if dotted in FILTERS and not (
            dotted != CATCH and inside_catch(context, node, function)
        ):
            yield node, dotted


def check(context):
    if is_exempt_file(context):
        return []
    guarded = guard_calls(context.tree)
    functions = [node for node in ast.walk(context.tree) if isinstance(node, FUNCTIONS)]
    exempt = {id(node) for node in functions if is_entry(context, node, guarded)}
    found = []
    for function in functions:
        if id(function) in exempt or inside_entry(context, function, exempt):
            continue
        for node, dotted in filter_calls(context, function):
            found.append(finding(context.path, RULE, f"{dotted}()", node))
    return found
