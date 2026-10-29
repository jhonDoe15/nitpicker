from pathlib import PurePosixPath

from design.calls.references import module_references
from design.resolve.lookup import base_entries
from design.resolve.symbols import Klass
from design.types.classes import classify, enum_cases
from design.types.fields import class_fields, module_fields
from design.types.published import is_published, public_name


def is_exported(module, name):
    return public_name(module, name)


def klass_exported(klass):
    if klass.owner is not None:
        return klass_exported(klass.owner) and not klass.name.startswith("_")
    return is_exported(klass.module, klass.name)


def supertype_ids(index, klass):
    bases = base_entries(index, klass)
    ids = [base.id for base in bases if isinstance(base, Klass) and base is not klass]
    return list(dict.fromkeys(ids))


def module_type(index, module):
    stem = PurePosixPath(module.path).stem
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
    supertypes = supertype_ids(index, klass)
    if supertypes:
        fact["supertypes"] = supertypes
    if klass.owner is None and is_published(index, klass):
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
    if is_published(index, alias):
        fact["published"] = True
    return fact


def module_types(index, module):
    types = [module_type(index, module)]
    for klass in module.classes.values():
        types.extend(class_type(index, nested) for nested in klass.all_classes())
    types.extend(alias_type(index, alias) for alias in module.literals.values())
    return sorted(types, key=lambda fact: (fact["line"], fact["id"]))
