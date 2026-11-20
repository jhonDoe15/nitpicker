import ast

from checks.common import finding, shown

RULE = "case-mismatched-lookup"
NORMALIZERS = {"lower": "lower", "casefold": "lower", "upper": "upper"}
LOOKUPS = {"get", "pop", "index", "remove", "discard", "count"}
FILLS = {"add", "append"}
CONSTRUCTORS = {"set", "frozenset", "list", "tuple"}
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)


def normalized_key(node):
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in NORMALIZERS
        and not node.args
    ):
        return NORMALIZERS[node.func.attr], node.func.value
    return None


def has_case(text, casing):
    return text != (text.lower() if casing == "lower" else text.upper())


def literals_of(items):
    values = [item.value if isinstance(item, ast.Constant) else None for item in items]
    return values if values and all(isinstance(value, str) for value in values) else None


def literal_keys(node):
    if isinstance(node, (ast.Set, ast.List, ast.Tuple)):
        return literals_of(node.elts)
    if isinstance(node, ast.Dict):
        return literals_of([key for key in node.keys if key is not None])
    is_constructor = (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id in CONSTRUCTORS
        and len(node.args) == 1
    )
    return literal_keys(node.args[0]) if is_constructor else None


def scope_root(node, parents, member):
    current = parents.get(id(node))
    wanted = ast.ClassDef if member else FUNCTIONS
    while current is not None and not isinstance(current, wanted):
        current = parents.get(id(current))
    return current if current is not None else root_of(node, parents)


def root_of(node, parents):
    while id(node) in parents:
        node = parents[id(node)]
    return node


def single_assignment(root, name):
    values = [
        node.value
        for node in ast.walk(root)
        if isinstance(node, ast.Assign)
        and len(node.targets) == 1
        and isinstance(node.targets[0], ast.Name)
        and node.targets[0].id == name
    ]
    return values[0] if len(values) == 1 else None


def parameters_of(root):
    if not isinstance(root, FUNCTIONS):
        return set()
    arguments = root.args
    names = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
    return {argument.arg for argument in names}


def copies_parameter(value, root):
    names = parameters_of(root)
    if isinstance(value, ast.Call) and isinstance(value.func, ast.Name) and value.func.id in CONSTRUCTORS:
        return len(value.args) == 1 and isinstance(value.args[0], ast.Name) and value.args[0].id in names
    if isinstance(value, (ast.SetComp, ast.ListComp)) and len(value.generators) == 1:
        generator = value.generators[0]
        plain = isinstance(value.elt, ast.Name) and isinstance(generator.target, ast.Name)
        return (
            plain
            and value.elt.id == generator.target.id
            and not generator.ifs
            and isinstance(generator.iter, ast.Name)
            and generator.iter.id in names
        )
    return False


def original_case(collection, casing, parents):
    if not isinstance(collection, ast.Name):
        return False
    root = scope_root(collection, parents, False)
    value = single_assignment(root, collection.id)
    if value is None:
        value = single_assignment(root_of(root, parents), collection.id)
    if value is None:
        return False
    keys = literal_keys(value)
    if keys is not None:
        return any(has_case(key, casing) for key in keys)
    return copies_parameter(value, root)


def lookups(node):
    if isinstance(node, ast.Compare) and len(node.ops) == 1 and isinstance(node.ops[0], (ast.In, ast.NotIn)):
        yield node, node.left, node.comparators[0]
    elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        if node.func.attr in LOOKUPS and len(node.args) >= 1 and not isinstance(node.args[0], ast.Starred):
            yield node, node.args[0], node.func.value
    elif isinstance(node, ast.Subscript) and isinstance(node.ctx, ast.Load):
        yield node, node.slice, node.value


def filled_casing(node, key, collection, parents):
    if not isinstance(key, (ast.Name, ast.Attribute)):
        return None
    root = scope_root(node, parents, isinstance(collection, ast.Attribute))
    for each in ast.walk(root):
        is_fill = (
            isinstance(each, ast.Call)
            and isinstance(each.func, ast.Attribute)
            and each.func.attr in FILLS
            and len(each.args) == 1
            and ast.unparse(each.func.value) == ast.unparse(collection)
        )
        filled = normalized_key(each.args[0]) if is_fill else None
        if filled is not None and ast.unparse(filled[1]) == ast.unparse(key):
            return filled[0]
    return None


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        for site, key, collection in lookups(node):
            normalized = normalized_key(key)
            if normalized is not None:
                if original_case(collection, normalized[0], context.parents):
                    subject = f"original|{normalized[0]}|{shown(ast.unparse(collection), 40)}"
                    found.append(finding(context.path, RULE, subject, site))
                continue
            casing = filled_casing(site, key, collection, context.parents)
            if casing is not None:
                subject = f"raw|{casing}|{shown(ast.unparse(collection), 40)}|{shown(ast.unparse(key), 40)}"
                found.append(finding(context.path, RULE, subject, site))
    return found
