import ast

from checks.common import dotted_name
from design.astutil import all_nodes, own_nodes
from design.attributes import attribute_sites, is_dunder
from design.calls import canonical_root
from design.classes import classify, field_names
from design.evaluate import evaluate
from design.symbols import Klass
from index.tables import MUTABLE_CONSTRUCTORS, is_mutable_value

FACTORY_FIELDS = {
    "dataclasses.field",
    "pydantic.Field",
    "attr.ib",
    "attr.field",
    "attrs.field",
}
TYPING_CONSTRUCTS = {"TypeVar", "NewType", "ParamSpec", "TypeVarTuple", "TypeAlias"}


def creates_mutable(value, aliases):
    if value is None:
        return False
    if is_mutable_value(value, aliases):
        return True
    if (
        not isinstance(value, ast.Call)
        or dotted_name(value.func, aliases) not in FACTORY_FIELDS
    ):
        return False
    for keyword in value.keywords:
        if keyword.arg == "default_factory":
            return factory_is_mutable(keyword.value, aliases)
    return False


def factory_is_mutable(factory, aliases):
    if isinstance(factory, ast.Lambda):
        return is_mutable_value(factory.body, aliases)
    return (dotted_name(factory, aliases) or "") in MUTABLE_CONSTRUCTORS


def sites_are_mutable(sites, aliases):
    created = False
    for site in sites:
        if site.kind == "aug" or (site.kind == "annotated" and site.value is None):
            continue
        if site.kind in ("assign", "annotated") and creates_mutable(
            site.value, aliases
        ):
            created = True
            continue
        return False
    return created


def field_fact(name, mutable):
    fact = {"name": name}
    if mutable:
        fact["mutable"] = True
    return fact


def type_field_names(index, klass):
    return [] if classify(index, klass) == "enum" else field_names(index, klass)


def class_fields(index, klass):
    sites = attribute_sites(index, klass)
    facts = []
    for name in type_field_names(index, klass):
        fact = field_fact(name, sites_are_mutable(sites[name], klass.module.aliases))
        if name.startswith("_"):
            fact["private"] = True
        facts.append(fact)
    return facts


def is_state(index, module, name, variable):
    statement = variable.statements[0]
    value = getattr(statement, "value", None)
    if is_dunder(name) or name in module.literals:
        return False
    annotation = getattr(statement, "annotation", None)
    if annotation is not None and "TypeAlias" in ast.dump(annotation):
        return False
    if isinstance(value, ast.Call) and dotted_name(value.func, module.aliases):
        if (
            dotted_name(value.func, module.aliases).rsplit(".", 1)[-1]
            in TYPING_CONSTRUCTS
        ):
            return False
    scope = index.module_scope(module)
    resolved = evaluate(scope, value) if value is not None else None
    return not (resolved is not None and resolved[0] == "cls")


def module_field_names(index, module):
    return [
        name
        for name, variable in module.variables.items()
        if is_state(index, module, name, variable)
    ]


def module_fields(index, module):
    facts = []
    for name in module_field_names(index, module):
        variable = module.variables[name]
        creations = [
            creates_mutable(getattr(s, "value", None), module.aliases)
            for s in variable.statements
        ]
        mutable = all(creations) and name not in module.rebound
        fact = field_fact(name, mutable)
        hidden = module.exports is not None and name not in module.exports
        if name.startswith("_") or hidden:
            fact["private"] = True
        facts.append(fact)
    return facts


def owner_field_names(index, function):
    owner = function.owner
    if owner is None:
        return set(module_field_names(index, function.module))
    return set(type_field_names(index, owner)) if isinstance(owner, Klass) else set()


def own_fields(scope, names):
    found = {}
    if scope.owner is not None:
        first = scope.self_name
        for node in sorted(all_nodes(scope.function.node), key=position_key):
            if is_member(node, first) and node.attr in names:
                found.setdefault(node.attr, None)
        return list(found)
    declared = declared_globals(scope)
    for node in sorted(all_nodes(scope.function.node), key=position_key):
        if isinstance(node, ast.Name) and node.id in names:
            if node.id not in scope.sites or node.id in declared:
                found.setdefault(node.id, None)
    return list(found)


def declared_globals(scope):
    return {
        name
        for node in own_nodes(scope.function.node)
        if isinstance(node, ast.Global)
        for name in node.names
    }


def position_key(node):
    return (getattr(node, "lineno", 0), getattr(node, "col_offset", 0))


def is_member(node, first):
    return (
        first is not None
        and isinstance(node, ast.Attribute)
        and isinstance(node.value, ast.Name)
        and node.value.id == first
    )


def owner_field_of(scope, node, names):
    if isinstance(node, ast.Name):
        root, attributes = canonical_root(scope, node.id, [])
        if root == scope.self_name and len(attributes) == 1 and attributes[0] in names:
            return attributes[0]
        return None
    if is_member(node, scope.self_name) and node.attr in names:
        return node.attr
    return None


def leaf_values(node):
    pending, leaves = [node], []
    for current in pending:
        if isinstance(current, ast.IfExp):
            pending.extend([current.body, current.orelse])
        elif isinstance(current, ast.BoolOp):
            pending.extend(current.values)
        else:
            leaves.append(current)
    return leaves


def returned_field(scope, names):
    returns = [
        n
        for n in own_nodes(scope.function.node)
        if isinstance(n, ast.Return) and n.value
    ]
    for node in sorted(returns, key=position_key):
        for leaf in leaf_values(node.value):
            name = field_of(scope, leaf, names)
            if name is not None:
                return name
    return None


def field_of(scope, node, names):
    if scope.owner is not None:
        return owner_field_of(scope, node, names)
    if isinstance(node, ast.Name) and node.id in names and node.id not in scope.sites:
        return node.id
    return None
