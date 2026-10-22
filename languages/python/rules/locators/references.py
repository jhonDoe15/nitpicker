import ast

from checks.common import dotted_name
from locators.model import INSTANCE_LIBRARIES, PROVIDER_LIBRARIES, SERVICE_PROVIDERS

FOLLOW_LIMIT = 5
OWNER_NAMES = {"self", "cls"}
LIBRARY_ROOTS = frozenset(INSTANCE_LIBRARIES) | frozenset(PROVIDER_LIBRARIES)


def uses_containers(project):
    def build(_):
        return any(
            dotted.split(".")[0] in LIBRARY_ROOTS
            for context in project.contexts.values()
            for imported in context.aliases[:2]
            for dotted in imported.values()
        )

    return project.memo("locator-libraries", build)


def constructed_library(dotted):
    for library, spec in INSTANCE_LIBRARIES.items():
        if dotted in spec["classes"]:
            return library
    return None


def shared_instance_library(dotted):
    for library, spec in INSTANCE_LIBRARIES.items():
        if dotted in spec["instances"]:
            return library
    return None


def provider_library(node, context):
    dotted = dotted_name(node, context.aliases)
    for library, spec in PROVIDER_LIBRARIES.items():
        if dotted in spec["bases"]:
            return library
    return None


def target_name(target):
    if isinstance(target, ast.Name):
        return target.id
    owner = getattr(target, "value", None)
    if isinstance(target, ast.Attribute) and getattr(owner, "id", None) in OWNER_NAMES:
        return target.attr
    return None


def assignments(statement):
    if isinstance(statement, ast.Assign):
        return [(target_name(target), statement.value) for target in statement.targets]
    if isinstance(statement, ast.AnnAssign) and statement.value is not None:
        return [(target_name(statement.target), statement.value)]
    return []


def provider_names(body, library, context):
    prefix = PROVIDER_LIBRARIES[library]["providers"]
    names = set()
    for statement in body:
        for name, value in assignments(statement):
            callee = (
                dotted_name(value.func, context.aliases) or ""
                if isinstance(value, ast.Call)
                else ""
            )
            if callee.startswith(prefix) and callee[len(prefix) :] in SERVICE_PROVIDERS:
                names.add(name)
    return frozenset(names)


def declarative_classes(project):
    def build(_):
        found = {}
        for context in project.contexts.values():
            for node in context.tree.body:
                if not isinstance(node, ast.ClassDef):
                    continue
                libraries = [provider_library(base, context) for base in node.bases]
                library = next(filter(None, libraries), None)
                if library:
                    names = provider_names(node.body, library, context)
                    found[(project.module_name(context.path), node.name)] = (
                        "providers",
                        library,
                        node.name,
                        names,
                    )
        return found

    return project.memo("locator-containers", build)


def follow(project, dotted, defined):
    for _ in range(FOLLOW_LIMIT):
        located = project.locate(dotted)
        if located is None:
            return None
        path, name = located
        key = (project.module_name(path), name)
        if key in defined:
            return key
        context = project.contexts.get(path)
        imported = context.aliases[0].get(name) if context else None
        if imported is None:
            return None
        dotted = imported
    return None


def container_class_reference(dotted, context):
    project = context.project
    classes = declarative_classes(project)
    own = (project.module_name(context.path), dotted)
    key = own if own in classes else follow(project, dotted, classes)
    return classes[key] if key else None


def call_reference(call, context):
    dotted = dotted_name(call.func, context.aliases)
    if not dotted:
        return None
    library = constructed_library(dotted)
    if library:
        return ("instance", library)
    return container_class_reference(dotted, context)


def annotation_reference(annotation, context):
    if not isinstance(annotation, (ast.Name, ast.Attribute)):
        return None
    dotted = dotted_name(annotation, context.aliases)
    library = constructed_library(dotted or "")
    if library:
        return ("instance", library)
    return container_class_reference(dotted, context) if dotted else None


def module_instances(project):
    def build(_):
        found = {}
        for context in project.contexts.values():
            module = project.module_name(context.path)
            for statement in context.tree.body:
                for name, value in assignments(statement):
                    reference = (
                        call_reference(value, context)
                        if name and isinstance(value, ast.Call)
                        else None
                    )
                    if reference:
                        found[(module, name)] = reference
        return found

    return project.memo("locator-instances", build)


def local_references(context):
    def build(_):
        found = {}
        for node in ast.walk(context.tree):
            for name, value in assignments(node):
                reference = (
                    call_reference(value, context)
                    if name and isinstance(value, ast.Call)
                    else None
                )
                if reference:
                    found[name] = reference
            annotation = getattr(node, "annotation", None)
            name = node.arg if isinstance(node, ast.arg) else None
            if isinstance(node, ast.AnnAssign):
                name = target_name(node.target)
            reference = annotation_reference(annotation, context) if name else None
            if reference:
                found[name] = reference
        return found

    return context.project.memo(f"locator-references:{context.path}", build)


def shared_reference(dotted, context):
    library = shared_instance_library(dotted)
    if library:
        return ("instance", library)
    reference = container_class_reference(dotted, context)
    if reference:
        return reference
    instances = module_instances(context.project)
    own = (context.project.module_name(context.path), dotted)
    key = own if own in instances else follow(context.project, dotted, instances)
    return instances[key] if key else None


def reference_of(node, context):
    if isinstance(node, ast.Call):
        return call_reference(node, context)
    if not isinstance(node, (ast.Name, ast.Attribute)):
        return None
    dotted = dotted_name(node, context.aliases)
    reference = shared_reference(dotted, context) if dotted else None
    return reference or local_references(context).get(target_name(node))
