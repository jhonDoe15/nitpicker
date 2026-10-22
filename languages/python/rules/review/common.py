import ast

FUNCTION_TYPES = (ast.FunctionDef, ast.AsyncFunctionDef)
SCOPE_TYPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
OPTIONAL_NAMES = {"Optional"}
WRAPPERS = {"NotRequired", "Required", "Annotated", "Final"}


def last_segment(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def parts_of(subscript):
    inner = subscript.slice
    index_type = getattr(ast, "Index", None)
    if index_type is not None and isinstance(inner, index_type):
        inner = inner.value
    return inner.elts if isinstance(inner, ast.Tuple) else [inner]


def is_none(node):
    return isinstance(node, ast.Constant) and node.value is None


def without_none(annotation):
    if isinstance(annotation, ast.BinOp) and isinstance(annotation.op, ast.BitOr):
        kept = [side for side in (annotation.left, annotation.right) if not is_none(side)]
        return kept[0] if len(kept) == 1 else annotation
    if isinstance(annotation, ast.Subscript) and last_segment(annotation.value) in OPTIONAL_NAMES:
        return parts_of(annotation)[0]
    return annotation


def parsed_annotation(annotation):
    if not (isinstance(annotation, ast.Constant) and isinstance(annotation.value, str)):
        return annotation
    try:
        return ast.parse(annotation.value.strip(), mode="eval").body
    except SyntaxError:
        return annotation


def unwrapped(annotation):
    annotation = parsed_annotation(annotation)
    while isinstance(annotation, ast.Subscript) and last_segment(annotation.value) in WRAPPERS:
        annotation = parsed_annotation(parts_of(annotation)[0])
    return parsed_annotation(without_none(annotation))


def positional(fn):
    return list(getattr(fn.args, "posonlyargs", [])) + list(fn.args.args)


def every_parameter(fn):
    return positional(fn) + list(fn.args.kwonlyargs)


def positional_defaults(fn):
    parameters = positional(fn)
    defaults = list(fn.args.defaults)
    return list(zip(parameters, [None] * (len(parameters) - len(defaults)) + defaults))


def defaulted_parameters(fn):
    found = [
        (parameter, index)
        for index, (parameter, default) in enumerate(positional_defaults(fn))
        if default is not None
    ]
    keyword_only = zip(fn.args.kwonlyargs, fn.args.kw_defaults)
    return found + [(parameter, None) for parameter, default in keyword_only if default is not None]


def same_node(left, right):
    if left is None or right is None:
        return left is right
    return ast.dump(left) == ast.dump(right)


def body_without_docstring(body):
    first = body[0] if body else None
    is_docstring = (
        isinstance(first, ast.Expr)
        and isinstance(first.value, ast.Constant)
        and isinstance(first.value.value, str)
    )
    return body[1:] if is_docstring else body


def scoped_definitions(tree):
    found = []
    pending = [(child, ()) for child in tree.body]
    while pending:
        node, scope = pending.pop()
        children = list(ast.iter_child_nodes(node))
        if isinstance(node, SCOPE_TYPES):
            scope = scope + (node.name,)
            found.append((node, scope))
        pending.extend((child, scope) for child in reversed(children))
    return found


def finding(rule, path, subject, line, data=None):
    entry = {"rule": rule, "path": path, "subject": subject, "line": line}
    if data is not None:
        entry["data"] = data
    return entry
