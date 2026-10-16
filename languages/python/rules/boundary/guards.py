import ast

from checks.common import (
    dotted_name,
    finding,
    functions_of,
    last_name,
    own_nodes,
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


def parsed_source(node, aliases):
    if isinstance(node, ast.Await):
        node = node.value
    if not isinstance(node, ast.Call):
        return False
    if dotted_name(node.func, aliases) in PARSE_CALLS:
        return True
    return (
        isinstance(node.func, ast.Attribute)
        and node.func.attr in PARSE_METHODS
        and not node.args
    )


def is_any_annotation(annotation, aliases):
    if annotation is None:
        return False
    return (dotted_name(annotation, aliases) or "").rsplit(".", 1)[-1] == "Any"


def parsed_names(scope, aliases):
    names = set()
    arguments = getattr(scope, "args", None)
    if arguments is not None:
        every = arguments.args + arguments.posonlyargs + arguments.kwonlyargs
        names.update(a.arg for a in every if is_any_annotation(a.annotation, aliases))
    for node in own_nodes(scope):
        targets = []
        if isinstance(node, ast.Assign) and parsed_source(node.value, aliases):
            targets = node.targets
        elif (
            isinstance(node, ast.AnnAssign)
            and node.value
            and parsed_source(node.value, aliases)
        ):
            targets = [node.target]
        elif isinstance(node, ast.NamedExpr) and parsed_source(node.value, aliases):
            targets = [node.target]
        names.update(target.id for target in targets if isinstance(target, ast.Name))
    return names


def root_name(node):
    while True:
        if isinstance(node, ast.Subscript):
            node = node.value
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            node = node.func.value
        elif isinstance(node, ast.Attribute):
            node = node.value
        else:
            return node.id if isinstance(node, ast.Name) else None


def narrowing_findings(path, scope, aliases):
    names = parsed_names(scope, aliases)
    if not names:
        return []
    found = []
    for node in own_nodes(scope):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "isinstance"
            and node.args
            and root_name(node.args[0]) in names
        ):
            found.append(
                finding(
                    path,
                    "handwritten-boundary-guard",
                    f"isinstance({root_name(node.args[0])})",
                    node,
                )
            )
    return found


def predicate_findings(path, tree, aliases):
    found = []
    for function in functions_of(tree):
        returns = function.returns
        annotation = returns.value if isinstance(returns, ast.Subscript) else None
        if last_name(annotation) not in PREDICATES:
            continue
        parameters = function.args.args + function.args.posonlyargs
        first = parameters[0].annotation if parameters else None
        if first is not None and type_text(first) in OPAQUE_TYPES | {
            "typing.Any",
            "typing.object",
        }:
            found.append(
                finding(path, "handwritten-boundary-guard", function.name, function)
            )
    return found


def check(context):
    if context.tests:
        return []
    scopes = [context.tree] + functions_of(context.tree)
    found = []
    for scope in scopes:
        found.extend(narrowing_findings(context.path, scope, context.aliases))
    return found + predicate_findings(context.path, context.tree, context.aliases)
