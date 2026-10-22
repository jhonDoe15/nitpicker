import ast

FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
SCOPES = (*FUNCTIONS, ast.ClassDef)
BLOCKS = tuple(
    getattr(ast, name) for name in ("stmt", "excepthandler", "match_case") if hasattr(ast, name)
)
RECORD_DECORATORS = {"dataclass", "s", "attrs", "define", "frozen", "mutable"}
RECORD_BASES = {"NamedTuple", "TypedDict"}
ABSTRACT_BASES = {"ABC", "ABCMeta"}


def blocks_of(node):
    return [child for child in ast.iter_child_nodes(node) if isinstance(child, BLOCKS)]


def decorator_name(decorator):
    called = decorator.func if isinstance(decorator, ast.Call) else decorator
    return getattr(called, "id", getattr(called, "attr", None))


def has_decorator(function, name):
    return any(decorator_name(decorator) == name for decorator in function.decorator_list)


def first_line(node):
    return min([node.lineno] + [item.lineno for item in node.decorator_list])


def written_name(node):
    if isinstance(node, ast.Subscript):
        return written_name(node.value)
    if isinstance(node, ast.Attribute):
        owner = written_name(node.value)
        return None if owner is None else owner + "." + node.attr
    return node.id if isinstance(node, ast.Name) else None


def last_segment(node):
    return (written_name(node) or "").split(".")[-1]


def is_class_var(annotation):
    return last_segment(annotation) == "ClassVar"


def self_target(target):
    return (
        isinstance(target, ast.Attribute)
        and isinstance(target.value, ast.Name)
        and target.value.id == "self"
    )


def self_attributes(function):
    names = set()
    pending = list(ast.iter_child_nodes(function))
    while pending:
        node = pending.pop()
        if isinstance(node, ast.ClassDef):
            continue
        pending.extend(ast.iter_child_nodes(node))
        targets = node.targets if isinstance(node, ast.Assign) else []
        if isinstance(node, (ast.AnnAssign, ast.AugAssign)):
            targets = [node.target]
        names.update(target.attr for target in targets if self_target(target))
    return names


def is_abstract(method):
    return has_decorator(method, "abstractmethod")


def class_kind(node, methods):
    bases = {last_segment(base) for base in node.bases}
    metaclasses = {last_segment(k.value) for k in node.keywords if k.arg == "metaclass"}
    if "Protocol" in bases:
        return "protocol"
    if bases & RECORD_BASES or any(
        decorator_name(decorator) in RECORD_DECORATORS for decorator in node.decorator_list
    ):
        return "record"
    abstract = (bases | metaclasses) & ABSTRACT_BASES
    return "interface" if abstract and all(map(is_abstract, methods)) else "class"


def class_fields(node, methods):
    fields = set()
    for child in node.body:
        if isinstance(child, ast.AnnAssign) and isinstance(child.target, ast.Name):
            if not is_class_var(child.annotation):
                fields.add(child.target.id)
    for method in methods:
        fields |= self_attributes(method)
    return fields


def class_entry(node, owners):
    methods = [child for child in node.body if isinstance(child, FUNCTIONS)]
    kind = class_kind(node, methods)
    counted = [method for method in methods if not has_decorator(method, "overload")]
    fields = set() if kind in ("protocol", "interface") else class_fields(node, methods)
    return {
        "name": ".".join(owner.name for owner in (*owners, node)),
        "start": first_line(node),
        "kind": kind,
        "methods": sum(method.name != "__init__" for method in counted),
        "fields": len(fields),
        "bases": [name for name in map(written_name, node.bases) if name is not None],
    }


def class_entries(module):
    entries = []
    pending = [(child, ()) for child in reversed(blocks_of(module))]
    while pending:
        node, owners = pending.pop()
        if isinstance(node, ast.ClassDef):
            entries.append(class_entry(node, owners))
        inner = (*owners, node) if isinstance(node, SCOPES) else owners
        pending.extend((child, inner) for child in reversed(blocks_of(node)))
    return entries
