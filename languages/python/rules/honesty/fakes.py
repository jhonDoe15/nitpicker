import ast

from checks.common import dotted_name, parameter_names
from honesty.fake_names import (
    CLOCK,
    CLOCK_NAMES,
    FIXTURE_KINDS,
    MARK_KINDS,
    MODULE_KINDS,
    NETWORK,
    NETWORK_FAKES,
    NETWORK_NAMES,
    PATCH_CALLS,
    PATCH_OWNERS,
    RANDOM,
    RANDOM_NAMES,
    SEED_NAMES,
    SETUP_METHODS,
    SLEEP,
    SLEEP_NAMES,
    TIME_FAKES,
)


def patch_target(call, aliases):
    first = call.args[0] if call.args else None
    if isinstance(first, ast.Constant) and isinstance(first.value, str):
        return first.value.split(".")
    second = call.args[1] if len(call.args) > 1 else None
    if isinstance(second, ast.Constant) and isinstance(second.value, str):
        return (dotted_name(first, aliases) or "").split(".") + [second.value]
    return []


def is_patch_call(call, aliases):
    parts = (dotted_name(call.func, aliases) or "").split(".")
    return parts[-1] in PATCH_CALLS and bool(PATCH_OWNERS & set(parts))


def patch_kinds(call, aliases):
    target = patch_target(call, aliases)
    if not target:
        return set()
    kinds = set()
    if target[-1] in CLOCK_NAMES:
        kinds.add(CLOCK)
    if target[-1] in SLEEP_NAMES:
        kinds.add(SLEEP)
    if target[-1] in RANDOM_NAMES:
        kinds.add(RANDOM)
    if NETWORK_NAMES & set(target):
        kinds.add(NETWORK)
    return kinds


def is_imported(node, aliases):
    while isinstance(node, (ast.Attribute, ast.Call)):
        node = node.value if isinstance(node, ast.Attribute) else node.func
    return isinstance(node, ast.Name) and (
        node.id in aliases[0] or node.id in aliases[1]
    )


def module_kinds(name):
    parts = (name or "").split(".")
    return MODULE_KINDS.get(parts[0], set())


def mark_kinds(name):
    parts = (name or "").split(".")
    if "mark" in parts:
        return MARK_KINDS.get(parts[-1], set())
    return set()


def seeded(call, aliases):
    name = (dotted_name(call.func, aliases) or "").rsplit(".", 1)[-1]
    return name in SEED_NAMES and bool(call.args or call.keywords)


def fixture_names(call):
    return {
        argument.value
        for argument in call.args
        if isinstance(argument, ast.Constant) and isinstance(argument.value, str)
    }


def expression_kinds(node, aliases):
    target = node.func if isinstance(node, ast.Call) else node
    name = dotted_name(target, aliases)
    kinds = mark_kinds(name)
    if is_imported(target, aliases):
        kinds |= module_kinds(name)
    if isinstance(node, ast.Call):
        if is_patch_call(node, aliases):
            kinds |= patch_kinds(node, aliases)
        if seeded(node, aliases):
            kinds.add(RANDOM)
        if (name or "").endswith("usefixtures"):
            for fixture in fixture_names(node):
                kinds |= FIXTURE_KINDS.get(fixture, set())
    return kinds


def is_autouse(function, aliases):
    for decorator in function.decorator_list:
        if not isinstance(decorator, ast.Call):
            continue
        if (dotted_name(decorator.func, aliases) or "").endswith("fixture"):
            return any(
                keyword.arg == "autouse"
                and isinstance(keyword.value, ast.Constant)
                and keyword.value.value is True
                for keyword in decorator.keywords
            )
    return False


def kinds_in_nodes(nodes, aliases):
    kinds = set()
    for node in nodes:
        if isinstance(node, (ast.Call, ast.Attribute, ast.Name)):
            kinds |= expression_kinds(node, aliases)
    return kinds


