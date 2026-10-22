import ast

from design.annotations import base_name, project_type
from design.astutil import own_nodes


class AttributeSite:
    def __init__(self, kind, value=None, annotation=None, function=None):
        self.kind = kind
        self.value = value
        self.annotation = annotation
        self.function = function
        self.class_variable = False


def is_dunder(name):
    return name.startswith("__") and name.endswith("__")


def class_level_sites(klass, sites):
    for statement in klass.node.body:
        if isinstance(statement, ast.AnnAssign) and isinstance(
            statement.target, ast.Name
        ):
            site = AttributeSite("annotated", statement.value, statement.annotation)
            site.class_variable = (
                base_name(unwrapped_base(statement.annotation)) == "ClassVar"
            )
            sites.setdefault(statement.target.id, []).append(site)
        elif isinstance(statement, ast.Assign):
            for target in statement.targets:
                if isinstance(target, ast.Name):
                    site = AttributeSite("assign", statement.value)
                    sites.setdefault(target.id, []).append(site)


def unwrapped_base(annotation):
    if isinstance(annotation, ast.Subscript):
        return annotation.value
    return annotation


def flat_targets(targets):
    pending = list(targets)
    for target in pending:
        if isinstance(target, (ast.Tuple, ast.List)):
            pending.extend(target.elts)
            yield target, False
        else:
            yield target, True


def instance_sites(function, first, sites):
    for node in own_nodes(function.node):
        if isinstance(node, ast.Assign):
            pairs = [(t, d, node.value) for t, d in flat_targets(node.targets)]
            kind = "assign"
        elif isinstance(node, ast.AnnAssign):
            pairs = [(node.target, True, node.value)]
            kind = "annotated"
        elif isinstance(node, ast.AugAssign):
            pairs = [(node.target, True, node.value)]
            kind = "aug"
        else:
            continue
        for target, direct, value in pairs:
            if is_self_attribute(target, first):
                site = AttributeSite(kind if direct else "other", value, None, function)
                if kind == "annotated":
                    site.annotation = node.annotation
                sites.setdefault(target.attr, []).append(site)


def is_self_attribute(target, first):
    return (
        isinstance(target, ast.Attribute)
        and isinstance(target.value, ast.Name)
        and target.value.id == first
    )


def attribute_sites(index, klass):
    if klass.id in index.attribute_site_memo:
        return index.attribute_site_memo[klass.id]
    sites = {}
    class_level_sites(klass, sites)
    for function in klass.functions:
        arguments = function.node.args
        positional = arguments.posonlyargs + arguments.args
        if function.static or not positional:
            continue
        instance_sites(function, positional[0].arg, sites)
    index.attribute_site_memo[klass.id] = sites
    return sites


def declared_type(index, klass, sites):
    annotated = [s for s in sites if s.kind == "annotated" and s.annotation is not None]
    types = {project_type(index, klass.module, s.annotation, klass) for s in annotated}
    return next(iter(types)) if len(types) == 1 else None


def inferred_type(index, klass, sites):
    from design.evaluate import type_of

    found = set()
    for site in sites:
        if (
            site.kind == "assign"
            and isinstance(site.value, ast.Constant)
            and site.value.value is None
        ):
            continue
        if site.kind == "annotated" and site.value is None:
            continue
        if site.kind not in ("assign", "annotated"):
            return None
        scope = (
            index.scope_of(site.function)
            if site.function
            else index.module_scope(klass.module)
        )
        found.add(type_of(scope, site.value) if site.value is not None else None)
    return next(iter(found)) if len(found) == 1 else None


def attribute_type(index, klass, name):
    key = (klass.id, name)
    if key in index.attribute_type_memo:
        return index.attribute_type_memo[key]
    index.attribute_type_memo[key] = None
    sites = attribute_sites(index, klass).get(name, [])
    if any(s.kind == "annotated" and s.annotation is not None for s in sites):
        found = declared_type(index, klass, sites)
    else:
        found = inferred_type(index, klass, sites)
    index.attribute_type_memo[key] = found
    return found
