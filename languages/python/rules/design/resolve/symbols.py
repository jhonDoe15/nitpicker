import ast

from design.support.astutil import FUNCTIONS, constant_text
from design.support.decorators import (
    ABSTRACT,
    OVERLOADS,
    PROPERTY_NAMES,
    decorator_names,
    has_only_neutral,
)

TYPE_ALIAS = getattr(ast, "TypeAlias", None)


def accessor_role(names):
    roles = [n.rsplit(".", 1)[1] for n in names if n.endswith((".setter", ".deleter"))]
    return roles[0] if roles else None


def member_id(function, names):
    role = accessor_role(names)
    suffix = f"({role})" if role else ""
    return f"{function.module.path}#{function.qualname}{suffix}"


class Function:
    def __init__(self, node, module, owner, claim):
        self.node = node
        self.module = module
        self.owner = owner
        self.name = node.name
        self.qualname = f"{owner.qualname}.{node.name}" if owner else node.name
        self.decorators = names = decorator_names(node, module.aliases)
        self.overload = any(name in OVERLOADS for name in names)
        self.static = "staticmethod" in names
        self.classmethod = "classmethod" in names
        self.is_property = any(name in PROPERTY_NAMES for name in names)
        self.is_accessor_pair = accessor_role(names) is not None
        self.is_abstract = any(name in ABSTRACT for name in names)
        self.is_async = isinstance(node, ast.AsyncFunctionDef)
        self.plain = has_only_neutral(names)
        self.id = None if self.overload else claim(member_id(self, names))


class Klass:
    def __init__(self, node, module, owner, claim):
        self.node = node
        self.module = module
        self.owner = owner
        self.name = node.name
        self.qualname = f"{owner.qualname}.{node.name}" if owner else node.name
        self.id = claim(f"{module.path}#{self.qualname}")
        self.functions = []
        self.members = {}
        self.nested = {}
        counts = {}
        for statement in node.body:
            if isinstance(statement, FUNCTIONS):
                self.add_function(statement, claim, counts)
            elif isinstance(statement, ast.ClassDef):
                counts[statement.name] = counts.get(statement.name, 0) + 1
                self.nested[statement.name] = Klass(statement, module, self, claim)
        self.nested = {n: k for n, k in self.nested.items() if counts[n] == 1}
        self.members = {n: f for n, f in self.members.items() if counts.get(n) == 1}

    def add_function(self, statement, claim, counts):
        function = Function(statement, self.module, self, claim)
        if function.overload:
            return
        self.functions.append(function)
        if function.is_accessor_pair:
            return
        counts[function.name] = counts.get(function.name, 0) + 1
        self.members[function.name] = function

    def all_classes(self):
        pending = [self]
        for klass in pending:
            yield klass
            pending.extend(klass.nested.values())


class LiteralAlias:
    def __init__(self, name, node, module, cases, claim):
        self.name = name
        self.node = node
        self.module = module
        self.cases = cases
        self.id = claim(f"{module.path}#{name}")
        self.owner = None


class Variable:
    def __init__(self, name, module):
        self.name = name
        self.module = module
        self.statements = []


class ModuleRef:
    def __init__(self, path):
        self.path = path


class PrefixRef:
    def __init__(self, dotted):
        self.dotted = dotted


class Module:
    def __init__(self, context):
        self.context = context
        self.path = context.path
        self.tree = context.tree
        self.aliases = context.aliases
        self.parents = context.parents
        self.id = context.path
        self.classes = {}
        self.functions = {}
        self.literals = {}
        self.variables = {}
        self.imports = {}
        self.stars = []
        self.counts = {}
        self.exports = None
        self.rebound = set()
        self.has_main_guard = False
        self.all_functions = []

    def count(self, name):
        self.counts[name] = self.counts.get(name, 0) + 1


def literal_cases(value):
    members = [value]
    cases = []
    for member in members:
        if isinstance(member, ast.BinOp) and isinstance(member.op, ast.BitOr):
            members.extend([member.left, member.right])
        elif isinstance(member, ast.Subscript) and subscript_base(member) == "Literal":
            cases.extend(literal_members(member.slice))
        else:
            return None
    return cases if cases and None not in cases else None


def subscript_base(node):
    base = node.value
    if isinstance(base, ast.Attribute):
        return base.attr
    return base.id if isinstance(base, ast.Name) else None


def literal_members(slice_node):
    elements = slice_node.elts if isinstance(slice_node, ast.Tuple) else [slice_node]
    return [constant_text(element) for element in elements]


def assigned_names(statement):
    if isinstance(statement, ast.Assign):
        return [
            (t.id, statement.value)
            for t in statement.targets
            if isinstance(t, ast.Name)
        ]
    if isinstance(statement, ast.AnnAssign) and isinstance(statement.target, ast.Name):
        return [(statement.target.id, statement.value)]
    if TYPE_ALIAS is not None and isinstance(statement, TYPE_ALIAS):
        return [(statement.name.id, statement.value)]
    return []


def export_names(statement):
    value = getattr(statement, "value", None)
    names = []
    for element in getattr(value, "elts", []):
        if isinstance(element, ast.Constant) and isinstance(element.value, str):
            names.append(element.value)
    return names


def register_assignment(module, statement, claim):
    for name, value in assigned_names(statement):
        module.count(name)
        if name == "__all__":
            module.exports = (module.exports or []) + export_names(statement)
            continue
        cases = literal_cases(value) if value is not None else None
        if cases is not None and name not in module.literals:
            module.literals[name] = LiteralAlias(name, statement, module, cases, claim)
            continue
        module.variables.setdefault(name, Variable(name, module)).statements.append(
            statement
        )


def register_statement(module, statement, claim):
    if isinstance(statement, ast.ClassDef):
        module.count(statement.name)
        module.classes[statement.name] = Klass(statement, module, None, claim)
    elif isinstance(statement, FUNCTIONS):
        function = Function(statement, module, None, claim)
        if not function.overload:
            module.all_functions.append(function)
            module.count(statement.name)
            module.functions[statement.name] = function
    elif (
        isinstance(statement, ast.AugAssign)
        and getattr(statement.target, "id", "") == "__all__"
    ):
        module.exports = (module.exports or []) + export_names(statement)
    else:
        register_assignment(module, statement, claim)


def is_main_guard(statement):
    if not isinstance(statement, ast.If) or not isinstance(statement.test, ast.Compare):
        return False
    test = statement.test
    sides = [test.left, *test.comparators]
    names = [s.id for s in sides if isinstance(s, ast.Name)]
    values = [s.value for s in sides if isinstance(s, ast.Constant)]
    return names == ["__name__"] and values == ["__main__"]


def build_module(context, claim):
    module = Module(context)
    for statement in context.tree.body:
        register_statement(module, statement, claim)
        module.has_main_guard = module.has_main_guard or is_main_guard(statement)
    for node in ast.walk(context.tree):
        if isinstance(node, ast.Global):
            module.rebound.update(node.names)
    return module
