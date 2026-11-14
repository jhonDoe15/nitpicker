import ast

from checks.common import imported_module
from checks.state import local_names

FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
DEFINITIONS = (*FUNCTIONS, ast.ClassDef)
LOCAL = "local"
IMPORT = "import"
VALUE = "value"
STATEMENT_LISTS = ("body", "orelse", "finalbody")
UNCONDITIONAL = (ast.With, ast.AsyncWith)
TRIES = (ast.Try, getattr(ast, "TryStar", ast.Try))


def nested_bodies(node):
    for field in STATEMENT_LISTS:
        yield getattr(node, field, None) or []
    for part in [*getattr(node, "handlers", []), *getattr(node, "cases", [])]:
        yield part.body


def branch_statements(statements):
    pending = list(reversed(statements))
    while pending:
        statement = pending.pop()
        yield statement
        inner = [] if isinstance(statement, DEFINITIONS) else nested_bodies(statement)
        pending.extend(reversed([item for body in inner for item in body]))


def methods_of(node):
    return [
        (f"{node.name}.{item.name}", item)
        for item in branch_statements(node.body)
        if isinstance(item, FUNCTIONS)
    ]


def definitions(tree):
    found = {}
    for node in branch_statements(tree.body):
        if isinstance(node, DEFINITIONS):
            found.setdefault(node.name, node)
        methods = methods_of(node) if isinstance(node, ast.ClassDef) else []
        for name, item in methods:
            found.setdefault(name, item)
    return found


def chain_parts(node):
    parts = []
    while isinstance(node, ast.Attribute):
        parts.insert(0, node.attr)
        node = node.value
    return (node.id, parts) if isinstance(node, ast.Name) else (None, parts)


class Bindings:
    def __init__(self, context, inherited=None):
        self.context = context
        self.names = {
            name: list(targets) for name, targets in (inherited or {}).items()
        }
        self.fallbacks = set()
        self.tried = False

    def bind(self, name, target, conditional):
        current = self.names.get(name, [])
        if not conditional:
            self.names[name] = [target]
            self.fallbacks.discard(name)
        elif target not in current:
            self.names[name] = [*current, target]
        if conditional and self.tried:
            self.fallbacks.add(name)

    def visit(self, statements, conditional=False):
        pending = [(iter(statements), conditional, None)]
        while pending:
            items, inner, restore = pending[-1]
            node = next(items, None)
            if node is None:
                pending.pop()
                if restore is not None:
                    self.tried = restore
            elif not self.statement(node, inner):
                pending.extend(self.branch(node, inner))

    def statement(self, node, conditional):
        if isinstance(node, DEFINITIONS):
            self.bind(node.name, (LOCAL, node.name), conditional)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            self.imports(node, conditional)
        elif isinstance(node, (ast.Assign, ast.AnnAssign)):
            self.assign(node, conditional)
        else:
            return False
        return True

    def branch(self, node, conditional):
        inner = conditional or not isinstance(node, UNCONDITIONAL)
        tried = self.tried
        self.tried = tried or isinstance(node, TRIES)
        bodies = [(iter(body), inner, None) for body in nested_bodies(node)]
        return [(iter(()), inner, tried), *reversed(bodies)]

    def imports(self, node, conditional):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                bound = (alias.asname, alias.name) if alias.asname else (root, root)
                self.bind(bound[0], (IMPORT, bound[1]), conditional)
            return
        module = imported_module(node, self.context.project, self.context.path)
        for alias in node.names if module else []:
            if alias.name != "*":
                target = (IMPORT, f"{module}.{alias.name}")
                self.bind(alias.asname or alias.name, target, conditional)

    def assign(self, node, conditional):
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        value = node.value
        for target in targets:
            aliased = self.alias_of(value) if isinstance(target, ast.Name) else None
            for name in target_names(target):
                self.bind(name, aliased or (VALUE, None), conditional)

    def alias_of(self, value):
        root, parts = chain_parts(value) if value is not None else (None, [])
        for kind, target in self.names.get(root, []) if root else []:
            if kind != VALUE:
                return kind, ".".join([target, *parts])
        return None

    def targets(self, name):
        found = sorted(self.names.get(name, []), key=lambda item: item[0] != LOCAL)
        if name in self.fallbacks or not found or found[0][0] != LOCAL:
            return found
        return [target for target in found if target[0] != IMPORT]


def target_names(target):
    if isinstance(target, ast.Name):
        return [target.id]
    if isinstance(target, ast.Starred):
        return target_names(target.value)
    if isinstance(target, (ast.Tuple, ast.List)):
        return [name for element in target.elts for name in target_names(element)]
    return []


def module_bindings(context):
    def build(_):
        found = Bindings(context)
        found.visit(context.tree.body)
        return found

    return context.project.memo(("scope-bindings", context.path), build)


def function_bindings(context, function):
    def build(_):
        found = Bindings(context, module_bindings(context).names)
        for name in local_names(function):
            found.bind(name, (VALUE, None), False)
        found.visit(function.body)
        return found

    return context.project.memo(("scope-bindings", context.path, id(function)), build)


def enclosing_function(node, parents):
    while id(node) in parents:
        child, node = node, parents[id(node)]
        if isinstance(node, FUNCTIONS) and child in node.body:
            return node
    return None


def enclosing_owner(function, parents):
    owner = parents.get(id(function)) if function is not None else None
    return owner.name if isinstance(owner, ast.ClassDef) else None
