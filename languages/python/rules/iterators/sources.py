import ast

from checks.common import dotted_name
from reach.callees import callee_key
from reach.flow import walk_scope
from signatures.annotations import decorator_names

ITERATOR_BUILTINS = {"map", "filter", "zip", "iter", "reversed", "enumerate"}
ITERTOOLS = "itertools."
NOT_ITERATORS = {"itertools.tee"}
PLAIN_DECORATORS = {"contextmanager", "fixture", "property", "cached_property"}


def is_generator_function(function):
    if decorator_names(function) & PLAIN_DECORATORS:
        return False
    return any(isinstance(node, (ast.Yield, ast.YieldFrom)) for node in walk_scope(function))


def generator_functions(project):
    def build(_):
        found = set()
        for path, context in project.contexts.items():
            if path in project.test_files:
                continue
            found.update(
                (path, node.name)
                for node in ast.walk(context.tree)
                if isinstance(node, ast.FunctionDef) and is_generator_function(node)
            )
        return found

    return project.memo(("one-shot-generator-functions",), build)


def is_one_shot(value, context):
    if isinstance(value, ast.GeneratorExp):
        return True
    if not isinstance(value, ast.Call):
        return False
    name = dotted_name(value.func, context.aliases) or ""
    if name in ITERATOR_BUILTINS or (name.startswith(ITERTOOLS) and name not in NOT_ITERATORS):
        return True
    return callee_key(value, context) in generator_functions(context.project)
