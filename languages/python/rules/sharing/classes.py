from sharing.mutations import changed_keys
from signatures.annotations import FUNCTION_TYPES

SELF = "self"


def methods_of(cls):
    return [item for item in cls.body if isinstance(item, FUNCTION_TYPES)]


def changed_attributes(cls, kinds):
    keyed = {f"{SELF}.{name}": kind for name, kind in kinds.items()}
    found = set()
    for method in methods_of(cls):
        found.update(key.split(".", 1)[1] for key in changed_keys(method, keyed))
    return found
