import ast

from checks.common import dotted_name, finding, functions_of, own_nodes

MUTABLE_CONSTRUCTORS = {
    "dict",
    "list",
    "set",
    "bytearray",
    "dict.fromkeys",
    "collections.defaultdict",
    "collections.OrderedDict",
    "collections.Counter",
    "collections.deque",
    "collections.ChainMap",
    "collections.UserDict",
    "collections.UserList",
    "weakref.WeakValueDictionary",
    "weakref.WeakKeyDictionary",
    "weakref.WeakSet",
    "queue.Queue",
    "queue.LifoQueue",
    "queue.PriorityQueue",
    "queue.SimpleQueue",
    "array.array",
    "defaultdict",
    "OrderedDict",
    "Counter",
    "deque",
}
INSTANCE_FACTORIES = {"types.SimpleNamespace", "SimpleNamespace"}
IMMUTABLE_BASES = {
    "Enum",
    "IntEnum",
    "StrEnum",
    "Flag",
    "IntFlag",
    "NamedTuple",
    "TypedDict",
    "Protocol",
    "Exception",
    "BaseException",
}
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


def is_mutable_value(node, aliases):
    if isinstance(
        node, (ast.Dict, ast.List, ast.Set, ast.DictComp, ast.ListComp, ast.SetComp)
    ):
        return True
    if isinstance(node, ast.Call):
        function = (
            node.func.value if isinstance(node.func, ast.Subscript) else node.func
        )
        return dotted_name(function, aliases) in MUTABLE_CONSTRUCTORS
    return False


def is_frozen(node):
    return any(
        isinstance(decorator, ast.Call)
        and any(
            keyword.arg == "frozen"
            and isinstance(keyword.value, ast.Constant)
            and keyword.value.value is True
            for keyword in decorator.keywords
        )
        for decorator in node.decorator_list
    )


def is_mutable_class(node, aliases):
    bases = {
        (dotted_name(base, aliases) or "").rsplit(".", 1)[-1] for base in node.bases
    }
    return not is_frozen(node) and not (
        bases & IMMUTABLE_BASES or any(base.endswith("Error") for base in bases)
    )


def assigned_pairs(statement):
    if isinstance(statement, ast.AnnAssign) and statement.value is not None:
        return [(statement.target, statement.value)]
    if not isinstance(statement, ast.Assign):
        return []
    pairs = []
    for target in statement.targets:
        value = statement.value
        if isinstance(target, ast.Tuple) and isinstance(value, ast.Tuple):
            pairs.extend(zip(target.elts, value.elts))
        else:
            pairs.append((target, value))
    return pairs


def class_attributes(node, aliases):
    if is_frozen(node) or not is_mutable_class(node, aliases) or node.decorator_list:
        return {}
    found = {}
    for statement in node.body:
        for target, value in assigned_pairs(statement):
            if isinstance(target, ast.Name) and is_mutable_value(value, aliases):
                found[f"{node.name}.{target.id}"] = statement
    return found


def project_class(call, context):
    name = dotted_name(call.func, context.aliases) or ""
    if name in INSTANCE_FACTORIES:
        return True
    located = context.project.locate(name) if "." in name else (context.path, name)
    owner = context.project.contexts.get(located[0]) if located else None
    if owner is None:
        return False
    return any(
        isinstance(node, ast.ClassDef)
        and node.name == located[1]
        and is_mutable_class(node, owner.aliases)
        for node in owner.tree.body
    )


def module_tables(context):
    collections, instances, attributes = {}, {}, {}
    for statement in context.tree.body:
        for target, value in assigned_pairs(statement):
            if not isinstance(target, ast.Name) or target.id == "__all__":
                continue
            if is_mutable_value(value, context.aliases):
                collections.setdefault(target.id, statement)
            elif isinstance(value, ast.Call) and project_class(value, context):
                instances.setdefault(target.id, statement)
        if isinstance(statement, ast.ClassDef):
            attributes.update(class_attributes(statement, context.aliases))
    return collections, instances, attributes


def tables_of(project, path):
    def build(_):
        return module_tables(project.contexts[path])

    return project.memo(("state", path), build)


def local_names(function):
    arguments = function.args
    names = {
        argument.arg
        for argument in arguments.args + arguments.kwonlyargs + arguments.posonlyargs
    }
    names.update(a.arg for a in (arguments.vararg, arguments.kwarg) if a)
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
