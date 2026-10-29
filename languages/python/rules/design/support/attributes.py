import ast
from collections import namedtuple

from design.resolve.annotations import Place, project_type
from design.support.astutil import body_nodes

AttributeSite = namedtuple(
    "AttributeSite", "kind value annotation function", defaults=(None, None, None)
)


def is_dunder(name):
    return name.startswith("__") and name.endswith("__")


def class_statement_sites(statement):
    if isinstance(statement, ast.AnnAssign) and isinstance(statement.target, ast.Name):
        site = AttributeSite("annotated", statement.value, statement.annotation)
        return [(statement.target.id, site)]
    if not isinstance(statement, ast.Assign):
        return []
    site = AttributeSite("assign", statement.value)
    return [(t.id, site) for t in statement.targets if isinstance(t, ast.Name)]


def class_level_sites(klass, sites):
    for statement in klass.node.body:
        for name, site in class_statement_sites(statement):
            sites.setdefault(name, []).append(site)


def flat_targets(targets):
    pending = list(targets)
    for target in pending:
        if isinstance(target, (ast.Tuple, ast.List)):
            pending.extend(target.elts)
            yield target, False
        else:
            yield target, True


ASSIGNMENT_KINDS = {
    ast.Assign: "assign",
    ast.AnnAssign: "annotated",
    ast.AugAssign: "aug",
}


def assignment_targets(node):
    if isinstance(node, ast.Assign):
        return list(flat_targets(node.targets))
    return [(node.target, True)]


def node_sites(node, function):
    kind = ASSIGNMENT_KINDS.get(type(node))
    if kind is None:
        return []
    annotation = node.annotation if kind == "annotated" else None
    return [
        (
            target,
            AttributeSite(
                kind if direct else "other", node.value, annotation, function
            ),
        )
        for target, direct in assignment_targets(node)
    ]


def instance_sites(function, first, sites):
    found = [
        pair
        for node in body_nodes(function.node)
        for pair in node_sites(node, function)
    ]
    for target, site in found:
        if is_self_attribute(target, first):
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
    place = Place(index, klass.module, klass)
    types = {project_type(place, s.annotation) for s in annotated}
    return next(iter(types)) if len(types) == 1 else None


def inferred_type(index, klass, sites):
    from design.resolve.evaluate import type_of

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
