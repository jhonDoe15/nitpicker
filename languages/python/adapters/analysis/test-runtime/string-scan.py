import ast
import json
import re
import sys


DOTTED_NAME = re.compile(r"^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$")
IMPORT_CALLS = {
    "importlib.import_module",
    "import_module",
    "__import__",
    "importlib.util.find_spec",
    "find_spec",
    "runpy.run_module",
    "run_module",
}
PATCH_BASES = ("patch", "mock.patch", "unittest.mock.patch", "mocker.patch")
PATCH_CALLS = {
    f"{base}{suffix}" for base in PATCH_BASES for suffix in ("", ".dict", ".multiple")
}
MONKEYPATCH_CALLS = {"monkeypatch.setattr", "monkeypatch.delattr"}
FIRST_ARGUMENT_CALLS = IMPORT_CALLS | PATCH_CALLS | MONKEYPATCH_CALLS
PLUGINS = "pytest_plugins"
MODULE_FLAG = "-m"
FIXTURE_DECORATORS = {"fixture", "yield_fixture"}
USEFIXTURES = "usefixtures"
IMPLICIT_PARAMETERS = {"self", "cls", "request"}


def constant_text(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def is_container(node):
    return isinstance(node, (ast.List, ast.Tuple, ast.Set))


def dotted_callee(node):
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
        return ".".join(reversed(parts))
    return None


def module_flag_names(call):
    containers = [value for value in call.args if is_container(value)]
    containers.extend(k.value for k in call.keywords if is_container(k.value))
    names = []
    for container in containers:
        items = container.elts
        for index in range(1, len(items)):
            if constant_text(items[index - 1]) == MODULE_FLAG:
                names.append(constant_text(items[index]))
    return names


def module_names(call):
    names = module_flag_names(call)
    if dotted_callee(call.func) in FIRST_ARGUMENT_CALLS and call.args:
        names.append(constant_text(call.args[0]))
    return [text for text in names if text and DOTTED_NAME.match(text)]


def plugin_names(tree):
    names = []
    for node in tree.body:
        targets = node.targets if isinstance(node, ast.Assign) else [getattr(node, "target", None)]
        if not any(isinstance(target, ast.Name) and target.id == PLUGINS for target in targets):
            continue
        value = getattr(node, "value", None)
        items = value.elts if is_container(value) else [value]
        names.extend(text for text in map(constant_text, items) if text and DOTTED_NAME.match(text))
    return names


def fixture_decorator(function):
    for decorator in function.decorator_list:
        call = decorator if isinstance(decorator, ast.Call) else None
        callee = dotted_callee(call.func if call else decorator)
        if callee is not None and callee.split(".")[-1] in FIXTURE_DECORATORS:
            return call or True
    return None


def keyword_value(call, name):
    if not isinstance(call, ast.Call):
        return None
    return next((k.value for k in call.keywords if k.arg == name), None)


def parameters(function):
    arguments = function.args
    every = [*arguments.posonlyargs, *arguments.args, *arguments.kwonlyargs]
    return [a.arg for a in every if a.arg not in IMPLICIT_PARAMETERS]


def functions_of(body):
    for node in body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            yield node
        elif isinstance(node, ast.ClassDef):
            yield from functions_of(node.body)


def fixture_of(function, decorator):
    custom = constant_text(keyword_value(decorator, "name"))
    autouse = keyword_value(decorator, "autouse")
    return {
        "name": custom or function.name,
        "autouse": isinstance(autouse, ast.Constant) and autouse.value is True,
        "requests": sorted(set(parameters(function))),
    }


def fixtures_and_requests(tree):
    fixtures = []
    requests = set()
    for function in functions_of(tree.body):
        decorator = fixture_decorator(function)
        if decorator is None:
            requests.update(parameters(function))
        else:
            fixtures.append(fixture_of(function, decorator))
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and (dotted_callee(node.func) or "").endswith(USEFIXTURES):
            requests.update(text for text in map(constant_text, node.args) if text)
    return fixtures, sorted(requests)


def mark_names(tree):
    marks = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and dotted_callee(node.value) == "pytest.mark":
            marks.add(node.attr)
    return sorted(marks)


def literals_of(tree):
    strings = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            strings.update(module_names(node))
    fixtures, requests = fixtures_and_requests(tree)
    return {
        "strings": sorted(strings),
        "plugins": sorted(set(plugin_names(tree))),
        "fixtures": fixtures,
        "requests": requests,
        "marks": mark_names(tree),
    }


def scan_file(root, relative):
    try:
        with open(f"{root}/{relative}", "rb") as handle:
            return literals_of(ast.parse(handle.read(), relative))
    except (SyntaxError, ValueError, RecursionError, OSError):
        return None


def scan(root, files, modules):
    scanned = {}
    pending = list(files)
    queued = set(pending)
    for relative in pending:
        found = scan_file(root, relative)
        if found is None:
            continue
        if any(found.values()):
            scanned[relative] = found
        for plugin in found["plugins"]:
            target = modules.get(plugin)
            if target is not None and target not in queued:
                queued.add(target)
                pending.append(target)
    return scanned


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as handle:
        request = json.load(handle)
    json.dump(scan(request["root"], request["files"], request.get("modules", {})), sys.stdout)
