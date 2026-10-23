import ast

from checks.common import call_name, dotted_name, finding, overlap_sites, own_nodes
from environment.purity_names import (
    CLOCK_CALLS_WITHOUT_ARGUMENT,
    CLOCK_FORMATTERS,
    CLOCK_NAMES,
    INPUT_OUTPUT_CALLS,
    INPUT_OUTPUT_MODULES,
    LAYER_DIRECTORY,
    MODULE_LOADERS,
    NUMPY_FUNCTIONS,
    PATH_FACTORIES,
    PATH_METHODS,
    RANDOM_FUNCTIONS,
    RANDOM_NAMES,
    SEEDED_FACTORIES,
)

CLOCK_OVERLAPS = {"clock-now": ("DTZ002", "DTZ003", "DTZ005", "DTZ011")}


def random_reference(name):
    module, _, function = name.rpartition(".")
    if module == "random" and function in RANDOM_FUNCTIONS:
        return True
    return (module == "numpy.random" and function in NUMPY_FUNCTIONS) or (
        name in RANDOM_NAMES
    )


def reference_rule(name):
    if name in CLOCK_NAMES:
        return "clock-now"
    return "random-in-domain" if random_reference(name) else None


def call_rule(name, node):
    if name in CLOCK_CALLS_WITHOUT_ARGUMENT:
        return "clock-now" if not node.args else None
    if name in CLOCK_FORMATTERS:
        return "clock-now" if len(node.args) < 2 else None
    if name in SEEDED_FACTORIES:
        return "random-in-domain" if not (node.args or node.keywords) else None
    return "io-in-domain" if name in INPUT_OUTPUT_CALLS else None


def is_input_output_module(module):
    return any(
        module == listed or module.startswith(f"{listed}.")
        for listed in INPUT_OUTPUT_MODULES
    )


def imported_modules(tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                yield alias.name, node
        elif isinstance(node, ast.ImportFrom) and node.module:
            yield node.module, node
        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                yield alias.name, node


def is_adapter_import(module):
    return LAYER_DIRECTORY in module.split(".")


def path_names(scope, aliases):
    names = set()
    for node in own_nodes(scope):
        if isinstance(node, ast.Assign) and builds_path(node.value, aliases):
            names.update(t.id for t in node.targets if isinstance(t, ast.Name))
    arguments = getattr(scope, "args", None)
    if arguments is not None:
        every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
        for argument in every:
            text = ast.dump(argument.annotation) if argument.annotation else ""
            if "Path" in text:
                names.add(argument.arg)
    return names


def builds_path(node, aliases):
    if isinstance(node, ast.Call):
        return dotted_name(node.func, aliases) in PATH_FACTORIES
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
        return builds_path(node.left, aliases)
    return False


def path_method_calls(context):
    scopes = [context.tree] + [
        node
        for node in ast.walk(context.tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]
    for scope in scopes:
        names = path_names(scope, context.aliases)
        for node in own_nodes(scope):
            if not (
                isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
            ):
                continue
            owner = node.func.value
            is_path = builds_path(owner, context.aliases) or (
                isinstance(owner, ast.Name) and owner.id in names
            )
            if is_path and node.func.attr in PATH_METHODS:
                yield node, f"Path.{node.func.attr}"


def loaded_io_module(node, aliases):
    if call_name(node, aliases) not in MODULE_LOADERS or not node.args:
        return None
    first = node.args[0]
    if isinstance(first, ast.Constant) and isinstance(first.value, str):
        return first.value if is_input_output_module(first.value) else None
    return None


def domain_findings(context):
    found = []
    for node in ast.walk(context.tree):
        name = (
            dotted_name(node, context.aliases)
            if isinstance(node, (ast.Name, ast.Attribute))
            else None
        )
        rule = reference_rule(name) if name else None
        if rule is not None and not isinstance(node.ctx, ast.Store):
            found.append(finding(context.path, rule, name, node))
        name = call_name(node, context.aliases)
        rule = call_rule(name, node) if name else None
        if rule is not None:
            found.append(finding(context.path, rule, name, node))
        loaded = (
            loaded_io_module(node, context.aliases)
            if isinstance(node, ast.Call)
            else None
        )
        if loaded is not None:
            found.append(finding(context.path, "io-in-domain", loaded, node))
    for node, name in path_method_calls(context):
        found.append(finding(context.path, "io-in-domain", name, node))
    for module, node in imported_modules(context.tree):
        if is_input_output_module(module) or is_adapter_import(module):
            found.append(finding(context.path, "io-in-domain", module, node))
    return found


def check(context):
    return domain_findings(context) if context.domain else []


def allowances(context):
    return overlap_sites(check(context), CLOCK_OVERLAPS)
