import ast

from checks.common import dotted_name
from design.resolve.imports import module_in, resolve_binding
from design.resolve.symbols import Klass, ModuleRef, PrefixRef

TRANSPARENT_BASES = {
    "object",
    "abc.ABC",
    "typing.Protocol",
    "typing_extensions.Protocol",
    "typing.Generic",
    "typing.NamedTuple",
    "typing.TypedDict",
    "typing_extensions.TypedDict",
    "enum.Enum",
    "enum.IntEnum",
    "enum.StrEnum",
    "enum.Flag",
    "enum.IntFlag",
    "Exception",
    "BaseException",
}
TABLES = ("classes", "functions", "literals", "variables")


def is_public(name):
    return not name.startswith("_")


def lookup(index, module, name):
    return lookup_seen(index, (module, name), set())


def lookup_seen(index, wanted, seen):
    module, name = wanted
    key = (module.path, name)
    if key in seen:
        return None
    seen.add(key)
    if module.counts.get(name, 0) > 1:
        return None
    for table in TABLES:
        found = getattr(module, table).get(name)
        if found is not None:
            return found
    binding = module.imports.get(name)
    if binding is not None:
        return resolve_binding(index, binding, seen)
    return from_stars(index, wanted, seen)


def from_stars(index, wanted, seen):
    module, name = wanted
    if not is_public(name):
        return None
    found = []
    for path in module.stars:
        target = index.modules[path]
        exported = target.exports is None or name in target.exports
        entity = lookup_seen(index, (target, name), seen) if exported else None
        if entity is not None and entity not in found:
            found.append(entity)
    return found[0] if len(found) == 1 else None


def package_submodule(index, path, name):
    if not path.endswith("__init__.py"):
        return None
    found = module_in(index, [*path.split("/")[:-1], name])
    return ModuleRef(found) if found is not None else None


def attribute_of(index, entity, name):
    if isinstance(entity, ModuleRef):
        module = index.modules[entity.path]
        return lookup(index, module, name) or package_submodule(
            index, entity.path, name
        )
    if isinstance(entity, PrefixRef):
        dotted = f"{entity.dotted}.{name}"
        path = index.module_path(dotted)
        if path in index.modules:
            return ModuleRef(path)
        return PrefixRef(dotted) if index.has_prefix(dotted) else None
    if isinstance(entity, Klass):
        return entity.nested.get(name) or entity.members.get(name)
    return None


def entity_of(index, module, node):
    if isinstance(node, ast.Subscript):
        return entity_of(index, module, node.value)
    if isinstance(node, ast.Name):
        return lookup(index, module, node.id)
    if isinstance(node, ast.Attribute):
        base = entity_of(index, module, node.value)
        return attribute_of(index, base, node.attr) if base is not None else None
    return None


def base_entries(index, klass):
    if klass.id in index.base_memo:
        return index.base_memo[klass.id]
    entries = []
    for base in klass.node.bases:
        entity = entity_of(index, klass.module, base)
        if isinstance(entity, Klass):
            entries.append(entity)
            continue
        target = base.value if isinstance(base, ast.Subscript) else base
        entries.append(dotted_name(target, klass.module.aliases) or "?")
    index.base_memo[klass.id] = entries
    return entries


def linear(index, klass):
    if klass.id in index.linear_memo:
        return index.linear_memo[klass.id]
    order, seen, stack = [], set(), [klass]
    while stack:
        entry = stack.pop()
        if not isinstance(entry, Klass):
            order.append(entry)
        elif entry.id not in seen:
            seen.add(entry.id)
            order.append(entry)
            stack.extend(reversed(base_entries(index, entry)))
    index.linear_memo[klass.id] = order
    return order


def external_bases(index, klass):
    return [entry for entry in linear(index, klass) if not isinstance(entry, Klass)]


def member_in(index, entry, name):
    if name in entry.members:
        return entry.members[name], entry
    return (None, entry) if index.declares(entry, name) else None


def find_member(index, klass, name):
    for entry in linear(index, klass):
        if not isinstance(entry, Klass) and entry not in TRANSPARENT_BASES:
            return None
        found = member_in(index, entry, name) if isinstance(entry, Klass) else None
        if found is not None:
            return found
    return None
