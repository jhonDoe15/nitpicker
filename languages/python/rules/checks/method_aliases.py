import ast

from checks.common import finding

RULE = "forwarding-method-alias"
SKIPPED_NAMES = {"of", "from", "from_", "__init__", "__new__"}


def plain(method):
    args = method.args
    parameters = args.posonlyargs + args.args
    return (
        isinstance(method, ast.FunctionDef)
        and not method.decorator_list
        and not getattr(method, "type_params", [])
        and method.name not in SKIPPED_NAMES
        and not method.name.startswith("__")
        and parameters
        and parameters[0].arg == "self"
        and not args.vararg
        and not args.kwarg
        and not args.defaults
        and not any(args.kw_defaults)
        and method.returns is not None
        and all(p.annotation is not None for p in parameters[1:] + args.kwonlyargs)
    )


def contract(method):
    args = method.args
    positional = args.posonlyargs + args.args
    return (
        ast.dump(method.returns),
        len(args.posonlyargs),
        [(p.arg, ast.dump(p.annotation)) for p in positional[1:] + args.kwonlyargs],
        len(args.kwonlyargs),
    )


def forwarded(method):
    if len(method.body) != 1 or not isinstance(method.body[0], ast.Return):
        return None
    call = method.body[0].value
    if not isinstance(call, ast.Call) or not isinstance(call.func, ast.Attribute):
        return None
    receiver = call.func.value
    if not isinstance(receiver, ast.Name) or receiver.id != "self":
        return None
    args = method.args
    positional = (args.posonlyargs + args.args)[1:]
    if len(call.args) != len(positional) or len(call.keywords) != len(args.kwonlyargs):
        return None
    passed = zip(call.args, positional)
    if not all(isinstance(value, ast.Name) and value.id == p.arg for value, p in passed):
        return None
    keywords = zip(call.keywords, args.kwonlyargs)
    if not all(k.arg == p.arg and isinstance(k.value, ast.Name) and k.value.id == p.arg for k, p in keywords):
        return None
    return call.func.attr


def shadowed(klass, name):
    for node in ast.walk(klass):
        if isinstance(node, ast.Attribute) and isinstance(node.ctx, ast.Store) and node.attr == name:
            return True
        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            if any(isinstance(target, ast.Name) and target.id == name for target in targets):
                return True
    return False


def aliases(klass):
    if klass.bases or klass.keywords or klass.decorator_list or any(
        isinstance(node, ast.FunctionDef) and node.name in {"__getattribute__", "__getattr__"}
        for node in klass.body
    ):
        return []
    methods = [node for node in klass.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))]
    found = []
    for method in methods:
        if not plain(method):
            continue
        target_name = forwarded(method)
        targets = [other for other in methods if other.name == target_name]
        if len(targets) != 1 or sum(other.name == method.name for other in methods) != 1:
            continue
        target = targets[0]
        if target is not method and plain(target) and not shadowed(klass, target.name) and not shadowed(klass, method.name) and contract(method) == contract(target):
            found.append((method, target))
    return found


def owner_name(klass, parents):
    names = [klass.name]
    ancestor = parents.get(id(klass))
    while ancestor is not None:
        if isinstance(ancestor, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            names.append(ancestor.name)
        ancestor = parents.get(id(ancestor))
    return ".".join(reversed(names))


def check(context):
    if context.tests or context.path in context.options.get("generatedFiles", []):
        return []
    findings = []
    for klass in ast.walk(context.tree):
        if not isinstance(klass, ast.ClassDef):
            continue
        owner = owner_name(klass, context.parents)
        for method, target in aliases(klass):
            subject = f"{owner}.{method.name} -> {owner}.{target.name}"
            findings.append(finding(context.path, RULE, subject, method))
    return findings
