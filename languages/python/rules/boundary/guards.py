import ast

from checks.common import (
    dotted_name,
    finding,
    functions_of,
    own_nodes,
    root_name,
    type_text,
)

PARSE_CALLS = {
    "json.loads",
    "json.load",
    "orjson.loads",
    "ujson.loads",
    "simplejson.loads",
    "yaml.safe_load",
    "yaml.load",
    "tomllib.loads",
    "tomllib.load",
    "toml.loads",
    "xmltodict.parse",
}
PARSE_METHODS = {"json"}
PREDICATES = {"TypeGuard", "TypeIs"}
OPAQUE_TYPES = {"Any", "object"}
PASSES = 3
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
PATTERNS = (ast.MatchClass, ast.MatchMapping)


def unwrap(node):
    return node.value if isinstance(node, ast.Await) else node


def annotation_is_opaque(annotation):
    if annotation is None:
        return False
    for node in ast.walk(annotation):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            try:
                parsed = ast.parse(node.value, mode="eval").body
            except SyntaxError:
                continue
            if annotation_is_opaque(parsed):
                return True
        name = (
            node.attr if isinstance(node, ast.Attribute) else getattr(node, "id", None)
        )
        if name in OPAQUE_TYPES:
            return True
    return False


def is_dunder(function):
    return function.name.startswith("__") and function.name.endswith("__")


def opaque_parameters(function):
    arguments = function.args
    every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
    return [
        a
        for a in every
        if a.arg not in {"self", "cls"} and annotation_is_opaque(a.annotation)
    ]


def parse_call(node, aliases):
    node = unwrap(node)
    if not isinstance(node, ast.Call):
        return False
    if dotted_name(node.func, aliases) in PARSE_CALLS:
        return True
    return (
        isinstance(node.func, ast.Attribute)
        and node.func.attr in PARSE_METHODS
        and not node.args
    )


def opaque_functions(project):
    def build(_):
        found = set()
        for _ in range(PASSES):
            for path, context in project.contexts.items():
                for function in context.tree.body:
                    if not isinstance(function, FUNCTIONS):
                        continue
                    if (path, function.name) in found:
                        continue
                    if returns_opaque(function, context, found):
                        found.add((path, function.name))
        return found

    return project.memo("opaque-functions", build)


def returns_opaque(function, context, found):
    returns = function.returns
    if isinstance(returns, ast.Name) and returns.id == "Any":
        return True
    if isinstance(returns, ast.Attribute) and returns.attr == "Any":
        return True
    return any(
        isinstance(node, ast.Return)
        and node.value is not None
        and is_source(node.value, context, found)
        for node in own_nodes(function)
    )


def is_source(node, context, functions):
    node = unwrap(node)
    if parse_call(node, context.aliases):
        return True
    if not isinstance(node, ast.Call):
        return False
    name = dotted_name(node.func, context.aliases) or ""
    located = context.project.locate(name) if "." in name else None
    return (located if located else (context.path, name)) in functions


def target_names(target):
    return {n.id for n in ast.walk(target) if isinstance(n, ast.Name)}


def is_untrusted(node, names, context, functions):
    return (
        is_source(node, context, functions)
        or root_name(node, through_calls=True) in names
    )


def scope_names(scope, context, functions, inherited):
    names = set(inherited)
    if isinstance(scope, FUNCTIONS) and not is_dunder(scope):
        names.update(a.arg for a in opaque_parameters(scope))
    for _ in range(PASSES):
        for node in own_nodes(scope):
            pairs = []
            if isinstance(node, ast.Assign):
                pairs = [(t, node.value) for t in node.targets]
            elif isinstance(node, (ast.AnnAssign, ast.NamedExpr)) and node.value:
                pairs = [(node.target, node.value)]
            elif isinstance(node, (ast.For, ast.AsyncFor, ast.comprehension)):
                pairs = [(node.target, node.iter)]
            for target, value in pairs:
                if is_untrusted(value, names, context, functions):
                    names |= target_names(target)
    return names


def subject_name(node, context):
    node = unwrap(node)
    if isinstance(node, ast.Call) and isinstance(node.func, (ast.Name, ast.Attribute)):
        if isinstance(node.func, ast.Name) or parse_call(node, context.aliases):
            return f"{type_text(node.func)}()"
    return root_name(node, through_calls=True) or "expression"


def call_findings(node, names, context, functions):
    function = node.func
    if not isinstance(function, ast.Name) or not node.args:
        return []
    if not is_untrusted(node.args[0], names, context, functions):
        return []
    name = subject_name(node.args[0], context)
    if function.id == "isinstance":
        kind = type_text(node.args[1]) if len(node.args) > 1 else "expression"
        subject = f"isinstance({name}, {kind})"
    elif function.id == "hasattr":
        subject = f"hasattr({name})"
    else:
        return []
    return [finding(context.path, "handwritten-boundary-guard", subject, node)]


def type_comparison(node, names, context, functions):
    if not isinstance(node, ast.Compare):
        return []
    left = node.left
    is_type_call = (
        isinstance(left, ast.Call)
        and isinstance(left.func, ast.Name)
        and left.func.id == "type"
        and left.args
        and is_untrusted(left.args[0], names, context, functions)
        and isinstance(node.ops[0], (ast.Is, ast.IsNot, ast.Eq, ast.NotEq))
    )
    if not is_type_call:
        return []
    subject = f"type({subject_name(left.args[0], context)})"
    return [finding(context.path, "handwritten-boundary-guard", subject, node)]


def match_findings(node, names, context, functions):
    if not is_untrusted(node.subject, names, context, functions):
        return []
    subject = f"match({subject_name(node.subject, context)})"
    found = []
    for case in node.cases:
        pattern = next(
            (p for p in ast.walk(case.pattern) if isinstance(p, PATTERNS)), None
        )
        if pattern is not None:
            found.append(
                finding(context.path, "handwritten-boundary-guard", subject, pattern)
            )
    return found


def narrowing_findings(scope, context, functions, inherited):
    names = scope_names(scope, context, functions, inherited)
    found = []
    for node in own_nodes(scope):
        if isinstance(node, ast.Call):
            found.extend(call_findings(node, names, context, functions))
        elif isinstance(node, ast.Compare):
            found.extend(type_comparison(node, names, context, functions))
        elif isinstance(node, ast.Match):
            found.extend(match_findings(node, names, context, functions))
    return found, names


def predicate_findings(context):
    found = []
    for function in functions_of(context.tree):
        returns = function.returns
        annotation = returns.value if isinstance(returns, ast.Subscript) else None
        label = getattr(annotation, "attr", getattr(annotation, "id", None))
        if label not in PREDICATES:
            continue
        parameters = function.args.posonlyargs + function.args.args
        parameters = [p for p in parameters if p.arg not in {"self", "cls"}]
        if parameters and annotation_is_opaque(parameters[0].annotation):
            found.append(
                finding(
                    context.path, "handwritten-boundary-guard", function.name, function
                )
            )
    return found


def check(context):
    if context.tests:
        return []
    functions = opaque_functions(context.project)
    found = []
    inherited_names = {}
    for scope in [context.tree] + functions_of(context.tree):
        parent = context.parents.get(id(scope))
        while parent is not None and not isinstance(parent, FUNCTIONS):
            parent = context.parents.get(id(parent))
        inherited = inherited_names.get(id(parent), set())
        items, names = narrowing_findings(scope, context, functions, inherited)
        inherited_names[id(scope)] = names
        found.extend(items)
    return found + predicate_findings(context)
