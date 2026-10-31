import ast

from checks.common import dotted_name
from design.calls.calls import canonical_root
from design.resolve.evaluate import evaluate
from design.resolve.symbols import Klass
from design.support.astutil import all_nodes, body_nodes, own_nodes
from design.support.attributes import attribute_sites, is_dunder
from design.types.classes import classify, field_names
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


def is_typing_construct(module, value):
    called = isinstance(value, ast.Call)
    name = dotted_name(value.func, module.aliases) if called else None
    return bool(name) and name.rsplit(".", 1)[-1] in TYPING_CONSTRUCTS


def is_declaration(variable, value):
    module, name = variable.module, variable.name
    annotation = getattr(variable.statements[0], "annotation", None)
    alias = annotation is not None and "TypeAlias" in ast.dump(annotation)
    named = is_dunder(name) or name in module.literals
    return named or alias or is_typing_construct(module, value)


def is_state(index, variable):
    value = getattr(variable.statements[0], "value", None)
    if is_declaration(variable, value):
        return False
    scope = index.module_scope(variable.module)
    resolved = evaluate(scope, value) if value is not None else None
    return not (resolved is not None and resolved[0] == "cls")


def module_field_names(index, module):
    return [
        name for name, variable in module.variables.items() if is_state(index, variable)
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


def used_field(scope, node, names):
    if scope.owner is not None:
        member = is_member(node, scope.self_name) and node.attr in names
        return node.attr if member else None
    state = isinstance(node, ast.Name) and module_state(scope, node.id, names)
    return node.id if state else None


def own_fields(scope, names):
    ordered = sorted(all_nodes(scope.function.node), key=position_key)
    used = [used_field(scope, node, names) for node in ordered]
    return list(dict.fromkeys(name for name in used if name is not None))


def declared_globals(scope):
    if not hasattr(scope, "declared_globals"):
        scope.declared_globals = {
            name
            for node in body_nodes(scope.function.node)
            if isinstance(node, ast.Global)
            for name in node.names
        }
    return scope.declared_globals


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
    leaves = [
        leaf
        for node in sorted(returns, key=position_key)
        for leaf in leaf_values(node.value)
    ]
    found = (field_of(scope, leaf, names) for leaf in leaves)
    return next((name for name in found if name is not None), None)


def module_state(scope, name, names):
    if name not in names:
        return False
    return name not in scope.sites or name in declared_globals(scope)


def module_field_of(scope, node, names):
    if not isinstance(node, ast.Name):
        return None
    if module_state(scope, node.id, names):
        return node.id
    sites = scope.sites.get(node.id, [])
    alias = sites[0].value if len(sites) == 1 and sites[0].kind == "assign" else None
    if isinstance(alias, ast.Name) and module_state(scope, alias.id, names):
        return alias.id
    return None


def field_of(scope, node, names):
    if scope.owner is not None:
        return owner_field_of(scope, node, names)
    return module_field_of(scope, node, names)
