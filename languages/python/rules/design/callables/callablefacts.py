from design.callables.entries import is_entry
from design.callables.uses import forward_fact, param_uses
from design.calls.callfacts import call_facts
from design.calls.references import callable_references
from design.decisions.decisions import decisions
from design.decisions.reads import reads
from design.resolve.annotations import project_type, type_text
from design.types.fields import own_fields, owner_field_names, returned_field
from design.types.published import is_published
from design.types.typefacts import is_exported, klass_exported


def type_reference(scope, annotation):
    found = project_type(scope, annotation)
    if found is not None:
        return found.id
    return type_text(scope.index, scope.module, annotation)


def param_fact(scope, parameter):
    fact = {"name": parameter.name}
    if parameter.annotation is not None:
        fact["type"] = type_reference(scope, parameter.annotation)
    if parameter.variadic:
        fact["variadic"] = True
    if parameter.optional:
        fact["optional"] = True
    return fact


def callable_kind(function):
    if function.owner is None:
        return "function"
    if function.name == "__init__":
        return "constructor"
    return "accessor" if function.is_property else "method"


def callable_exported(function):
    if function.owner is None:
        return is_exported(function.module, function.name)
    private = function.name.startswith("_") and not (
        function.name.startswith("__") and function.name.endswith("__")
    )
    return klass_exported(function.owner) and not private


def bare_fact(function):
    return {
        "id": function.id,
        "file": function.module.path,
        "name": function.name,
        "line": function.node.lineno,
        "kind": callable_kind(function),
        "exported": callable_exported(function),
        "owner": function.owner.id if function.owner else function.module.id,
        "params": [],
        "calls": [],
    }


def callable_fact(index, function):
    scope = index.scope_of(function)
    fact = bare_fact(function)
    if is_entry(index, function):
        fact["entry"] = True
    if function.owner is None and is_published(index, function):
        fact["published"] = True
    fact["params"] = [param_fact(scope, p) for p in scope.params]
    if function.node.returns is not None:
        fact["returns"] = type_reference(scope, function.node.returns)
    forward = forward_fact(scope)
    if forward is not None:
        fact["forward"] = forward
    fact["calls"] = call_facts(scope)
    add_optional(fact, scope, function)
    return fact


def add_optional(fact, scope, function):
    names = owner_field_names(scope.index, function)
    uses = param_uses(scope)
    if uses:
        fact["paramUses"] = dedupe_forwards(uses)
    owned = own_fields(scope, names)
    if owned:
        fact["ownFields"] = owned
    returned = returned_field(scope, names)
    if returned is not None:
        fact["returnsField"] = returned
    for key, build in (
        ("references", callable_references),
        ("decisions", decisions),
        ("reads", reads),
    ):
        found = build(scope)
        if found:
            fact[key] = found


def unique(items):
    return [item for at, item in enumerate(items) if item not in items[:at]]


def dedupe_forwards(uses):
    for use in uses:
        use["forwards"] = unique(use["forwards"])
    return uses
