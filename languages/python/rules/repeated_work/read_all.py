import ast
import re

from checks.common import dotted_name, finding, functions_of, last_name
from checks.loop_scope import FUNCTIONS, ancestors
from containers.scope import contains, name_stores, parameter_names
from repeated_work.scope_helpers import (
    LOOPS,
    binding_of,
    reads_name,
    statement_blocks,
)

RULE = "read-all-before-pass"
GUARDED = True
STREAM_PARSERS = {
    "json.load",
    "pickle.load",
    "tomllib.load",
    "yaml.load",
    "yaml.safe_load",
}
TEXT_PARSERS = {
    "json.loads",
    "pickle.loads",
    "tomllib.loads",
}
PATH_READ_METHODS = {"read_bytes", "read_text"}
HANDLE_READ_METHODS = {"read", "readlines"}
OPEN_CALLS = {"aiofiles.open", "io.open", "open"}
GATHER_CALLS = {"asyncio.gather"}
TO_THREAD_CALLS = {"asyncio.to_thread"}
WRITE_NAME = re.compile(
    r"^(?:append|copy|cp|move|mv|output|remove|rename|replace|rm|truncate|unlink|write)"
)
FS_WRITE_CALLS = {
    "os.makedirs",
    "os.mkdir",
    "os.remove",
    "os.rename",
    "os.replace",
    "os.truncate",
    "os.unlink",
}
WRITE_MODE_CHARS = frozenset("wax+")


def is_literal_list(node):
    return isinstance(node, (ast.List, ast.Tuple, ast.Set))


def is_open_call(node, aliases):
    if not isinstance(node, ast.Call):
        return False
    dotted = dotted_name(node.func, aliases) or ""
    if dotted in OPEN_CALLS:
        return True
    return isinstance(node.func, ast.Attribute) and node.func.attr == "open"


def is_open_handle(node, aliases, open_handles):
    if is_open_call(node, aliases):
        return True
    return isinstance(node, ast.Name) and node.id in (open_handles or ())


def is_write_open(call, aliases):
    if not is_open_call(call, aliases):
        return False
    mode_node = None
    if len(call.args) >= 2:
        mode_node = call.args[1]
    else:
        for keyword in call.keywords:
            if keyword.arg == "mode":
                mode_node = keyword.value
                break
    return (
        isinstance(mode_node, ast.Constant)
        and isinstance(mode_node.value, str)
        and any(ch in WRITE_MODE_CHARS for ch in mode_node.value)
    )


def is_to_thread_read(call, aliases):
    dotted = dotted_name(call.func, aliases) or ""
    if dotted not in TO_THREAD_CALLS or not call.args:
        return False
    target = call.args[0]
    return isinstance(target, ast.Attribute) and target.attr in PATH_READ_METHODS


def is_input_read(node, aliases, open_handles=None):
    current = node
    while current is not None:
        if isinstance(current, ast.Await):
            current = current.value
            continue
        if not isinstance(current, ast.Call):
            return False
        dotted = dotted_name(current.func, aliases) or ""
        if dotted in STREAM_PARSERS and current.args:
            if is_open_handle(current.args[0], aliases, open_handles):
                return True
            current = current.args[0]
            continue
        if dotted in TEXT_PARSERS and current.args:
            current = current.args[0]
            continue
        if is_to_thread_read(current, aliases):
            return True
        if isinstance(current.func, ast.Attribute):
            attr = current.func.attr
            if attr in PATH_READ_METHODS:
                return True
            if attr in HANDLE_READ_METHODS:
                return is_open_handle(current.func.value, aliases, open_handles)
        return False
    return False


def is_comp_read_all(node, aliases):
    if not isinstance(node, (ast.ListComp, ast.GeneratorExp)):
        return False
    if len(node.generators) != 1:
        return False
    gen = node.generators[0]
    return not is_literal_list(gen.iter) and is_input_read(node.elt, aliases)


def is_map_read_all(call, aliases):
    if not (
        isinstance(call, ast.Call)
        and isinstance(call.func, ast.Name)
        and call.func.id in {"list", "tuple"}
        and len(call.args) == 1
        and isinstance(call.args[0], ast.Call)
        and isinstance(call.args[0].func, ast.Name)
        and call.args[0].func.id == "map"
        and len(call.args[0].args) == 2
    ):
        return False
    fn, iterable = call.args[0].args
    if is_literal_list(iterable):
        return False
    return isinstance(fn, ast.Lambda) and is_input_read(fn.body, aliases)


