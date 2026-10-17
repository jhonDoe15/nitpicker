import ast

from checks.common import dotted_name, own_nodes

SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)
MAX_HOPS = 4
ENUM_BASES = {"Enum", "IntEnum", "StrEnum", "Flag", "IntFlag"}
BOOLEAN_CALLS = {"bool", "strtobool", "getboolean", "as_bool", "to_bool", "str2bool"}


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


def collect_bindings(scope):
    values = {}

    def add(target, kind, value):
        if isinstance(target, ast.Name):
            values.setdefault(target.id, []).append((kind, value))
        elif isinstance(target, (ast.Tuple, ast.List)):
            for element in target.elts:
                add(element, kind, value)
        elif isinstance(target, ast.Starred):
            add(target.value, kind, value)

    if isinstance(scope, SCOPES):
        arguments = scope.args
        every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
        for argument in every + [arguments.vararg, arguments.kwarg]:
            if argument is not None:
                add(ast.Name(id=argument.arg), "param", argument.annotation)
    for node in own_nodes(scope):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                add(target, "value", node.value)
        elif isinstance(node, (ast.AnnAssign, ast.AugAssign, ast.NamedExpr)):
            if node.value is not None:
                add(node.target, "value", node.value)
        elif isinstance(node, (ast.For, ast.AsyncFor, ast.comprehension)):
            add(node.target, "iter", node.iter)
        elif isinstance(node, ast.withitem) and node.optional_vars is not None:
            add(node.optional_vars, "value", node.context_expr)
    return values


def bindings(where):
    scope = where.scope if where.scope is not None else where.context.tree
    key = ("security-bindings", where.context.path, id(scope))
    return where.context.project.memo(key, lambda _: collect_bindings(scope))


def module_where(context):
    return Where(context, None)


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


def definition(node, where, kinds=(ast.ClassDef,), hops=0):
    if hops > MAX_HOPS:
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


def is_boolean_shaped(node, where):
    if isinstance(node, (ast.Compare, ast.BoolOp)):
        return True
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
        return True
    if isinstance(node, ast.Call):
        name = dotted_name(node.func, where.context.aliases) or ""
        cast = keyword(node, "cast")
        return (
            name.rsplit(".", 1)[-1] in BOOLEAN_CALLS
            or name.endswith("env.bool")
            or (isinstance(cast, ast.Name) and cast.id == "bool")
        )
    return False


def can_be(node, where, wanted, depth=0):
    if depth > 4 or node is None:
        return False
    if isinstance(node, ast.Constant):
        return node.value is wanted
    if isinstance(node, ast.IfExp):
        return any(
            can_be(n, where, wanted, depth + 1) for n in (node.body, node.orelse)
        )
    if isinstance(node, ast.Name):
        return any(
            kind == "value" and can_be(value, place, wanted, depth + 1)
            for kind, value, place in lookup(node.id, where)
        )
    return is_boolean_shaped(node, where)


def can_be_false(node, where):
    return can_be(node, where, False)


def can_be_true(node, where):
    return can_be(node, where, True)


def keyword(call, name):
    return next((k.value for k in call.keywords if k.arg == name), None)


def argument(call, index, name):
    found = keyword(call, name)
    if found is None and len(call.args) > index:
        found = call.args[index]
    return found


def has_double_star(call):
    return any(k.arg is None for k in call.keywords)


FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


def enclosing_class(node, context):
    current = context.parents.get(id(node))
    while current is not None and not isinstance(current, ast.ClassDef):
        current = context.parents.get(id(current))
    return current


def function_of(call, where):
    function = call.func
    if (
        isinstance(function, ast.Attribute)
        and isinstance(function.value, ast.Name)
        and function.value.id in {"self", "cls"}
    ):
        owner = enclosing_class(call, where.context)
        for statement in owner.body if owner is not None else []:
            if isinstance(statement, FUNCTIONS) and statement.name == function.attr:
                return statement, Where(
                    where.context, scope_of(statement, where.context)
                )
        return None
    return definition(function, where, FUNCTIONS)


def bind_arguments(call, function, where):
    parameters = function.args.posonlyargs + function.args.args
    if parameters and parameters[0].arg in {"self", "cls"}:
        if isinstance(call.func, ast.Attribute):
            parameters = parameters[1:]
    bound = {}
    for parameter, value in zip(parameters, call.args):
        if isinstance(value, ast.Starred):
            break
        bound[parameter.arg] = ("value", value, where)
    for keyword in call.keywords:
        if keyword.arg is not None:
            bound[keyword.arg] = ("value", keyword.value, where)
    return bound
