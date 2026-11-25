import ast

from checks.common import dotted_name, last_name, own_nodes
from checks.loop_scope import (
    COMPREHENSIONS,
    FUNCTIONS,
    ancestors,
    in_loop_body,
    is_evaluated_once,
)
from containers.scope import contains, is_iterating_lambda, name_stores, parameter_names

LOOPS = (ast.For, ast.AsyncFor, ast.While)
UNSETTLED = (
    ast.Call,
    ast.Await,
    ast.Yield,
    ast.YieldFrom,
    ast.NamedExpr,
    ast.Lambda,
    ast.ListComp,
    ast.SetComp,
    ast.DictComp,
    ast.GeneratorExp,
)
VERBS = (
    "accept",
    "acquire",
    "add",
    "advance",
    "append",
    "apply",
    "call",
    "clear",
    "close",
    "consume",
    "create",
    "dec",
    "decrement",
    "delete",
    "dequeue",
    "discard",
    "eat",
    "emit",
    "enqueue",
    "exec",
    "expect",
    "extend",
    "fetch",
    "flush",
    "generate",
    "inc",
    "increment",
    "insert",
    "lex",
    "match",
    "next",
    "now",
    "open",
    "poll",
    "pop",
    "post",
    "push",
    "put",
    "random",
    "read",
    "readline",
    "readlines",
    "release",
    "remove",
    "reset",
    "run",
    "save",
    "scan",
    "seek",
    "send",
    "set",
    "setdefault",
    "shift",
    "skip",
    "splice",
    "start",
    "stop",
    "take",
    "tell",
    "test",
    "unshift",
    "update",
    "uuid",
    "write",
)
MEMO_METHODS = {"get", "setdefault"}
CACHING_DECORATORS = {
    "functools.cache",
    "functools.lru_cache",
    "cache",
    "lru_cache",
}
FS_CALL_NAMES = {
    "open",
    "io.open",
    "os.stat",
    "os.lstat",
    "os.scandir",
    "os.listdir",
    "os.walk",
    "os.path.exists",
    "os.path.isfile",
    "os.path.isdir",
    "os.path.getsize",
    "os.path.getmtime",
    "os.path.islink",
    "aiofiles.open",
}
FS_METHOD_NAMES = {"stat", "lstat", "read_text", "read_bytes"}
MAX_SHOWN = 60
KEPT_SHOWN = 57
MAX_CONST_DEPTH = 20
NESTED_SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)


def innermost_repeat(node, parents):
    chain = ancestors(node, parents)
    for index in range(1, len(chain)):
        child, parent = chain[index - 1], chain[index]
        if is_iterating_lambda(parent, parents):
            return parent
        if isinstance(parent, FUNCTIONS):
            return None
        if in_loop_body(parent, child):
            return parent
        if isinstance(parent, COMPREHENSIONS) and not is_evaluated_once(
            parent, chain, index
        ):
            return parent
    return None


def is_settled(node):
    return not any(isinstance(child, UNSETTLED) for child in ast.walk(node))


def is_verb(raw_name):
    name = raw_name.lstrip("_")
    for verb in VERBS:
        if name == verb:
            return True
        if name.startswith(verb):
            following = name[len(verb)]
            if following == "_" or following.isupper() or following.isdigit():
                return True
    return False


def reads_name(node, name, except_node=None):
    for child in ast.walk(node):
        if (
            isinstance(child, ast.Name)
            and child.id == name
            and (except_node is None or not contains(except_node, child))
        ):
            return True
    return False


def names_in(node):
    return {child.id for child in ast.walk(node) if isinstance(child, ast.Name)}


def reads_memo(root, keyed):
    for node in ast.walk(root):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in MEMO_METHODS
            and any(keyed(arg) for arg in node.args)
        ):
            return True
        if (
            isinstance(node, ast.Compare)
            and len(node.ops) == 1
            and isinstance(node.ops[0], (ast.In, ast.NotIn))
            and keyed(node.left)
        ):
            return True
        if (
            isinstance(node, ast.Subscript)
            and isinstance(node.ctx, ast.Store)
            and keyed(node.slice)
        ):
            return True
    return False


