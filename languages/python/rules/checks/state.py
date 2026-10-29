import ast

from checks.common import (
    dotted_name,
    finding,
    functions_of,
    own_nodes,
    parameter_names,
)
from index.tables import assigned_pairs, tables_of

MUTATING_METHODS = {
    "append",
    "appendleft",
    "extend",
    "extendleft",
    "insert",
    "pop",
    "popitem",
    "popleft",
    "remove",
    "clear",
    "update",
    "setdefault",
    "add",
    "discard",
    "sort",
    "reverse",
    "put",
    "put_nowait",
    "difference_update",
    "intersection_update",
    "symmetric_difference_update",
}
SELF_NAMES = {"self", "cls"}


def local_names(function):
    names = parameter_names(function)
    declared = set()
    for node in ast.walk(function):
        if isinstance(node, (ast.Global, ast.Nonlocal)):
            declared.update(node.names)
        elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            names.add(node.id)
    return names - declared


def strip_subscripts(node):
    while isinstance(node, ast.Subscript):
        node = node.value
    return node


def alias_targets(scope):
    values, methods = {}, {}
    for node in ast.walk(scope):
        for target, value in assigned_pairs(node):
            if not isinstance(target, ast.Name):
                continue
            if isinstance(value, ast.Attribute) and value.attr in MUTATING_METHODS:
                methods[target.id] = value.value
            elif isinstance(value, (ast.Name, ast.Attribute)):
                values[target.id] = value
    return values, methods


def mutations_of(node, methods):
    targets = []
    if isinstance(node, ast.Assign):
        targets = node.targets
    elif isinstance(node, (ast.AugAssign, ast.AnnAssign)):
        targets = [node.target]
    elif isinstance(node, ast.Delete):
        targets = node.targets
    for target in targets:
        if isinstance(target, ast.Subscript):
            yield strip_subscripts(target), "item"
        elif isinstance(target, ast.Attribute):
            yield target.value, "attribute"
    if isinstance(node, ast.Call):
        function = node.func
        if isinstance(function, ast.Attribute) and function.attr in MUTATING_METHODS:
            yield strip_subscripts(function.value), "item"
        elif isinstance(function, ast.Name) and function.id in methods:
            yield methods[function.id], "item"
        elif isinstance(function, ast.Name) and function.id in {"setattr", "delattr"}:
            if node.args:
                yield node.args[0], "attribute"


class Scope:
    def __init__(self, context, function, owner):
        self.context = context
        self.function = function
        self.owner = owner
        self.locals = local_names(function)
        self.aliases, self.methods = alias_targets(function)
        module_aliases, module_methods = alias_targets(context.tree)
        self.aliases = {**module_aliases, **self.aliases}
        self.methods = {**module_methods, **self.methods}

    def dotted(self, expression):
        expression = strip_subscripts(expression)
        for _ in range(3):
            root = expression
            while isinstance(root, ast.Attribute):
                root = root.value
            if isinstance(root, ast.Name) and root.id in self.aliases:
                tail = (dotted_name(expression, self.context.aliases) or "")[
                    len(root.id) :
                ]
                base = dotted_name(self.aliases[root.id], self.context.aliases) or ""
                return base + tail
            break
        return dotted_name(expression, self.context.aliases) or ""

    def resolve(self, text):
        first = text.split(".")[0]
        if first in SELF_NAMES and self.owner is not None:
            name, instance_attributes = self.owner
            attribute = text.split(".")[1] if "." in text else None
            if first == "self" and attribute in instance_attributes:
                return None
            text = name + text[len(first) :]
        elif first in self.locals and first not in self.aliases:
            return None
        return text


def lookup(text, kind, scope):
    project, context = scope.context.project, scope.context
    candidates = [text]
    if "." in text:
        candidates.append(text.rsplit(".", 1)[0])
    for candidate in candidates:
        collections, instances, attributes = tables_of(project, context.path)
        if candidate == text and kind == "item" and (candidate in attributes):
            return candidate
        if candidate in collections and candidate == text and kind == "item":
            return candidate
        if candidate in instances and (candidate != text or kind == "attribute"):
            return candidate
        located = project.locate(candidate) if "." in candidate else None
        if located is None or located[0] not in project.contexts:
            continue
        collections, instances, _ = tables_of(project, located[0])
        if located[1] in collections and candidate == text and kind == "item":
            return located[1]
        if located[1] in instances and (candidate != text or kind == "attribute"):
            return located[1]
    return None


def function_findings(context, function, owner):
    scope = Scope(context, function, owner)
    found = []
    for node in own_nodes(function):
        for expression, kind in mutations_of(node, scope.methods):
            text = scope.resolve(scope.dotted(expression))
            name = lookup(text, kind, scope) if text else None
            if name is not None:
                subject = f"{name} in {function.name}"
                found.append(
                    finding(context.path, "module-level-mutable-state", subject, node)
                )
    return found


def instance_attributes(owner):
    return {
        target.attr
        for node in ast.walk(owner)
        for target in getattr(node, "targets", [getattr(node, "target", None)])
        if isinstance(target, ast.Attribute)
        and isinstance(target.value, ast.Name)
        and target.value.id == "self"
    }


def owner_of(function, parents):
    parent = parents.get(id(function))
    if not isinstance(parent, ast.ClassDef):
        return None
    return parent.name, instance_attributes(parent)


def check(context):
    if context.tests:
        return []
    found = []
    for function in functions_of(context.tree):
        found.extend(
            function_findings(context, function, owner_of(function, context.parents))
        )
    return found
