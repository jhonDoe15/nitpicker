import ast

from checks.common import dotted_name, own_nodes

SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
MAX_HOPS = 4
ENUM_BASES = {"Enum", "IntEnum", "StrEnum", "Flag", "IntFlag"}


class Where:
    def __init__(self, context, scope, overrides=None):
        self.context = context
        self.scope = scope
        self.overrides = overrides or {}

    def at(self, scope):
        return Where(self.context, scope)


def scope_of(node, context):
    current = context.parents.get(id(node))
    while current is not None and not isinstance(current, SCOPES):
        current = context.parents.get(id(current))
    return current


def where_of(node, context):
    return Where(context, scope_of(node, context))


def module_where(context):
    return Where(context, None)


def parameter_defaults(arguments):
    positional = arguments.posonlyargs + arguments.args
    start = len(positional) - len(arguments.defaults)
    pairs = list(zip(positional[start:], arguments.defaults))
    keyword_pairs = zip(arguments.kwonlyargs, arguments.kw_defaults)
    return pairs + [(name, value) for name, value in keyword_pairs if value is not None]


def synthetic_call(owner, method, node):
    call = ast.Call(func=ast.Attribute(value=owner, attr=method), args=[], keywords=[])
    return ast.copy_location(call, node)


def loop_parts(target, iterable):
    if not isinstance(target, ast.Tuple) or not isinstance(iterable, ast.Call):
        return None
    function = iterable.func
    name = function.id if isinstance(function, ast.Name) else None
    elements = target.elts
    if name == "enumerate" and len(elements) == 2 and iterable.args:
        index = ast.copy_location(ast.Constant(value=0), iterable)
        return [(elements[0], "value", index), (elements[1], "iter", iterable.args[0])]
    if name == "zip" and len(elements) == len(iterable.args):
        return [
            (element, "iter", value) for element, value in zip(elements, iterable.args)
        ]
    if isinstance(function, ast.Attribute) and function.attr == "items":
        if len(elements) == 2 and not iterable.args:
            keys = synthetic_call(function.value, "keys", iterable)
            values = synthetic_call(function.value, "values", iterable)
            return [(elements[0], "iter", keys), (elements[1], "iter", values)]
    return None


class Bindings:
    def __init__(self):
        self.values = {}

    def add(self, target, kind, value):
        if isinstance(target, ast.Name):
            self.values.setdefault(target.id, []).append((kind, value))
        elif isinstance(target, (ast.Tuple, ast.List)):
            for element in target.elts:
                self.add(element, kind, value)
        elif isinstance(target, ast.Starred):
            self.add(target.value, kind, value)

    def add_loop(self, target, iterable):
        parts = loop_parts(target, iterable)
        if parts is None:
            self.add(target, "iter", iterable)
            return
        for element, kind, value in parts:
            self.add(element, kind, value)

    def add_parameters(self, scope):
        arguments = scope.args
        every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
        for argument in every + [arguments.vararg, arguments.kwarg]:
            if argument is not None:
                self.add(ast.Name(id=argument.arg), "param", argument.annotation)
        for argument, default in parameter_defaults(arguments):
            self.add(ast.Name(id=argument.arg), "value", default)

    def add_node(self, node):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                self.add(target, "value", node.value)
        elif isinstance(node, (ast.AnnAssign, ast.AugAssign, ast.NamedExpr)):
            if node.value is not None:
                self.add(node.target, "value", node.value)
        elif isinstance(node, (ast.For, ast.AsyncFor, ast.comprehension)):
            self.add_loop(node.target, node.iter)
        elif isinstance(node, ast.withitem) and node.optional_vars is not None:
            self.add(node.optional_vars, "value", node.context_expr)


def collect_bindings(scope):
    found = Bindings()
    if isinstance(scope, SCOPES):
        found.add_parameters(scope)
    for node in own_nodes(scope):
        found.add_node(node)
    return found.values


def bindings(where):
    scope = where.scope if where.scope is not None else where.context.tree
    key = ("security-bindings", where.context.path, id(scope))
    return where.context.project.memo(key, lambda _: collect_bindings(scope))


def imported_where(name, where):
    dotted = where.context.aliases[0].get(name)
    located = where.context.project.locate(dotted) if dotted else None
    if located is None:
        return None
    other = where.context.project.contexts.get(located[0])
    return (module_where(other), located[1]) if other is not None else None


def lookup(name, where, hops=0):
    if name in where.overrides:
        return [where.overrides[name]]
    scope = where.scope
    while True:
        found = bindings(where.at(scope)).get(name)
        if found:
            current = where.at(scope)
            return [(kind, node, current) for kind, node in found]
        if scope is None:
            break
        scope = scope_of(scope, where.context)
    imported = imported_where(name, where)
    if imported is None or hops > MAX_HOPS:
        return []
    return lookup(imported[1], imported[0], hops + 1)


def values_of(name, where):
    return [
        (value, place) for kind, value, place in lookup(name, where) if kind == "value"
    ]


def definition(node, where, kinds=(ast.ClassDef,), hops=0):
    if hops > MAX_HOPS or where is None:
        return None
    if isinstance(node, ast.Name):
        for statement in where.context.tree.body:
            if isinstance(statement, kinds) and statement.name == node.id:
                return statement, module_where(where.context)
        imported = imported_where(node.id, where)
        if imported is not None:
            return definition(ast.Name(id=imported[1]), imported[0], kinds, hops + 1)
    if isinstance(node, ast.Attribute):
        dotted = dotted_name(node, where.context.aliases)
        located = where.context.project.locate(dotted) if dotted else None
        other = located and where.context.project.contexts.get(located[0])
        if other is not None:
            target = ast.Name(id=located[1])
            return definition(target, module_where(other), kinds, hops + 1)
    return None


def base_names(cls):
    return {
        (dotted_name(base, ({}, {})) or "").rsplit(".", 1)[-1] for base in cls.bases
    }


def is_enum_class(node, where):
    found = definition(node, where)
    return found is not None and bool(base_names(found[0]) & ENUM_BASES)


def enclosing_class(node, context):
    current = context.parents.get(id(node))
    while current is not None and not isinstance(current, ast.ClassDef):
        current = context.parents.get(id(current))
    return current
