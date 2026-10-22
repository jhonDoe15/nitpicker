import ast

DEFINITION_TYPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
FUNCTION_TYPES = (ast.FunctionDef, ast.AsyncFunctionDef)
SCOPE_TYPES = DEFINITION_TYPES + (ast.Lambda,)
MAX_REEXPORT_DEPTH = 10


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


def scope_imports(body):
    for statement in body:
        if isinstance(statement, (ast.Import, ast.ImportFrom)):
            yield statement
        elif not isinstance(statement, SCOPE_TYPES):
            children = ast.iter_child_nodes(statement)
            yield from scope_imports([child for child in children if isinstance(child, ast.stmt)])


class ProjectIndex:
    def __init__(self, project):
        self.project = project
        self.trees = {path: context.tree for path, context in project.contexts.items()}
        self.parents = {path: context.parents for path, context in project.contexts.items()}
        self.tests = project.test_files
        declared = project.options.get("modules", {})
        self.modules = {
            path: declared.get(path) or project.module_name(path) for path in self.trees
        }
        self.paths = {}
        for path in sorted(self.trees, key=lambda path: path in self.tests):
            self.paths.setdefault(self.modules[path], path)
        self.definitions = {path: module_definitions(tree) for path, tree in self.trees.items()}
        self.bindings = {
            path: self.bindings_of(path, tree.body) for path, tree in self.trees.items()
        }
        self.local = {}

    def production_trees(self):
        return [(path, tree) for path, tree in self.trees.items() if path not in self.tests]

    def import_base(self, path, node):
        if node.level == 0:
            return node.module
        return self.project.relative_module(path, node.level, node.module, existing=False)

    def bindings_of(self, path, body):
        bindings = {}
        for node in scope_imports(body):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    local = alias.asname or alias.name.split(".")[0]
                    bindings[local] = ("module", alias.name if alias.asname else local)
                continue
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

    def enclosing_functions(self, path, node):
        parents = self.parents.get(path, {})
        current = parents.get(id(node))
        while current is not None:
            if isinstance(current, FUNCTION_TYPES):
                yield current
            current = parents.get(id(current))

    def binding(self, path, node, name):
        for function in self.enclosing_functions(path, node):
            key = (path, id(function))
            if key not in self.local:
                self.local[key] = self.bindings_of(path, function.body)
            if name in self.local[key]:
                return self.local[key][name]
        return self.bindings[path].get(name)

    def resolve(self, path, node):
        chain = attribute_chain(node)
        if chain is None:
            return None
        head, rest = chain[0], chain[1:]
        binding = self.binding(path, node, head)
        if binding is None:
            found = self.definitions[path].get(head)
            return (path, head, found) if found and not rest else None
        if binding[0] == "name":
            return None if rest else self.definition(binding[1], binding[2])
        return self.module_member(binding[1].split(".") + rest)

    def star_imported(self, path):
        modules = []
        for node in scope_imports(self.trees[path].body):
            if isinstance(node, ast.ImportFrom) and any(a.name == "*" for a in node.names):
                base = self.import_base(path, node)
                if base is not None:
                    modules.append(base)
        return modules
