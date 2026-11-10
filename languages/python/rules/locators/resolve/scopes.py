import ast

from locators.model import OWNER_NAMES

FUNCTION_SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)
NESTED_SCOPES = (*FUNCTION_SCOPES, ast.ClassDef)
UNKNOWN = ("unknown", None)


def own_nodes(scope):
    body = scope.body if isinstance(scope.body, list) else [scope.body]
    pending = list(reversed(body))
    while pending:
        node = pending.pop()
        yield node
        if not isinstance(node, NESTED_SCOPES):
            pending.extend(reversed(list(ast.iter_child_nodes(node))))


def enclosing_scopes(node, context):
    chain, crossed = [], False
    current = context.parents.get(id(node))
    while current is not None:
        if isinstance(current, FUNCTION_SCOPES):
            chain.append(current)
            crossed = True
        elif isinstance(current, ast.ClassDef) and not crossed:
            chain.append(current)
        current = context.parents.get(id(current))
    return chain


def enclosing_class(node, context):
    current = context.parents.get(id(node))
    while current is not None and not isinstance(current, ast.ClassDef):
        current = context.parents.get(id(current))
    return current


def bind_target(target, entry, add):
    if isinstance(target, ast.Name):
        add(target.id, entry)
    elif isinstance(target, (ast.Tuple, ast.List, ast.Starred)):
        for element in ast.iter_child_nodes(target):
            bind_target(element, UNKNOWN, add)


def bind_node(node, add, declared, with_definitions):
    if isinstance(node, ast.Assign):
        for target in node.targets:
            bind_target(target, ("value", node.value), add)
    elif isinstance(node, ast.AnnAssign):
        bind_target(node.target, ("annotation", node.annotation), add)
        if node.value is not None:
            bind_target(node.target, ("value", node.value), add)
    elif isinstance(node, ast.NamedExpr):
        bind_target(node.target, ("value", node.value), add)
    elif isinstance(node, (ast.AugAssign, ast.For, ast.AsyncFor)):
        bind_target(node.target, UNKNOWN, add)
    elif isinstance(node, (ast.With, ast.AsyncWith)):
        for item in node.items:
            if item.optional_vars is not None:
                bind_target(item.optional_vars, UNKNOWN, add)
    elif isinstance(node, ast.ExceptHandler) and node.name:
        add(node.name, UNKNOWN)
    elif isinstance(node, (ast.Global, ast.Nonlocal)):
        declared.update(node.names)
    elif with_definitions and isinstance(node, NESTED_SCOPES) and hasattr(node, "name"):
        add(node.name, UNKNOWN)


def collect(scope):
    found, declared = {}, set()

    def add(name, entry):
        found.setdefault(name, []).append(entry)

    if isinstance(scope, FUNCTION_SCOPES):
        arguments = scope.args
        every = [*arguments.posonlyargs, *arguments.args, *arguments.kwonlyargs]
        for argument in [*every, arguments.vararg, arguments.kwarg]:
            if argument is not None:
                annotated = getattr(argument, "annotation", None)
                add(argument.arg, ("annotation", annotated) if annotated else UNKNOWN)
    definitions = not isinstance(scope, ast.Module)
    for node in own_nodes(scope):
        bind_node(node, add, declared, definitions)
    for name in declared:
        found.pop(name, None)
    return found


def bindings(scope, context):
    table = context.project.memo("locator-bindings", lambda _: {})
    if id(scope) not in table:
        table[id(scope)] = collect(scope)
    return table[id(scope)]


def attribute_bindings(klass, context):
    table = context.project.memo("locator-attributes", lambda _: {})
    if id(klass) in table:
        return table[id(klass)]
    found = {}

    def add(name, entry):
        found.setdefault(name, []).append(entry)

    for statement in klass.body:
        bind_node(statement, add, set(), False)
    for method in klass.body:
        if isinstance(method, ast.ClassDef) or not hasattr(method, "args"):
            continue
        for node in own_nodes(method):
            bind_owner_attribute(node, add)
    table[id(klass)] = found
    return found


def bind_owner_attribute(node, add):
    pairs = []
    if isinstance(node, ast.Assign):
        pairs = [(target, ("value", node.value)) for target in node.targets]
    elif isinstance(node, ast.AnnAssign):
        pairs = [(node.target, ("annotation", node.annotation))]
        if node.value is not None:
            pairs.append((node.target, ("value", node.value)))
    for target, entry in pairs:
        owner = getattr(target, "value", None)
        if (
            isinstance(target, ast.Attribute)
            and getattr(owner, "id", None) in OWNER_NAMES
        ):
            add(target.attr, entry)


def local_entries(name, node, context):
    for scope in enclosing_scopes(node, context):
        entries = bindings(scope, context).get(name)
        if entries is not None:
            return entries
    return None


def name_entries(name, node, context):
    entries = local_entries(name, node, context)
    return entries if entries is not None else bindings(context.tree, context).get(name)
