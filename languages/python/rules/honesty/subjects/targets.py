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
    functions, classes = set(), set()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            functions.add(node.name)
        elif isinstance(node, ast.ClassDef):
            classes.add(node.name)
    return functions, classes


def is_subject_class(dotted, subject):
    located = subject.project.locate(dotted) if dotted else None
    return (
        located is not None
        and located[0] == subject.path
        and located[1] in subject.classes
        and dotted.endswith(f".{located[1]}")
    )


def is_subject_target(dotted, subject):
    located = subject.project.locate(dotted) if dotted else None
    return (
        located is not None
        and located[0] == subject.path
        and located[1] in subject.functions | subject.classes
    )


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


def instance_names(context, subject):
    def builds_subject(value):
        return is_subject_class(call_name(value, context.aliases), subject)

    names = set()
    for node in ast.walk(context.tree):
        if isinstance(node, ast.Assign) and builds_subject(node.value):
            names.update(filter(None, (target_text(target) for target in node.targets)))
        elif (
            isinstance(node, ast.AnnAssign)
            and node.value
            and builds_subject(node.value)
        ):
            names.add(target_text(node.target))
        elif (
            isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            and is_fixture(node, context.aliases)
            and any(builds_subject(value) for value in returned_values(node))
        ):
            names.add(node.name)
    names.discard(None)
    return names
