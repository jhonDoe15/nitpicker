import ast

SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)
EXIT_CALLS = {"sys.exit", "os._exit", "exit", "quit"}


def target_key(node):
    if isinstance(node, ast.Name):
        return node.id
    if (
        isinstance(node, ast.Attribute)
        and isinstance(node.value, ast.Name)
        and node.value.id == "self"
    ):
        return f"self.{node.attr}"
    return None


def is_none(node):
    return isinstance(node, ast.Constant) and node.value is None


def compared_key(test):
    if len(test.ops) != 1 or not isinstance(test.ops[0], (ast.Is, ast.Eq)):
        return None
    left, right = test.left, test.comparators[0]
    if is_none(right):
        return target_key(left)
    return target_key(right) if is_none(left) else None


def null_target(test):
    if isinstance(test, ast.Compare):
        return compared_key(test)
    if isinstance(test, ast.BoolOp) and isinstance(test.op, ast.Or):
        keys = {null_target(value) for value in test.values}
        return keys.pop() if len(keys) == 1 else None
    return None


def own_children(node):
    return sorted(
        ast.iter_child_nodes(node),
        key=lambda child: (
            getattr(child, "lineno", 0),
            getattr(child, "col_offset", 0),
        ),
    )


def nodes_within(root):
    found = []
    pending = [root]
    while pending:
        node = pending.pop()
        found.append(node)
        if node is root or not isinstance(node, SCOPES):
            pending.extend(own_children(node))
    return found


def is_store(node):
    return isinstance(getattr(node, "ctx", None), (ast.Store, ast.Del))


FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


def only_raises(function):
    body = [
        statement
        for statement in function.body
        if not (
            isinstance(statement, ast.Expr)
            and isinstance(statement.value, ast.Constant)
        )
    ]
    return len(body) == 1 and isinstance(body[0], ast.Raise)


def raising_names(tree):
    return {
        node.name
        for node in ast.walk(tree)
        if isinstance(node, FUNCTIONS) and only_raises(node)
    }


def enclosing_function(node, parents):
    parent = parents.get(id(node))
    while parent is not None and not isinstance(parent, FUNCTIONS):
        parent = parents.get(id(parent))
    return parent


def is_shared(key, node, parents):
    if key.startswith("self."):
        return True
    function = enclosing_function(node, parents)
    if function is None:
        return True
    arguments = function.args
    names = {
        argument.arg
        for argument in [*arguments.posonlyargs, *arguments.args, *arguments.kwonlyargs]
    }
    declared = {
        name
        for inner in ast.walk(function)
        if isinstance(inner, ast.Global)
        for name in inner.names
    }
    assigned = any(
        isinstance(inner, ast.Name) and inner.id == key and is_store(inner)
        for inner in ast.walk(function)
    )
    return key in declared or (key not in names and not assigned)
