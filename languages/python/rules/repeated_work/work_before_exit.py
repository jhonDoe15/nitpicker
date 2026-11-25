import ast

from checks.common import dotted_name, finding, functions_of, own_nodes
from containers.scope import contains, name_stores, parameter_names
from repeated_work.scope_helpers import (
    binding_of,
    is_settled,
    reads_name,
    statement_blocks,
)

RULE = "work-before-early-exit"
GUARDED = True
EXITS = (ast.Return, ast.Raise, ast.Break, ast.Continue)
BRANCHING = (ast.IfExp, ast.BoolOp)
PURE_CONSTRUCTORS = {"dict", "frozenset", "list", "set", "sorted", "tuple"}
PURE_STDLIB_CONSTRUCTORS = {"collections.Counter"}
PURE_AGGREGATES = {"all", "any", "max", "min", "sum"}
CALLBACK_BUILTINS = {"filter", "map"}
PURE_VALUE_BUILTINS = {
    "abs",
    "bool",
    "enumerate",
    "float",
    "int",
    "isinstance",
    "len",
    "range",
    "reversed",
    "round",
    "str",
    "zip",
}
PURE_METHODS = {
    "copy",
    "count",
    "endswith",
    "find",
    "get",
    "index",
    "items",
    "join",
    "keys",
    "lower",
    "lstrip",
    "replace",
    "rsplit",
    "rstrip",
    "split",
    "splitlines",
    "startswith",
    "strip",
    "upper",
    "values",
}
PLAIN_TYPES = (
    ast.Name,
    ast.Constant,
    ast.Attribute,
    ast.Subscript,
    ast.Slice,
    ast.BinOp,
    ast.UnaryOp,
    ast.BoolOp,
    ast.Compare,
    ast.IfExp,
    ast.List,
    ast.Tuple,
    ast.Set,
    ast.Dict,
    ast.Starred,
    ast.JoinedStr,
    ast.FormattedValue,
    ast.ListComp,
    ast.SetComp,
    ast.DictComp,
    ast.GeneratorExp,
    ast.comprehension,
    ast.expr_context,
    ast.operator,
    ast.unaryop,
    ast.boolop,
    ast.cmpop,
)


def pure_callable_parts(node):
    if isinstance(node, ast.Lambda):
        return [node.body]
    if isinstance(node, ast.Name) and node.id in (
        PURE_VALUE_BUILTINS | PURE_CONSTRUCTORS
    ):
        return []
    return None


def pure_keyword_parts(keywords, allow_key_fn):
    parts = []
    for keyword in keywords:
        if allow_key_fn and keyword.arg == "key":
            key_parts = pure_callable_parts(keyword.value)
            if key_parts is None:
                return None
            parts.extend(key_parts)
        else:
            parts.append(keyword.value)
    return parts


def pure_call_parts(call, aliases):
    dotted = dotted_name(call.func, aliases) or ""
    if isinstance(call.func, ast.Name) and call.func.id in CALLBACK_BUILTINS:
        if len(call.args) < 2 or call.keywords:
            return None
        fn_parts = pure_callable_parts(call.args[0])
        return None if fn_parts is None else [*fn_parts, *call.args[1:]]
    if isinstance(call.func, ast.Name) and call.func.id in (
        PURE_CONSTRUCTORS | PURE_AGGREGATES | PURE_VALUE_BUILTINS
    ):
        allow_key = call.func.id in {"sorted", "min", "max"}
        kw_parts = pure_keyword_parts(call.keywords, allow_key)
        return None if kw_parts is None else [*call.args, *kw_parts]
    if dotted in PURE_STDLIB_CONSTRUCTORS:
        return [*call.args, *(kw.value for kw in call.keywords)]
    if isinstance(call.func, ast.Attribute) and call.func.attr in PURE_METHODS:
        return [call.func.value, *call.args, *(kw.value for kw in call.keywords)]
    return None


def is_pure_work(root, aliases):
    pending = [root]
    while pending:
        node = pending.pop()
        if isinstance(node, ast.Call):
            parts = pure_call_parts(node, aliases)
            if parts is None:
                return False
            pending.extend(parts)
            continue
        if isinstance(node, PLAIN_TYPES):
            pending.extend(ast.iter_child_nodes(node))
            continue
        return False
    return True


def is_costly_step(node, aliases):
    if isinstance(node, (ast.ListComp, ast.SetComp, ast.DictComp)):
        return True
    if not isinstance(node, ast.Call):
        return False
    has_args = bool(node.args or node.keywords)
    if isinstance(node.func, ast.Name):
        if node.func.id in PURE_CONSTRUCTORS and has_args:
            return True
        if node.func.id in CALLBACK_BUILTINS:
            return True
        if node.func.id in PURE_AGGREGATES and any(
            isinstance(arg, ast.GeneratorExp) for arg in node.args
        ):
            return True
    return (dotted_name(node.func, aliases) or "") in PURE_STDLIB_CONSTRUCTORS and has_args


def is_costly(root, aliases):
    return any(is_costly_step(node, aliases) for node in ast.walk(root))


def ends_in_exit(body):
    return bool(body) and isinstance(body[-1], EXITS)


def nested_functions(scope):
    return {
        node.name: node
        for node in own_nodes(scope)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }


def calls_reader(statement, name, nested):
    for node in ast.walk(statement):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id in nested
            and reads_name(nested[node.func.id], name)
        ):
            return True
    return False


def is_early_exit(statement, name, nested):
    return (
        isinstance(statement, ast.If)
        and not statement.orelse
        and ends_in_exit(statement.body)
        and is_settled(statement.test)
        and not reads_name(statement.test, name)
        and not any(reads_name(item, name) for item in statement.body)
        and not calls_reader(statement, name, nested)
    )


def read_later(scope, name, assignment):
    return any(
        isinstance(node, ast.Name)
        and node.id == name
        and isinstance(node.ctx, ast.Load)
        and not contains(assignment, node)
        for node in ast.walk(scope)
    )


def check_scope(scope, context):
    found = []
    params = (
        parameter_names(scope)
        if isinstance(scope, (ast.FunctionDef, ast.AsyncFunctionDef))
        else set()
    )
    nested = nested_functions(scope)
    for block in statement_blocks(scope):
        for index in range(len(block) - 1):
            statement, following = block[index], block[index + 1]
            name, init = binding_of(statement)
            if name is None or init is None or isinstance(init, BRANCHING):
                continue
            if name in params or len(name_stores(scope, name)) != 1:
                continue
            if (
                read_later(scope, name, statement)
                and is_early_exit(following, name, nested)
                and is_costly(init, context.aliases)
                and is_pure_work(init, context.aliases)
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
