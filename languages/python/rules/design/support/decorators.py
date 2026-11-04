import ast

from checks.common import dotted_name

STDLIB_NEUTRAL = {
    "functools": {
        "cache",
        "lru_cache",
        "cached_property",
        "wraps",
        "total_ordering",
        "singledispatch",
        "singledispatchmethod",
    },
    "abc": {
        "abstractmethod",
        "abstractclassmethod",
        "abstractstaticmethod",
        "abstractproperty",
    },
    "typing": {"final", "override", "overload", "no_type_check", "runtime_checkable"},
    "typing_extensions": {
        "final",
        "override",
        "overload",
        "runtime_checkable",
        "deprecated",
    },
    "contextlib": {"contextmanager", "asynccontextmanager"},
    "warnings": {"deprecated"},
}
NEUTRAL = {"staticmethod", "classmethod", "property"} | {
    f"{module}.{name}" for module, names in STDLIB_NEUTRAL.items() for name in names
}
PROPERTY_NAMES = {"property", "functools.cached_property", "abc.abstractproperty"}
ACCESSOR_SUFFIXES = (".setter", ".getter", ".deleter")
OVERLOADS = {"typing.overload", "typing_extensions.overload"}
ABSTRACT = {
    "abc.abstractmethod",
    "abc.abstractclassmethod",
    "abc.abstractstaticmethod",
    "abc.abstractproperty",
}
DATACLASS_DECORATORS = {
    "dataclasses.dataclass",
    "pydantic.dataclasses.dataclass",
    "attr.s",
    "attr.attrs",
    "attr.define",
    "attr.frozen",
    "attr.mutable",
    "attrs.define",
    "attrs.frozen",
    "attrs.mutable",
}
VALIDATORS = {
    "pydantic.validator",
    "pydantic.field_validator",
    "pydantic.model_validator",
    "pydantic.root_validator",
    "pydantic.computed_field",
    "pydantic.field_serializer",
    "pydantic.model_serializer",
}


def decorator_names(node, aliases):
    names = []
    for decorator in node.decorator_list:
        target = decorator.func if isinstance(decorator, ast.Call) else decorator
        names.append(dotted_name(target, aliases) or "")
    return names


def is_neutral(name):
    return name in NEUTRAL or name.endswith(ACCESSOR_SUFFIXES)


def has_only_neutral(names):
    return all(is_neutral(name) for name in names)