def read_all_init(init, aliases):
    value = init.value if isinstance(init, ast.Await) else init
    if isinstance(value, ast.ListComp):
        return is_comp_read_all(value, aliases)
    if is_map_read_all(value, aliases):
        return True
    if (
        isinstance(value, ast.Call)
        and (dotted_name(value.func, aliases) or "") in GATHER_CALLS
        and len(value.args) == 1
        and isinstance(value.args[0], ast.Starred)
    ):
        return is_comp_read_all(value.args[0].value, aliases)
    return False


def is_empty_list(init):
    if isinstance(init, ast.List) and not init.elts:
        return True
    return (
        isinstance(init, ast.Call)
        and isinstance(init.func, ast.Name)
        and init.func.id == "list"
        and not init.args
        and not init.keywords
    )


def is_append_of_read(statement, name, aliases, open_handles):
    if not (isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Call)):
        return False
    call = statement.value
    return (
        len(call.args) == 1
        and not call.keywords
        and isinstance(call.func, ast.Attribute)
        and call.func.attr == "append"
        and isinstance(call.func.value, ast.Name)
        and call.func.value.id == name
        and is_input_read(call.args[0], aliases, open_handles)
    )


def open_context_handles(with_stmt, aliases):
    handles = set()
    for item in with_stmt.items:
        if is_open_call(item.context_expr, aliases) and isinstance(
            item.optional_vars, ast.Name
        ):
            handles.add(item.optional_vars.id)
    return handles


def append_loop_filler(statement, name, aliases):
    if (
        not isinstance(statement, (ast.For, ast.AsyncFor))
        or is_literal_list(statement.iter)
        or len(statement.body) != 1
    ):
        return None
    only = statement.body[0]
    if is_append_of_read(only, name, aliases, set()):
        return statement
    if isinstance(only, (ast.With, ast.AsyncWith)) and len(only.body) == 1:
        handles = open_context_handles(only, aliases)
        if handles and is_append_of_read(only.body[0], name, aliases, handles):
            return statement
    return None


def writes_files(statements, aliases):
    for statement in statements:
        for node in ast.walk(statement):
            if not isinstance(node, ast.Call):
                continue
            name = last_name(node.func) or ""
            dotted = dotted_name(node.func, aliases) or ""
            if (
                WRITE_NAME.search(name) is not None
                or dotted in FS_WRITE_CALLS
                or dotted.startswith("shutil.")
                or is_write_open(node, aliases)
            ):
                return True
    return False


def repeated_again(use, assignment, parents):
    for ancestor in ancestors(use, parents)[1:]:
        if not isinstance(ancestor, (*LOOPS, *FUNCTIONS)):
            continue
        if contains(ancestor, assignment):
            continue
        if isinstance(ancestor, (ast.For, ast.AsyncFor)) and contains(
            ancestor.iter, use
        ):
            continue
        return True
    return False


def uses_outside(scope, name, assignment, filler):
    return [
        node
        for node in ast.walk(scope)
        if isinstance(node, ast.Name)
        and node.id == name
        and isinstance(node.ctx, ast.Load)
        and not contains(assignment, node)
        and (filler is None or not contains(filler, node))
    ]


def check_scope(scope, context):
    found = []
    params = (
        parameter_names(scope)
        if isinstance(scope, (ast.FunctionDef, ast.AsyncFunctionDef))
        else set()
    )
    for block in statement_blocks(scope):
        for index, statement in enumerate(block):
            name, init = binding_of(statement)
            if name is None or init is None or name in params:
                continue
            if len(name_stores(scope, name)) != 1:
                continue
            following = block[index + 1] if index + 1 < len(block) else None
            filler = (
                append_loop_filler(following, name, context.aliases)
                if is_empty_list(init) and following is not None
                else None
            )
            if filler is None and not read_all_init(init, context.aliases):
                continue
            uses = uses_outside(scope, name, statement, filler)
            if len(uses) != 1:
                continue
            only = uses[0]
            parent = context.parents.get(id(only))
            if not (isinstance(parent, (ast.For, ast.AsyncFor)) and parent.iter is only):
                continue
            if not (
                any(reads_name(item, name) for item in parent.body)
                or writes_files(parent.body, context.aliases)
                or repeated_again(only, statement, context.parents)
            ):
                found.append(finding(context.path, RULE, name, statement))
    return found


def check(context):
    if context.tests:
        return []
    found = check_scope(context.tree, context)
    for function in functions_of(context.tree):
        found.extend(check_scope(function, context))
    return found
