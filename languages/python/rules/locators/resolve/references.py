import ast

from checks.common import dotted_name
from locators.model import (
    INSTANCE_LIBRARIES,
    OWNER_NAMES,
    PROVIDER_LIBRARIES,
    UNION_WRAPPERS,
)
from locators.resolve.scopes import (
    attribute_bindings,
    bindings,
    enclosing_class,
    local_entries,
    name_entries,
)
from locators.resolve.symbols import (
    ancestry,
    container_classes,
    is_project_name,
    resolve_in,
    symbols,
)

LIBRARY_ROOTS = frozenset(INSTANCE_LIBRARIES) | frozenset(PROVIDER_LIBRARIES)


def is_library_name(dotted, project):
    return dotted.split(".")[0] in LIBRARY_ROOTS and not is_project_name(
        dotted, project
    )


def star_libraries(context):
    return [
        node.module
        for node in context.tree.body
        if isinstance(node, ast.ImportFrom)
        and node.level == 0
        and node.module
        and any(alias.name == "*" for alias in node.names)
        and is_library_name(node.module, context.project)
    ]


def uses_containers(project):
    def build(_):
        return any(
            is_library_name(dotted, project)
            for context in project.contexts.values()
            for dotted in [
                *(v for imported in context.aliases[:2] for v in imported.values()),
                *star_libraries(context),
            ]
        )

    return project.memo("locator-libraries", build)


def library_of(dotted, field, context):
    candidates = [dotted]
    if "." not in dotted:
        candidates += [f"{module}.{dotted}" for module in star_libraries(context)]
    for candidate in candidates:
        if not is_library_name(candidate, context.project):
            continue
        for library, spec in INSTANCE_LIBRARIES.items():
            if candidate in spec[field]:
                return library
    return None


def root_name(node):
    while isinstance(node, ast.Attribute):
        node = node.value
    return node.id if isinstance(node, ast.Name) else None


def class_reference(dotted, context):
    key = resolve_in(context, dotted, symbols(context.project)["classes"])
    containers = container_classes(context.project)
    if key in containers:
        return containers[key]
    return ("object", key) if key else None


def dotted_reference(dotted, context):
    library = library_of(dotted, "instances", context)
    if library:
        return ("instance", library)
    reference = class_reference(dotted, context)
    if reference:
        return reference
    project = context.project
    index = module_names(project)
    key = resolve_in(context, dotted, index)
    if key is None:
        return None
    owner = index[key]
    return entries_reference(bindings(owner.tree, owner)[key[1]], owner)


def module_names(project):
    def build(_):
        return {
            (project.module_name(context.path), name): context
            for context in project.contexts.values()
            for name in bindings(context.tree, context)
        }

    return project.memo("locator-module-names", build)


def annotation_reference(annotation, context):
    if isinstance(annotation, ast.Constant) and isinstance(annotation.value, str):
        try:
            parsed = ast.parse(annotation.value.strip(), mode="eval").body
        except SyntaxError:
            return None
        return annotation_reference(parsed, context)
    if isinstance(annotation, ast.BinOp) and isinstance(annotation.op, ast.BitOr):
        return annotation_reference(annotation.left, context) or annotation_reference(
            annotation.right, context
        )
    if isinstance(annotation, ast.Subscript):
        wrapper = dotted_name(annotation.value, context.aliases) or ""
        if wrapper.rsplit(".", 1)[-1] not in UNION_WRAPPERS:
            return None
        inner = annotation.slice
        options = inner.elts if isinstance(inner, ast.Tuple) else [inner]
        return next(
            filter(None, (annotation_reference(option, context) for option in options)),
            None,
        )
    if not isinstance(annotation, (ast.Name, ast.Attribute)):
        return None
    dotted = dotted_name(annotation, context.aliases)
    library = library_of(dotted or "", "classes", context)
    if library:
        return ("instance", library)
    return class_reference(dotted, context) if dotted else None


def entries_reference(entries, context):
    for kind, value in entries:
        if kind == "annotation":
            reference = annotation_reference(value, context)
        elif kind == "value":
            reference = reference_of(value, context)
        else:
            reference = None
        if reference:
            return reference
    return None


def returned_reference(dotted, context):
    functions = symbols(context.project)["functions"]
    key = resolve_in(context, dotted, functions)
    if key is None:
        return None
    owner, function = functions[key]
    return annotation_reference(function.returns, owner) if function.returns else None


def call_reference(call, context):
    root = root_name(call.func)
    if root and local_entries(root, call, context) is not None:
        return None
    dotted = dotted_name(call.func, context.aliases)
    if not dotted:
        return None
    library = library_of(dotted, "classes", context)
    if library:
        return ("instance", library)
    return class_reference(dotted, context) or returned_reference(dotted, context)


def owner_reference(node, context):
    klass = enclosing_class(node, context)
    if klass is None:
        return None
    project = context.project
    key = (project.module_name(context.path), klass.name)
    classes = symbols(project)["classes"]
    members = ancestry(project, key) if key in classes else []
    for owner, node_class in [classes[member] for member in members] or [
        (context, klass)
    ]:
        entries = attribute_bindings(node_class, owner).get(node.attr)
        reference = entries_reference(entries, owner) if entries else None
        if reference:
            return reference
    return None


def attribute_reference(node, context):
    root = root_name(node)
    if root in OWNER_NAMES and isinstance(node.value, ast.Name):
        return owner_reference(node, context)
    if root and local_entries(root, node, context) is not None:
        return None
    dotted = dotted_name(node, context.aliases)
    return dotted_reference(dotted, context) if dotted else None


def name_reference(node, context):
    entries = name_entries(node.id, node, context)
    if entries is not None:
        return entries_reference(entries, context)
    return dotted_reference(dotted_name(node, context.aliases), context)


def reference_of(node, context):
    active = context.project.memo("locator-active", lambda _: set())
    if id(node) in active:
        return None
    active.add(id(node))
    try:
        return evaluate(node, context)
    finally:
        active.discard(id(node))


def evaluate(node, context):
    if isinstance(node, ast.Call):
        return call_reference(node, context)
    if isinstance(node, ast.BoolOp):
        values = (reference_of(value, context) for value in node.values)
        return next(filter(None, values), None)
    if isinstance(node, ast.IfExp):
        return reference_of(node.body, context) or reference_of(node.orelse, context)
    if isinstance(node, ast.Name):
        return name_reference(node, context)
    if isinstance(node, ast.Attribute):
        return attribute_reference(node, context)
    return None
