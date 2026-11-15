import ast
import re

IDENTIFIER = re.compile(
    r"(?:^|_)(?:id|ids|uuid|guid|key|token|code|slug|hash|status|type|role|kind|"
    r"sort|order|page|limit|offset|cursor|pk)$"
)
LOOKUP_CALLS = {
    "filter",
    "filter_by",
    "exclude",
    "get",
    "where",
    "having",
    "and_",
    "or_",
    "find",
    "find_one",
    "find_many",
    "count_documents",
}
TEXT_METHODS = {"like", "ilike", "contains", "icontains", "startswith", "endswith"}
SQL_CALLS = {
    "execute",
    "executemany",
    "fetch",
    "fetchrow",
    "fetchall",
    "fetchval",
    "exec_driver_sql",
    "raw",
}
SQL_TEXT = re.compile(r"\b(?:where|like)\b", re.IGNORECASE)
FINDER = re.compile(r"^(?:find|search|lookup)(?:_\w+)?$|^(?:get|list|count)_\w*_by_(\w+)$")
PASS_THROUGH = {"lower", "upper", "casefold", "title"}


def is_identifier_name(name):
    return IDENTIFIER.search(name) is not None


def func_name(call):
    func = call.func
    if isinstance(func, ast.Attribute):
        return func.attr
    return func.id if isinstance(func, ast.Name) else None


def climbed(node, context):
    current = node
    while True:
        parent = context.parents.get(id(current))
        passes = (
            isinstance(parent, (ast.JoinedStr, ast.FormattedValue))
            or (isinstance(parent, ast.BinOp) and isinstance(parent.op, (ast.Add, ast.Mod)))
            or (isinstance(parent, ast.BoolOp) and parent.values[0] is current)
            or (
                isinstance(parent, ast.Attribute)
                and parent.attr in PASS_THROUGH
                and isinstance(context.parents.get(id(parent)), ast.Call)
            )
        )
        if not passes:
            return current
        current = context.parents[id(parent)] if isinstance(parent, ast.Attribute) else parent


def ancestors(node, context):
    parent = context.parents.get(id(node))
    while parent is not None:
        yield parent
        parent = context.parents.get(id(parent))


def is_method_call(call, names):
    return isinstance(call.func, ast.Attribute) and call.func.attr in names


def inside_lookup(node, context):
    return any(
        isinstance(parent, ast.Call) and is_method_call(parent, LOOKUP_CALLS)
        for parent in ancestors(node, context)
    )


def camel_receiver(call):
    base = call.func.value if isinstance(call.func, ast.Attribute) else None
    while isinstance(base, ast.Attribute):
        base = base.value
    return isinstance(base, ast.Name) and base.id[:1].isupper()


def sql_call(call, argument):
    if func_name(call) not in SQL_CALLS or not call.args or argument is call.args[0]:
        return False
    first = call.args[0]
    if isinstance(first, ast.Call) and first.args:
        first = first.args[0]
    text = first.value if isinstance(first, ast.Constant) else ast.unparse(first)
    return isinstance(text, str) and SQL_TEXT.search(text) is not None


def argument_lookup(call, argument, context):
    name = func_name(call)
    if name is None:
        return False
    if name in TEXT_METHODS:
        return inside_lookup(call, context) or camel_receiver(call)
    finder = FINDER.match(name)
    if finder is not None:
        return not is_identifier_name(finder.group(1) or "")
    return sql_call(call, argument)


def keyword_lookup(keyword, call, context):
    column = keyword.arg.split("__")[0] if keyword.arg else ""
    return is_method_call(call, LOOKUP_CALLS) and bool(column) and not is_identifier_name(column)


def reaches_lookup(node, context):
    top = climbed(node, context)
    parent = context.parents.get(id(top))
    if isinstance(parent, ast.keyword):
        call = context.parents.get(id(parent))
        return isinstance(call, ast.Call) and keyword_lookup(parent, call, context)
    if isinstance(parent, ast.Compare) and any(isinstance(op, ast.Eq) for op in parent.ops):
        return inside_lookup(parent, context)
    if isinstance(parent, ast.Call) and top in parent.args:
        return argument_lookup(parent, top, context)
    container = parent if isinstance(parent, (ast.Tuple, ast.List, ast.Dict)) else None
    outer = context.parents.get(id(container)) if container is not None else None
    return isinstance(outer, ast.Call) and sql_call(outer, container)
