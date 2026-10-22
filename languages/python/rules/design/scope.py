import ast

from design.annotations import project_type
from design.astutil import own_nodes
from design.imports import bind_from, bind_import
from design.sites import collect_sites, parameters, skips_first

UNKNOWN = object()
NEUTRAL = object()


class LocalImports:
    def __init__(self, path):
        self.path = path
        self.imports = {}
        self.stars = []
        self.counts = {}

    def count(self, name):
        self.counts[name] = self.counts.get(name, 0) + 1


def local_imports(index, function):
    holder = LocalImports(function.module.path)
    for node in own_nodes(function.node):
        if isinstance(node, ast.ImportFrom):
            bind_from(index, holder, node)
        elif isinstance(node, ast.Import):
            bind_import(index, holder, node)
    return holder.imports


def is_generator(function):
    if not hasattr(function, "generator"):
        function.generator = any(
            isinstance(node, (ast.Yield, ast.YieldFrom))
            for node in own_nodes(function.node)
        )
    return function.generator


class Scope:
    def __init__(self, index, module, function=None):
        self.index = index
        self.module = module
        self.function = function
        self.owner = function.owner if function else None
        self.params = parameters(function) if function else []
        self.sites = collect_sites(function, self.params) if function else {}
        self.imports = local_imports(index, function) if function else {}
        self.self_name = None
        self.types = {}
        self.busy = set()
        self.values = {}
        if function and self.owner is not None and skips_first(function):
            arguments = function.node.args
            first = (arguments.posonlyargs + arguments.args)[:1]
            self.self_name = first[0].arg if first else None

    def site_type(self, site):
        if site.kind in ("param", "annotated"):
            if site.annotation is None:
                return UNKNOWN
            found = project_type(self.index, self.module, site.annotation, self.owner)
            return found if found is not None else UNKNOWN
        if site.kind == "with":
            from design.evaluate import with_value_type

            found = with_value_type(self, site)
            return found if found is not None else UNKNOWN
        if site.kind == "assign":
            if isinstance(site.value, ast.Constant) and site.value.value is None:
                return NEUTRAL
            from design.evaluate import type_of

            found = type_of(self, site.value)
            return found if found is not None else UNKNOWN
        return UNKNOWN

    def local_type(self, name):
        if name in self.types:
            return self.types[name]
        if name in self.busy:
            return None
        self.busy.add(name)
        found = {self.site_type(site) for site in self.sites[name]} - {NEUTRAL}
        self.busy.discard(name)
        result = next(iter(found)) if len(found) == 1 and UNKNOWN not in found else None
        self.types[name] = result
        return result

    def is_bound(self, name):
        return name in self.sites

    def is_single(self, name):
        return len(self.sites.get(name, [])) == 1
