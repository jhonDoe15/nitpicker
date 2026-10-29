import ast
from typing import NamedTuple

from checks.common import dotted_name, has_decorator, last_name
from concurrency.lock_keys import LockKeys, attribute_root
from concurrency.locks import (
    FACTORY,
    FIELD,
    is_exclusive_construction,
    is_one,
    keyword_value,
)

THREAD_LOCKS = {"threading.Lock", "threading.RLock", "threading.Condition"}
THREAD_SEMAPHORES = {"threading.Semaphore", "threading.BoundedSemaphore"}
CONSTRUCTION = {"__init__", "__new__", "__post_init__"}
INITIALIZERS = {"__init__", "__post_init__"}
CLASS_LEVEL = {"staticmethod", "classmethod"}
PLAIN_DECORATORS = CLASS_LEVEL | {
    "property",
    "setter",
    "getter",
    "deleter",
    "abstractmethod",
    "override",
    "cached_property",
}
ACQUIRES = {"acquire", "acquire_nowait"}
NESTED = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
WRITES = (ast.Assign, ast.AnnAssign, ast.AugAssign)
UNKNOWN = "?"


def is_lock_construction(value, aliases):
    if isinstance(value, ast.Call):
        name = dotted_name(value.func, aliases)
        if name is not None and name.endswith(".Condition") and value.args:
            return False
        if name in THREAD_LOCKS:
            return True
        if name == FIELD:
            factory = keyword_value(value, FACTORY)
            if dotted_name(factory, aliases) in THREAD_LOCKS:
                return True
        if name in THREAD_SEMAPHORES:
            first = value.args[0] if value.args else None
            given = next((k.value for k in value.keywords if k.arg == "value"), first)
            return given is None or is_one(given)
    return is_exclusive_construction(value, aliases)


class Acquisition(NamedTuple):
    key: str
    node: ast.AST
    held: tuple
    method: str


class Write(NamedTuple):
    name: str
    node: ast.AST
    held: tuple
    method: str


def flat_targets(targets):
    for target in targets:
        if isinstance(target, (ast.Tuple, ast.List)):
            yield from flat_targets(target.elts)
        elif isinstance(target, ast.Starred):
            yield from flat_targets([target.value])
        else:
            yield target


class ClassSites:
    def __init__(self, klass, keys, names):
        self.klass = klass
        self.keys = keys
        self.names = names
        self.acquisitions = []
        self.writes = []
        self.locked_calls = set()
        self.opaque = set()
        for method in klass.body:
            if isinstance(method, FUNCTIONS):
                self.method = method
                self.receiver = self.receiver_of(method)
                self.visit(method, ())

    def receiver_of(self, method):
        arguments = method.args.posonlyargs + method.args.args
        if not arguments or any(has_decorator(method, name) for name in CLASS_LEVEL):
            return None
        if any(
            last_name(decorator.func if isinstance(decorator, ast.Call) else decorator)
            not in PLAIN_DECORATORS
            for decorator in method.decorator_list
        ):
            self.opaque.add(method.name)
        return arguments[0].arg

    def lock_text(self, expression):
        key = self.keys.use_key(expression, self.method)
        if key is None or key[0] == "local":
            return None
        if key[0] == "module":
            return key[1]
        owner = self.names.get(key[1])
        if key[1] == id(self.klass) or attribute_root(expression) == self.receiver:
            return f"self.{key[2]}"
        return f"{owner}.{key[2]}" if owner else None

    def visit(self, node, held):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, NESTED):
                continue
            if isinstance(child, (ast.With, ast.AsyncWith)):
                self.visit_with(child, held)
                continue
            self.observe(child, held)
            self.visit(child, held)

    def visit_with(self, statement, held):
        for item in statement.items:
            self.visit(item, held)
            if not self.keys.is_lock(item.context_expr, self.method):
                held = (*held, UNKNOWN)
                continue
            text = self.lock_text(item.context_expr)
            if text is not None:
                self.acquisitions.append(
                    Acquisition(text, item.context_expr, held, self.method.name)
                )
            held = (*held, text or UNKNOWN)
        for child in statement.body:
            self.observe(child, held)
            if isinstance(child, (ast.With, ast.AsyncWith)):
                self.visit_with(child, held)
            elif not isinstance(child, NESTED):
                self.visit(child, held)

    def observe(self, node, held):
        if isinstance(node, ast.AnnAssign) and node.value is None:
            return
        if self.acquires(node):
            self.opaque.add(self.method.name)
        if isinstance(node, WRITES) and self.receiver is not None:
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for target in flat_targets(targets):
                if self.is_own(target):
                    self.writes.append(Write(target.attr, node, held, self.method.name))
        if (
            isinstance(node, ast.Call)
            and held
            and isinstance(node.func, ast.Attribute)
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id == self.receiver
        ):
            self.locked_calls.add(node.func.attr)

    def acquires(self, node):
        return (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in ACQUIRES
            and self.keys.is_lock(node.func.value, self.method)
        )

    def is_own(self, target):
        return (
            isinstance(target, ast.Attribute)
            and isinstance(target.value, ast.Name)
            and target.value.id == self.receiver
        )


def class_sites(context):
    cached = getattr(context, "lock_sites", None)
    if cached is None:
        keys = LockKeys(
            context.tree,
            context.aliases,
            context.parents,
            is_lock_construction,
            INITIALIZERS,
        )
        classes = [n for n in ast.walk(context.tree) if isinstance(n, ast.ClassDef)]
        names = {id(klass): klass.name for klass in classes}
        cached = [ClassSites(klass, keys, names) for klass in classes]
        context.lock_sites = cached
    return cached
