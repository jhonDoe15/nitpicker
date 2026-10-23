import ast

from checks.common import dotted_name
from design.resolve.lookup import base_entries, external_bases
from design.resolve.symbols import Klass
from design.support.attributes import attribute_sites, is_dunder
from design.support.decorators import DATACLASS_DECORATORS, VALIDATORS, decorator_names

ENUM_BASES = {"enum.Enum", "enum.IntEnum", "enum.StrEnum", "enum.Flag", "enum.IntFlag"}
INTERFACE_BASES = {"typing.Protocol", "typing_extensions.Protocol", "abc.ABC"}
NEUTRAL_DUNDERS = {
    "__init__",
    "__post_init__",
    "__repr__",
    "__str__",
    "__eq__",
    "__ne__",
    "__hash__",
    "__lt__",
    "__le__",
    "__gt__",
    "__ge__",
    "__format__",
    "__bytes__",
    "__copy__",
    "__deepcopy__",
    "__getstate__",
    "__setstate__",
    "__reduce__",
    "__reduce_ex__",
    "__init_subclass__",
    "__class_getitem__",
    "__set_name__",
}


def is_enum(index, klass):
    return any(name in ENUM_BASES for name in external_bases(index, klass))


def enum_cases(index, klass):
    if klass.id in index.case_memo:
        return index.case_memo[klass.id]
    cases = None
    if is_enum(index, klass):
        cases = [name for name in member_names(klass) if is_member_name(name)]
    index.case_memo[klass.id] = cases
    return cases


def is_member_name(name):
    return not name.startswith("__") and not (
        name.startswith("_") and name.endswith("_")
    )


def member_names(klass):
    names = []
    for statement in klass.node.body:
        if isinstance(statement, ast.Assign):
            names += [t.id for t in statement.targets if isinstance(t, ast.Name)]
        elif isinstance(statement, ast.AnnAssign) and statement.value is not None:
            if isinstance(statement.target, ast.Name):
                names.append(statement.target.id)
    return [n for n in dict.fromkeys(names)]


def has_abc_metaclass(klass):
    for keyword in klass.node.keywords:
        name = dotted_name(keyword.value, klass.module.aliases) or ""
        if keyword.arg == "metaclass" and name in {"abc.ABCMeta", "ABCMeta"}:
            return True
    return False


def is_interface(index, klass):
    direct = [e for e in base_entries(index, klass) if not isinstance(e, Klass)]
    return (
        any(name in INTERFACE_BASES for name in direct)
        or has_abc_metaclass(klass)
        or any(function.is_abstract for function in klass.functions)
    )


def is_behaviour(function):
    if function.is_property or function.is_accessor_pair:
        return False
    if is_dunder(function.name):
        return function.name not in NEUTRAL_DUNDERS
    return not any(name in VALIDATORS for name in function.decorators)


def classify(index, klass):
    if klass.id in index.kind_memo:
        return index.kind_memo[klass.id]
    if enum_cases(index, klass) is not None:
        kind = "enum"
    elif is_interface(index, klass):
        kind = "interface"
    elif any(is_behaviour(f) for f in klass.functions):
        kind = "class"
    else:
        kind = "data"
    index.kind_memo[klass.id] = kind
    return kind


def is_dataclass(klass):
    return any(
        name in DATACLASS_DECORATORS
        for name in decorator_names(klass.node, klass.module.aliases)
    )


def kind_of(index, typedef):
    from design.resolve.symbols import LiteralAlias

    return "enum" if isinstance(typedef, LiteralAlias) else classify(index, typedef)


def field_names(index, klass):
    names = []
    for name, sites in attribute_sites(index, klass).items():
        if is_dunder(name) or all(getattr(s, "class_variable", False) for s in sites):
            continue
        names.append(name)
    return names
