import ast

from checks.common import own_nodes

SKIPPED = (ast.Lambda, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
LAZY = (ast.GeneratorExp,)
EAGER_COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.DictComp)


class Event:
    def __init__(self, kind, text, node, arms):
        self.kind = kind
        self.text = text
        self.node = node
        self.arms = arms


def is_pure_chain(node):
    while isinstance(node, (ast.Attribute, ast.Subscript)):
        node = node.value
    return isinstance(node, ast.Name)


def chain_slices(node):
    slices = []
    while isinstance(node, (ast.Attribute, ast.Subscript)):
        if isinstance(node, ast.Subscript):
            slices.append(node.slice)
        node = node.value
    return slices[::-1]


def same_path(first, second):
    shared = dict(first.arms)
    return all(shared.get(key, arm) == arm for key, arm in second.arms)


def comprehension_parts(node):
    first = node.generators[0]
    yield first.iter
    for index, generator in enumerate(node.generators):
        if index > 0:
            yield generator.iter
        yield from generator.ifs
        if generator.is_async:
            yield generator
    if isinstance(node, ast.DictComp):
        yield node.key
        yield node.value
    else:
        yield node.elt


def walk(node, arms, events):
    if isinstance(node, SKIPPED):
        return
    if isinstance(node, ast.comprehension):
        events.append(Event("await", None, node, arms))
    elif isinstance(node, (ast.Attribute, ast.Subscript, ast.Name)) and isinstance(
        getattr(node, "ctx", None), ast.Load
    ):
        walk_read(node, arms, events)
    elif isinstance(node, ast.Await):
        walk(node.value, arms, events)
        events.append(Event("await", None, node, arms))
    elif isinstance(node, ast.IfExp):
        walk(node.test, arms, events)
        walk(node.body, arms + ((id(node), 0),), events)
        walk(node.orelse, arms + ((id(node), 1),), events)
    elif isinstance(node, ast.NamedExpr):
        walk(node.value, arms, events)
    elif isinstance(node, ast.Dict):
        for key, value in zip(node.keys, node.values):
            if key is not None:
                walk(key, arms, events)
            walk(value, arms, events)
    elif isinstance(node, EAGER_COMPREHENSIONS):
        for part in comprehension_parts(node):
            walk(part, arms, events)
    elif isinstance(node, LAZY):
        walk(node.generators[0].iter, arms, events)
    else:
        for child in ast.iter_child_nodes(node):
            walk(child, arms, events)


def walk_read(node, arms, events):
    if is_pure_chain(node):
        for part in chain_slices(node):
            walk(part, arms, events)
        events.append(Event("read", ast.unparse(node), node, arms))
        return
    for child in ast.iter_child_nodes(node):
        walk(child, arms, events)


def events_of(expression):
    events = []
    walk(expression, (), events)
    return events


def suspends(node):
    nodes = [node, *own_nodes(node)]
    return any(
        isinstance(item, (ast.Await, ast.AsyncFor, ast.AsyncWith))
        or (isinstance(item, ast.comprehension) and item.is_async)
        for item in nodes
    )
