import ast
import os

from checks.common import call_name, dotted_name

TEST_NAME_PREFIX = "test_"
TEST_NAME_SUFFIX = "_test"
FIXTURE_DECORATORS = {"pytest.fixture", "pytest_asyncio.fixture"}


def subject_stem(path):
    stem = os.path.basename(path)[: -len(".py")]
    if stem.startswith(TEST_NAME_PREFIX):
        return stem[len(TEST_NAME_PREFIX) :]
    if stem.endswith(TEST_NAME_SUFFIX):
        return stem[: -len(TEST_NAME_SUFFIX)]
    return None


def subject_path(context, stem):
    project = context.project
    candidates = [
        path
        for path in project.contexts
        if path not in project.test_files
        and (
            os.path.basename(path) == f"{stem}.py"
            or path.endswith(f"/{stem}/__init__.py")
            or path == f"{stem}/__init__.py"
        )
    ]
    if len(candidates) == 1:
        return candidates[0]
    imported = {project.module_path(target) for target in imported_modules(context)}
    chosen = [path for path in candidates if path in imported]
    return chosen[0] if len(chosen) == 1 else None


def imported_modules(context):
    names, modules = context.aliases[:2]
    found = set(modules.values())
    for target in names.values():
        found.add(target)
        found.add(target.rpartition(".")[0])
    return found


def defined_names(tree):
    functions, classes = set(), {}
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            functions.add(node.name)
        elif isinstance(node, ast.ClassDef):
            classes[node.name] = {
                item.name
                for item in node.body
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef))
            }
    return functions, classes


def located_in_subject(dotted, subject, follow=True):
    parts = dotted.split(".") if dotted else []
    project = subject.project
    for size in range(len(parts) - 1, 0, -1):
        path = project.module_path(".".join(parts[:size]))
        if path == subject.path:
            return parts[size], parts[size + 1 :]
        exported = re_export(project, path, parts[size]) if follow else None
        if exported:
            target = ".".join([exported, *parts[size + 1 :]])
            return located_in_subject(target, subject, follow=False)
    return None


def re_export(project, path, name):
    context = project.contexts.get(path) if path else None
    return context.aliases[0].get(name) if context is not None else None


def subject_class(dotted, subject):
    located = located_in_subject(dotted, subject)
    if located is None or located[1] or located[0] not in subject.classes:
        return None
    return located[0]


def is_subject_target(dotted, subject):
    located = located_in_subject(dotted, subject)
    if located is None:
        return False
    name, rest = located
    if name in subject.functions:
        return not rest
    methods = subject.classes.get(name)
    return methods is not None and (not rest or (len(rest) == 1 and rest[0] in methods))


def target_text(node):
    try:
        return ast.unparse(node)
    except (AttributeError, ValueError):
        return None


def is_fixture(node, aliases):
    for decorator in node.decorator_list:
        target = decorator.func if isinstance(decorator, ast.Call) else decorator
        if dotted_name(target, aliases) in FIXTURE_DECORATORS:
            return True
    return False


def returned_values(function):
    for node in ast.walk(function):
        if isinstance(node, (ast.Return, ast.Yield)) and node.value is not None:
            yield node.value


def scope_key(node):
    return id(node) if node is not None else None


def instance_names(context, subject):
    def built_class(value):
        return subject_class(call_name(value, context.aliases), subject)

    scopes, fixture_nodes = {}, []

    def bind(node, target, built):
        text = target_text(target)
        if built and text:
            owner = binding_scope(context, node, text)
            scopes.setdefault(scope_key(owner), {})[text] = built

    for node in ast.walk(context.tree):
        for target, built in bindings(node, built_class, context):
            bind(node, target, built)
        if isinstance(node, FUNCTIONS) and is_fixture(node, context.aliases):
            fixture_nodes.append(node)
    fixtures = {}
    for node in fixture_nodes:
        local = scopes.get(id(node), {})
        returned = [
            built_class(value) or local.get(target_text(value))
            for value in returned_values(node)
        ]
        built = next(filter(None, returned), None)
        if built:
            fixtures[node.name] = built
    return scopes, fixtures


def bindings(node, built_class, context):
    value = getattr(node, "value", None)
    if isinstance(node, ast.Assign) and value is not None:
        built = built_class(value)
        return [(target, built) for target in node.targets]
    if isinstance(node, ast.AnnAssign) and value is not None:
        return [(node.target, built_class(value))]
    if isinstance(node, ast.withitem) and node.optional_vars is not None:
        return [(node.optional_vars, built_class(node.context_expr))]
    if isinstance(node, ast.arg) and node.annotation is not None:
        annotated = dotted_name(node.annotation, context.aliases)
        return [(ast.Name(node.arg), built_class_name(annotated, built_class))]
    return []


def built_class_name(dotted, built_class):
    return (
        built_class(ast.Call(func=ast.Name(dotted), args=[], keywords=[]))
        if dotted
        else None
    )


def enclosing(context, node, kinds):
    parent = context.parents.get(id(node))
    while parent is not None and not isinstance(parent, kinds):
        parent = context.parents.get(id(parent))
    return parent


FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


def binding_scope(context, node, text):
    if text and text.startswith(("self.", "cls.")):
        return enclosing(context, node, ast.ClassDef)
    return enclosing(context, node, FUNCTIONS)


def visible_instances(context, node, instances):
    scopes, fixtures = instances
    visible = dict(scopes.get(None, {}))
    chain = []
    parent = context.parents.get(id(node))
    while parent is not None:
        chain.append(parent)
        parent = context.parents.get(id(parent))
    for owner in reversed(chain):
        if isinstance(owner, FUNCTIONS):
            arguments = owner.args.posonlyargs + owner.args.args + owner.args.kwonlyargs
            for argument in arguments:
                if argument.arg in fixtures:
                    visible[argument.arg] = fixtures[argument.arg]
        if isinstance(owner, (*FUNCTIONS, ast.ClassDef)):
            visible.update(scopes.get(id(owner), {}))
    return visible
