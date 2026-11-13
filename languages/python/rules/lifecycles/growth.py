import ast
import re

from checks.common import finding
from lifecycles.scopes import attribute_aliases, class_closers, methods_of, self_attribute

RULE = "unbounded-collection"
CONTAINER_CALLS = {"dict", "defaultdict", "OrderedDict", "list", "set", "Counter"}
ADDING = {"append", "add", "setdefault", "update", "extend", "insert", "appendleft"}
REMOVING = {"pop", "popitem", "remove", "discard", "clear", "popleft"}
REGISTRY_METHOD = re.compile(r"^(?:__init__|__post_init__|init\w*|_init\w*|register\w*|_register\w*|setup\w*|configure\w*|on\w*init\w*)$", re.IGNORECASE)
CONTAINER_ANNOTATIONS = re.compile(r"^(?:typing\.)?(?:dict|Dict|set|Set|list|List|defaultdict|OrderedDict|Counter)\b")


def is_container(value, annotation):
    if isinstance(value, (ast.Dict, ast.List, ast.Set, ast.DictComp, ast.ListComp, ast.SetComp)):
        return True
    if isinstance(value, ast.Call):
        func = value.func
        name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")
        if name in CONTAINER_CALLS:
            return True
        if name == "field":
            return any(
                keyword.arg == "default_factory"
                and getattr(keyword.value, "id", "") in CONTAINER_CALLS
                for keyword in value.keywords
            )
    return value is None and annotation is not None and bool(
        CONTAINER_ANNOTATIONS.match(ast.unparse(annotation))
    )


def attributes(cls):
    found = {}
    for node in ast.walk(cls):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                name = self_attribute(target) or (
                    target.id if isinstance(target, ast.Name) and node in cls.body else None
                )
                if name is not None and is_container(node.value, None):
                    found.setdefault(name, node)
        elif isinstance(node, ast.AnnAssign):
            name = self_attribute(node.target) or (
                node.target.id if isinstance(node.target, ast.Name) and node in cls.body else None
            )
            if name is not None and is_container(node.value, node.annotation):
                found.setdefault(name, node)
    return found


def is_literal(node):
    return isinstance(node, ast.Constant) or (
        isinstance(node, ast.JoinedStr) and not any(isinstance(v, ast.FormattedValue) for v in node.values)
    )


def attribute_of(node):
    return self_attribute(node)


def adds_in(method, name):
    for node in ast.walk(method):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Subscript) and attribute_of(target.value) == name:
                    if not is_literal(target.slice):
                        return node
        elif isinstance(node, ast.AugAssign) and attribute_of(node.target) == name:
            return node
        elif (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in ADDING
            and attribute_of(node.func.value) == name
            and node.args
            and not is_literal(node.args[0])
        ):
            return node
    return None


def holds(node, name, aliases):
    if isinstance(node, ast.Name):
        return aliases.get(node.id) == name
    return attribute_of(node) == name


def flat_targets(node):
    for target in node.targets:
        if isinstance(target, (ast.Tuple, ast.List)):
            yield from target.elts
        else:
            yield target


def removes_in(method, name):
    aliases = attribute_aliases(method)
    for node in ast.walk(method):
        if isinstance(node, ast.Delete):
            for target in node.targets:
                base = target.value if isinstance(target, ast.Subscript) else target
                if attribute_of(base) == name:
                    return True
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in REMOVING
            and holds(node.func.value, name, aliases)
        ):
            return True
        if isinstance(node, ast.Call) and any(attribute_of(arg) == name for arg in node.args):
            return True
        if isinstance(node, ast.Assign) and method.name != "__init__":
            if any(holds(t, name, aliases) for t in flat_targets(node)):
                return True
        if isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Subscript) and isinstance(t.slice, ast.Slice) and attribute_of(t.value) == name
            for t in node.targets
        ):
            return True
    return False


def bounded_in(method, name):
    return any(
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "len"
        and node.args
        and attribute_of(node.args[0]) == name
        for node in ast.walk(method)
    )


def check(context):
    if context.tests:
        return []
    found = []
    for cls in (node for node in ast.walk(context.tree) if isinstance(node, ast.ClassDef)):
        methods = methods_of(cls)
        if not class_closers(cls):
            continue
        for name, node in attributes(cls).items():
            adders = [
                (method, adds_in(method, name))
                for method in methods
                if not REGISTRY_METHOD.match(method.name)
            ]
            adders = [(method, add) for method, add in adders if add is not None]
            if not adders or any(removes_in(method, name) for method in methods):
                continue
            if any(bounded_in(method, name) for method, _ in adders):
                continue
            subject = f"{cls.name}.{name}: grows in {adders[0][0].name}"
            found.append(finding(context.path, RULE, subject, node))
    return found
