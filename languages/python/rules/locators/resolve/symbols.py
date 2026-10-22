import ast

from checks.common import dotted_name, imported_module
from locators.model import COMPOSITION_BASES, PROVIDER_LIBRARIES, SERVICE_PROVIDERS

FOLLOW_LIMIT = 6
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


def star_modules(context):
    def build(_):
        return [
            module
            for node in context.tree.body
            if isinstance(node, ast.ImportFrom)
            and any(alias.name == "*" for alias in node.names)
            for module in [imported_module(node, context.project, context.path)]
            if module
        ]

    return context.project.memo(f"locator-stars:{context.path}", build)


def follow(project, dotted, defined, budget=FOLLOW_LIMIT):
    located = project.locate(dotted) if budget > 0 else None
    if located is None:
        return None
    path, name = located
    key = (project.module_name(path), name)
    if key in defined:
        return key
    context = project.contexts.get(path)
    if context is None:
        return None
    imported = context.aliases[0].get(name)
    if imported is not None:
        return follow(project, imported, defined, budget - 1)
    for module in star_modules(context):
        found = follow(project, f"{module}.{name}", defined, budget - 1)
        if found:
            return found
    return None


def resolve_in(context, dotted, defined):
    project = context.project
    own = (project.module_name(context.path), dotted)
    if own in defined:
        return own
    found = follow(project, dotted, defined)
    if found:
        return found
    for module in star_modules(context):
        found = follow(project, f"{module}.{dotted}", defined)
        if found:
            return found
    return None


def symbols(project):
    def build(_):
        found = {"classes": {}, "functions": {}, "methods": {}}
        for context in project.contexts.values():
            module = project.module_name(context.path)
            for node in context.tree.body:
                if isinstance(node, ast.ClassDef):
                    found["classes"][(module, node.name)] = (context, node)
                if context.tests:
                    continue
                if isinstance(node, FUNCTIONS):
                    found["functions"][(module, node.name)] = (context, node)
                if isinstance(node, ast.ClassDef):
                    for member in node.body:
                        if isinstance(member, FUNCTIONS):
                            name = f"{node.name}.{member.name}"
                            found["methods"][(module, name)] = (context, member)
        return found

    return project.memo("locator-symbols", build)


def provider_library(node, context):
    dotted = dotted_name(node, context.aliases)
    for library, spec in PROVIDER_LIBRARIES.items():
        if dotted in spec["bases"]:
            return library
    return None


def provider_names(body, library, context):
    prefix = PROVIDER_LIBRARIES[library]["providers"]
    names = set()
    for statement in body:
        targets, value = [], None
        if isinstance(statement, ast.Assign):
            targets, value = statement.targets, statement.value
        elif isinstance(statement, ast.AnnAssign):
            targets, value = [statement.target], statement.value
        callee = (
            dotted_name(value.func, context.aliases) or ""
            if isinstance(value, ast.Call)
            else ""
        )
        if callee.startswith(prefix) and callee[len(prefix) :] in SERVICE_PROVIDERS:
            names.update(t.id for t in targets if isinstance(t, ast.Name))
    return names


def base_key(base, context):
    dotted = dotted_name(base, context.aliases)
    classes = symbols(context.project)["classes"]
    return resolve_in(context, dotted, classes) if dotted else None


def class_bases(project, key):
    context, node = symbols(project)["classes"][key]
    return context, node, [base_key(base, context) for base in node.bases]


def ancestry(project, key):
    seen, order, pending = set(), [], [key]
    while pending:
        current = pending.pop(0)
        if current in seen or current not in symbols(project)["classes"]:
            continue
        seen.add(current)
        order.append(current)
        pending.extend(parent for parent in class_bases(project, current)[2] if parent)
    return order


def container_classes(project):
    def build(_):
        found = {}
        for key in symbols(project)["classes"]:
            library, names, name = None, set(), key[1]
            for member in ancestry(project, key):
                context, node, _ = class_bases(project, member)
                direct = next(
                    filter(None, (provider_library(b, context) for b in node.bases)), None
                )
                if direct:
                    library = library or direct
                    names |= provider_names(node.body, direct, context)
            if library:
                found[key] = ("providers", library, name, frozenset(names))
        return found

    return project.memo("locator-containers", build)


def is_composition_class(klass, context):
    project = context.project
    key = (project.module_name(context.path), klass.name)
    if any(dotted_name(base, context.aliases) in COMPOSITION_BASES for base in klass.bases):
        return True
    if key not in symbols(project)["classes"]:
        return False
    for member in ancestry(project, key):
        owner, node, _ = class_bases(project, member)
        if any(dotted_name(base, owner.aliases) in COMPOSITION_BASES for base in node.bases):
            return True
    return False