def function_nodes(function):
    pending = list(function.body)
    while pending:
        node = pending.pop()
        yield node
        if isinstance(node, (ast.With, ast.AsyncWith)):
            pending.extend(node.body)
        else:
            pending.extend(ast.iter_child_nodes(node))


def with_items_kinds(node, aliases):
    kinds = set()
    for item in node.items:
        kinds |= kinds_in_nodes(ast.walk(item.context_expr), aliases)
    return kinds


class Fakes:
    def __init__(self, context):
        self.context = context
        self.aliases = context.aliases
        self.cache = {}
        self.fixtures = self.fixtures_of(context)

    def fixtures_of(self, context):
        found = {}
        for node in ast.walk(context.tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if any(
                    (
                        dotted_name(
                            d.func if isinstance(d, ast.Call) else d, context.aliases
                        )
                        or ""
                    ).endswith("fixture")
                    for d in node.decorator_list
                ):
                    found[node.name] = node
        return found

    def function_kinds(self, function, whole=False):
        key = (id(function), whole)
        if key in self.cache:
            return self.cache[key]
        self.cache[key] = set()
        kinds = set()
        for decorator in function.decorator_list:
            kinds |= kinds_in_nodes(ast.walk(decorator), self.aliases)
        for name in sorted(parameter_names(function)):
            kinds |= FIXTURE_KINDS.get(name, set())
            fixture = self.fixtures.get(name)
            if fixture is not None and fixture is not function:
                kinds |= self.function_kinds(fixture, whole=True)
        nodes = ast.walk(function) if whole else function_nodes(function)
        kinds |= kinds_in_nodes(nodes, self.aliases)
        self.cache[key] = kinds
        return kinds

    def class_kinds(self, node):
        kinds = set()
        for decorator in node.decorator_list:
            kinds |= kinds_in_nodes(ast.walk(decorator), self.aliases)
        for statement in node.body:
            if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if statement.name in SETUP_METHODS:
                    kinds |= self.function_kinds(statement)
            else:
                kinds |= kinds_in_nodes(ast.walk(statement), self.aliases)
        return kinds

    def module_kinds(self):
        key = "module"
        if key not in self.cache:
            kinds = set()
            for statement in self.context.tree.body:
                if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    if is_autouse(statement, self.aliases):
                        kinds |= self.function_kinds(statement, whole=True)
                elif not isinstance(statement, ast.ClassDef):
                    kinds |= kinds_in_nodes(ast.walk(statement), self.aliases)
            self.cache[key] = kinds | self.conftest_kinds()
        return self.cache[key]

    def conftest_kinds(self):
        kinds = set()
        directory = (
            self.context.path.rsplit("/", 1)[0] if "/" in self.context.path else ""
        )
        for path, other in self.context.project.contexts.items():
            if path.rsplit("/", 1)[-1] != "conftest.py" or path == self.context.path:
                continue
            base = path.rsplit("/", 1)[0] if "/" in path else ""
            if base == "" or directory == base or directory.startswith(base + "/"):
                kinds |= other_autouse(other)
        return kinds

    def kinds_at(self, node):
        parents = self.context.parents
        kinds = set(self.module_kinds())
        current = parents.get(id(node))
        while current is not None:
            if isinstance(current, (ast.FunctionDef, ast.AsyncFunctionDef)):
                kinds |= self.function_kinds(current)
            elif isinstance(current, ast.ClassDef):
                kinds |= self.class_kinds(current)
            elif isinstance(current, (ast.With, ast.AsyncWith)):
                kinds |= with_items_kinds(current, self.aliases)
            current = parents.get(id(current))
        return kinds


def other_autouse(other):
    fakes = other.project.memo(("fakes", other.path), lambda _: Fakes(other))
    kinds = set()
    for node in other.tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if is_autouse(node, other.aliases):
                kinds |= fakes.function_kinds(node, whole=True)
    return kinds


def fakes_of(context):
    return context.project.memo(("fakes", context.path), lambda _: Fakes(context))
