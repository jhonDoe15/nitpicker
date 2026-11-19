import ast
from collections import namedtuple

from overrides.hierarchy import ancestry, own_methods
from overrides.members import (
    calls_base,
    decorator_names,
    is_overridable,
    is_trivial,
    receiver_names,
)
from overrides.seeds import library_members, project_hooks

Override = namedtuple("Override", "cls context method calls anchors hook seed")
Anchor = namedtuple("Anchor", "key label inert")


def is_inert_base(method):
    return is_trivial(method) or "abstractmethod" in decorator_names(method)


def anchors_of(name, definer, libraries):
    found = []
    if definer is not None:
        cls, method = definer
        found.append(Anchor(("project", id(cls)), cls.name, is_inert_base(method)))
    for dotted in libraries:
        found.append(Anchor(("library", dotted), dotted.rsplit(".", 1)[-1], False))
    return found


def nearest_definer(name, ancestors):
    for cls, _ in ancestors:
        method = own_methods(cls).get(name)
        if method is not None:
            return cls, method
    return None


def override_of(cls, context, name, method, ancestry_facts):
    ancestors, libraries, receivers = ancestry_facts
    seed = library_members(libraries).get(name)
    extras = seed[1] if seed else ()
    definer = nearest_definer(name, ancestors)
    hook = name in project_hooks(libraries) and definer is not None
    hook = hook and not is_inert_base(definer[1])
    return Override(
        cls,
        context,
        method,
        calls_base(method, name, extras, receivers),
        anchors_of(name, definer, libraries),
        definer[0].name if hook else None,
        seed[0].rsplit(".", 1)[-1] if seed else None,
    )


def class_overrides(cls, context):
    ancestors, libraries = ancestry(cls, context)
    facts = (ancestors, libraries, receiver_names(cls, ancestors, libraries))
    for name, method in own_methods(cls).items():
        if name.startswith("__") or not is_overridable(method) or is_trivial(method):
            continue
        yield name, override_of(cls, context, name, method, facts)


def project_overrides(project):
    found = []
    for context in project.contexts.values():
        for node in ast.walk(context.tree):
            if isinstance(node, ast.ClassDef):
                found.extend(class_overrides(node, context))
    return found
