from design.resolve.imports import bind_imports
from design.resolve.lookup import find_member
from design.resolve.symbols import build_module
from design.support.attributes import attribute_sites, attribute_type
from design.support.scope import Scope


class Index:
    def __init__(self, project, contexts):
        self.project = project
        self.claims = {}
        self.modules = {}
        self.base_memo = {}
        self.linear_memo = {}
        self.case_memo = {}
        self.kind_memo = {}
        self.attribute_site_memo = {}
        self.attribute_type_memo = {}
        self.variable_memo = {}
        self.scopes = {}
        self.callbacks = set()
        self.entry_files = set()
        self.distributions = []
        self.prefixes = set()
        for context in contexts:
            self.modules[context.path] = build_module(context, self.claim)
        for module in self.modules.values():
            bind_imports(self, module)
            self.add_prefixes(module.path)

    def claim(self, base):
        count = self.claims.get(base, 0) + 1
        self.claims[base] = count
        return base if count == 1 else f"{base}@{count}"

    def add_prefixes(self, path):
        parts = self.project.module_name(path).split(".")
        for size in range(1, len(parts)):
            self.prefixes.add(".".join(parts[:size]))

    def has_prefix(self, dotted):
        return dotted in self.prefixes

    def classes(self):
        for module in self.modules.values():
            for klass in module.classes.values():
                yield from klass.all_classes()

    def scope_of(self, function):
        if function.id not in self.scopes:
            self.scopes[function.id] = Scope(self, function.module, function)
        return self.scopes[function.id]

    def module_scope(self, module):
        key = ("module", module.path)
        if key not in self.scopes:
            self.scopes[key] = Scope(self, module)
        return self.scopes[key]

    def declares(self, klass, name):
        return name in attribute_sites(self, klass)

    def attribute_type(self, klass, name):
        return attribute_type(self, klass, name)

    def attribute_type_via(self, klass, name):
        found = find_member(self, klass, name)
        if found is None or found[0] is not None:
            return None
        return self.attribute_type(found[1], name)

    def variable_type(self, variable):
        key = (variable.module.path, variable.name)
        if key in self.variable_memo:
            return self.variable_memo[key]
        self.variable_memo[key] = None
        found = None
        if (
            variable.name not in variable.module.rebound
            and len(variable.statements) == 1
        ):
            found = self.statement_type(variable)
        self.variable_memo[key] = found
        return found

    def statement_type(self, variable):
        from design.resolve.annotations import project_type
        from design.resolve.evaluate import type_of

        statement = variable.statements[0]
        if getattr(statement, "annotation", None) is not None:
            return project_type(self, variable.module, statement.annotation)
        value = getattr(statement, "value", None)
        if value is None:
            return None
        return type_of(self.module_scope(variable.module), value)
