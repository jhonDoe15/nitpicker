import ast

from checks.common import dotted_name, own_nodes
from security.resolve.scopes import lookup, values_of

PARTIALS = {"functools.partial", "functools.partialmethod", "partial", "partialmethod"}
MAX_DEPTH = 4


def keyword(call, name):
    return next((k.value for k in call.keywords if k.arg == name), None)


def argument(call, index, name):
    found = keyword(call, name)
    if found is None and index is not None and len(call.args) > index:
        found = call.args[index]
    return found


def has_double_star(call):
    return any(k.arg is None for k in call.keywords)


def text_of(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def partial_target(call, aliases):
    if not isinstance(call, ast.Call) or not call.args:
        return None
    if dotted_name(call.func, aliases) not in PARTIALS:
        return None
    if isinstance(call.args[0], ast.Starred):
        return None
    target = ast.Call(func=call.args[0], args=call.args[1:], keywords=call.keywords)
    return ast.copy_location(target, call)


def getattr_target(call):
    function = call.func if isinstance(call, ast.Call) else None
    if not (isinstance(function, ast.Name) and function.id == "getattr"):
        return None
    if len(call.args) < 2 or text_of(call.args[1]) is None:
        return None
    attribute = ast.Attribute(value=call.args[0], attr=call.args[1].value)
    return ast.copy_location(attribute, call)


def callee_of(node, where):
    target = partial_target(node, where.context.aliases)
    if target is not None:
        return target.func, target
    attribute = getattr_target(node)
    if attribute is not None:
        return attribute, None
    if isinstance(node, ast.Attribute):
        return node, None
    return None


def bound_callee(call, where):
    if not isinstance(call.func, ast.Name):
        return None
    values = values_of(call.func.id, where)
    if len(values) != 1:
        return None
    value, place = values[0]
    found = callee_of(value, place)
    if found is None:
        return None
    function, partial = found
    args = (partial.args if partial else []) + call.args
    keywords = (partial.keywords if partial else []) + call.keywords
    merged = ast.copy_location(
        ast.Call(func=function, args=args, keywords=keywords), call
    )
    return merged, place


def called_names(context):
    key = ("security-called-names", context.path)

    def build(_):
        return {
            node.func.id
            for node in ast.walk(context.tree)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
        }

    return context.project.memo(key, build)


def evaluated_at_definition(node, context):
    parent = context.parents.get(id(node))
    if not isinstance(parent, ast.Assign) or len(parent.targets) != 1:
        return True
    target = parent.targets[0]
    return isinstance(target, ast.Name) and target.id not in called_names(context)


class Entries:
    def __init__(self):
        self.items = []
        self.complete = True

    def add(self, key, value, where):
        if key is None:
            self.complete = False
        else:
            self.items.append((key, value, where))

    def extend(self, other):
        self.items.extend(other.items)
        self.complete = self.complete and other.complete


def dict_entries(node, where, depth=0):
    found = Entries()
    if depth > MAX_DEPTH or node is None:
        found.complete = False
    elif isinstance(node, ast.Dict):
        for key, value in zip(node.keys, node.values):
            if key is None:
                found.extend(dict_entries(value, where, depth + 1))
            else:
                found.add(text_of(key), value, where)
    elif (
        isinstance(node, ast.Call)
        and dotted_name(node.func, where.context.aliases) == "dict"
    ):
        for value in node.args:
            found.extend(dict_entries(value, where, depth + 1))
        found.extend(keyword_entries(node.keywords, where, depth + 1))
    elif isinstance(node, ast.Name):
        found.extend(name_entries(node.id, where, depth))
    else:
        found.complete = False
    return found


def keyword_entries(keywords, where, depth=0):
    found = Entries()
    for item in keywords:
        if item.arg is None:
            found.extend(dict_entries(item.value, where, depth + 1))
        else:
            found.add(item.arg, item.value, where)
    return found


def name_entries(name, where, depth):
    found = Entries()
    entries = lookup(name, where)
    if len(entries) != 1 or entries[0][0] != "value":
        found.complete = False
        return found
    _, value, place = entries[0]
    found.extend(dict_entries(value, place, depth + 1))
    found.extend(step_writes(name, place))
    return found


def step_writes(name, where):
    scope = where.scope if where.scope is not None else where.context.tree
    found = Entries()
    for node in own_nodes(scope):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if (
                    isinstance(target, ast.Subscript)
                    and isinstance(target.value, ast.Name)
                    and target.value.id == name
                ):
                    found.add(text_of(target.slice), node.value, where)
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            owner = node.func.value
            if isinstance(owner, ast.Name) and owner.id == name:
                found.extend(method_writes(node, where))
    return found


def method_writes(call, where):
    found = Entries()
    if call.func.attr == "update":
        for value in call.args:
            found.extend(dict_entries(value, where, 1))
        found.extend(keyword_entries(call.keywords, where, 1))
    elif call.func.attr == "setdefault" and len(call.args) == 2:
        found.add(text_of(call.args[0]), call.args[1], where)
    elif call.func.attr in {"pop", "clear", "popitem"}:
        found.complete = found.complete and call.func.attr == "pop"
    return found


def call_keywords(call, where):
    return keyword_entries(call.keywords, where)


def effective_calls(context, where_of):
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call):
            continue
        where = where_of(node, context)
        target = partial_target(node, context.aliases)
        if target is not None:
            if evaluated_at_definition(node, context):
                yield node, target, where, True
            continue
        merged = bound_callee(node, where)
        if merged is not None:
            place = where if merged[1].context is context else merged[1]
            yield node, merged[0], place, True
        else:
            yield node, node, where, False
