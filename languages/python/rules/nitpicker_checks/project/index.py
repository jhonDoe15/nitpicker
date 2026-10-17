import ast

DEFINITION_TYPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
MAX_REEXPORT_DEPTH = 10
PACKAGE_FILE = "__init__.py"


def parent_module(module):
    return module.rsplit(".", 1)[0] if "." in module else ""


def module_definitions(tree):
    definitions = {}
    for statement in tree.body:
        if isinstance(statement, DEFINITION_TYPES):
            definitions.setdefault(statement.name, []).append(statement)
    return definitions


def attribute_chain(node):
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if not isinstance(node, ast.Name):
        return None
    parts.append(node.id)
    return list(reversed(parts))


class ProjectIndex:
    def __init__(self, trees, modules, tests=frozenset()):
        self.trees = trees
        self.tests = tests
        self.modules = {path: module for path, module in modules.items() if path in trees}
        self.paths = {module: path for path, module in self.modules.items()}
        self.definitions = {path: module_definitions(tree) for path, tree in trees.items()}
        self.bindings = {path: self.bindings_of(path, tree) for path, tree in trees.items()}

    def relative_base(self, path, level, module):
        owner = self.modules.get(path)
        if owner is None:
            return None
        if not path.endswith(PACKAGE_FILE):
            owner = parent_module(owner)
        parts = owner.split(".") if owner else []
        if level - 1 > len(parts):
            return None
        base = parts[: len(parts) - (level - 1)] + (module.split(".") if module else [])
        return ".".join(base)

    def import_base(self, path, node):
        if node.level == 0:
            return node.module
        return self.relative_base(path, node.level, node.module)

    def bindings_of(self, path, tree):
        bindings = {}
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    local = alias.asname or alias.name.split(".")[0]
                    bindings[local] = ("module", alias.name if alias.asname else local)
            elif isinstance(node, ast.ImportFrom):
                base = self.import_base(path, node)
                for alias in node.names:
                    if base is not None and alias.name != "*":
                        bindings[alias.asname or alias.name] = self.imported(base, alias.name)
        return bindings

    def imported(self, base, name):
        qualified = f"{base}.{name}" if base else name
        return ("module", qualified) if qualified in self.paths else ("name", base, name)

    def definition(self, module, name, depth=0):
        path = self.paths.get(module)
        if path is None or depth > MAX_REEXPORT_DEPTH:
            return None
        found = self.definitions[path].get(name)
        if found:
            return path, name, found
        binding = self.bindings[path].get(name)
        if binding is None or binding[0] != "name":
            return None
        return self.definition(binding[1], binding[2], depth + 1)

    def module_member(self, chain):
        module = ".".join(chain[:-1])
        return self.definition(module, chain[-1]) if len(chain) > 1 else None

    def resolve(self, path, node):
        chain = attribute_chain(node)
        if chain is None:
            return None
        head, rest = chain[0], chain[1:]
        if not rest and head in self.definitions[path]:
            return path, head, self.definitions[path][head]
        binding = self.bindings[path].get(head)
        if binding is None:
            return None
        if binding[0] == "name":
            if rest:
                return None
            return self.definition(binding[1], binding[2])
        return self.module_member(binding[1].split(".") + rest)

    def star_imported(self, path):
        modules = []
        for node in ast.walk(self.trees[path]):
            if isinstance(node, ast.ImportFrom) and any(a.name == "*" for a in node.names):
                base = self.import_base(path, node)
                if base is not None:
                    modules.append(base)
        return modules