def has_caching_decorator(function, aliases):
    for decorator in function.decorator_list:
        target = decorator.func if isinstance(decorator, ast.Call) else decorator
        name = dotted_name(target, aliases) or last_name(target) or ""
        if name in CACHING_DECORATORS:
            return True
    return False


def short_text(node):
    text = ast.unparse(node).splitlines()[0]
    return f"{text[:KEPT_SHOWN]}..." if len(text) > MAX_SHOWN else text


def same_ast(first, second):
    return ast.dump(first, include_attributes=False) == ast.dump(
        second, include_attributes=False
    )


def binding_of(statement):
    if (
        isinstance(statement, ast.Assign)
        and len(statement.targets) == 1
        and isinstance(statement.targets[0], ast.Name)
    ):
        return statement.targets[0].id, statement.value
    if (
        isinstance(statement, ast.AnnAssign)
        and isinstance(statement.target, ast.Name)
        and statement.value is not None
    ):
        return statement.target.id, statement.value
    return None, None


def statement_blocks(scope):
    pending = [scope]
    while pending:
        node = pending.pop()
        for field in ("body", "orelse", "finalbody"):
            block = getattr(node, field, None)
            if isinstance(block, list):
                yield block
                for statement in block:
                    if not isinstance(statement, NESTED_SCOPES):
                        pending.append(statement)
        pending.extend(getattr(node, "handlers", ()))
        pending.extend(getattr(node, "cases", ()))


def is_fs_call(call, aliases):
    name = dotted_name(call.func, aliases) or ""
    if name in FS_CALL_NAMES or name.startswith(("os.", "shutil.", "aiofiles.")):
        return True
    return isinstance(call.func, ast.Attribute) and call.func.attr in FS_METHOD_NAMES


def module_constant_map(tree):
    counts = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
            counts[node.id] = counts.get(node.id, 0) + 1
    found = {}
    for statement in tree.body:
        name, value = binding_of(statement)
        if name is not None and counts.get(name) == 1:
            found[name] = value
    return found


def outer_constant_map(tree, function, loop):
    constants = module_constant_map(tree)
    if function is None:
        return constants
    params = parameter_names(function)
    for name in list(constants):
        if name in params or name_stores(function, name):
            constants.pop(name, None)
    for node in own_nodes(function):
        name, value = binding_of(node)
        if name is None or name in params:
            continue
        if len(name_stores(function, name)) == 1 and not contains(loop, node):
            constants[name] = value
    return constants


def is_constant_expr(node, constants):
    pending = [(node, 0)]
    while pending:
        current, depth = pending.pop()
        if depth > MAX_CONST_DEPTH:
            return False
        if isinstance(current, ast.Constant):
            continue
        if isinstance(current, ast.Name):
            if current.id == "__name__":
                continue
            target = constants.get(current.id)
            if target is None:
                return False
            pending.append((target, depth + 1))
            continue
        if isinstance(current, ast.UnaryOp):
            pending.append((current.operand, depth + 1))
            continue
        if isinstance(current, ast.BinOp):
            pending.append((current.left, depth + 1))
            pending.append((current.right, depth + 1))
            continue
        if isinstance(current, (ast.Tuple, ast.List, ast.Set)):
            pending.extend((elt, depth + 1) for elt in current.elts)
            continue
        if isinstance(current, ast.Dict):
            for key, val in zip(current.keys, current.values):
                if key is None:
                    return False
                pending.append((key, depth + 1))
                pending.append((val, depth + 1))
            continue
        if isinstance(current, ast.JoinedStr):
            pending.extend((val, depth + 1) for val in current.values)
            continue
        if isinstance(current, ast.FormattedValue):
            pending.append((current.value, depth + 1))
            if current.format_spec is not None:
                pending.append((current.format_spec, depth + 1))
            continue
        return False
    return True