import os

from design.calls.references import module_references
from design.types.classes import classify, enum_cases
from design.types.fields import class_fields, module_fields
from design.types.published import is_published


def is_exported(module, name):
    return not name.startswith("_") or (
        module.exports is not None and name in module.exports
    )


def klass_exported(klass):
    if klass.owner is not None:
        return klass_exported(klass.owner) and not klass.name.startswith("_")
    return is_exported(klass.module, klass.name)


def module_type(index, module):
    stem = os.path.splitext(os.path.basename(module.path))[0]
    fact = {
        "id": module.id,
        "file": module.path,
        "name": stem,
        "line": 1,
        "kind": "module",
        "exported": True,
        "fields": module_fields(index, module),
    }
    references = module_references(index, module)
    if references:
        fact["references"] = references
    return fact


def class_type(index, klass):
    kind = classify(index, klass)
    fact = {
        "id": klass.id,
        "file": klass.module.path,
        "name": klass.name,
        "line": klass.node.lineno,
        "kind": kind,
        "exported": klass_exported(klass),
    }
    if klass.owner is None and is_published(index, klass.module, klass.name):
        fact["published"] = True
    if kind == "enum":
        fact["cases"] = enum_cases(index, klass)
    else:
        fact["fields"] = class_fields(index, klass)
    return fact


def alias_type(index, alias):
    fact = {
        "id": alias.id,
        "file": alias.module.path,
        "name": alias.name,
        "line": alias.node.lineno,
        "kind": "enum",
        "exported": is_exported(alias.module, alias.name),
        "cases": alias.cases,
    }
    if is_published(index, alias.module, alias.name):
        fact["published"] = True
    return fact


def module_types(index, module):
    types = [module_type(index, module)]
    for klass in module.classes.values():
        types.extend(class_type(index, nested) for nested in klass.all_classes())
    types.extend(alias_type(index, alias) for alias in module.literals.values())
    return sorted(types, key=lambda fact: (fact["line"], fact["id"]))
