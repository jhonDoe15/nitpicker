import ast

from checks.common import dotted_name, own_nodes

PATH_FACTORIES = {
    "pathlib.Path",
    "pathlib.PurePath",
    "pathlib.PurePosixPath",
    "pathlib.PosixPath",
    "Path",
    "PurePath",
    "os.path.join",
    "posixpath.join",
    "ntpath.join",
}
SAFE_CALLS = {
    "int",
    "float",
    "bool",
    "len",
    "hash",
    "uuid.UUID",
    "UUID",
    "os.path.basename",
    "posixpath.basename",
    "basename",
    "secure_filename",
    "werkzeug.utils.secure_filename",
}
SAFE_ATTRIBUTES = {"name", "stem", "suffix", "suffixes"}
PATHLIKE_ATTRIBUTES = {
    "filename",
    "file_name",
    "filepath",
    "file_path",
    "path",
    "relative_path",
    "rel_path",
    "subpath",
    "folder",
    "directory",
    "dirname",
    "slug",
    "upload_name",
    "archive_name",
    "member",
}
SAFE_ANNOTATIONS = {
    "int",
    "float",
    "bool",
    "UUID",
    "Decimal",
    "date",
    "datetime",
    "Literal",
    "Enum",
    "IntEnum",
    "StrEnum",
}
LISTING_CALLS = {"os.listdir", "os.scandir", "os.walk"}
MUTATING_METHODS = {"append", "extend", "insert", "add", "update", "__setitem__"}
KEEPING_CALLS = {"sorted", "list", "reversed", "tuple"}
MAX_DEPTH = 6


def annotation_names(annotation, aliases):
    nodes = (
        n for n in ast.walk(annotation) if isinstance(n, (ast.Name, ast.Attribute))
    )
    return {(dotted_name(node, aliases) or "").rsplit(".", 1)[-1] for node in nodes}


def tainted_parameters(function, aliases):
    arguments = function.args
    every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
    return {
        a.arg
        for a in every
        if a.arg not in {"self", "cls"}
        and (
            a.annotation is None
            or not annotation_names(a.annotation, aliases) & SAFE_ANNOTATIONS
        )
    }


def mutate(call, add):
    func = call.func
    if (
        isinstance(func, ast.Attribute)
        and func.attr in MUTATING_METHODS
        and isinstance(func.value, ast.Name)
    ):
        for argument in call.args:
            add(func.value, argument)


def assignments_of(scope):
    values = {}

    def add(target, value):
        if isinstance(target, ast.Name):
            values.setdefault(target.id, []).append(value)
        elif isinstance(target, (ast.Tuple, ast.List)):
            for element in target.elts:
                add(element, value)

    for node in own_nodes(scope):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                add(target, node.value)
        elif isinstance(node, (ast.AnnAssign, ast.NamedExpr)) and node.value:
            add(node.target, node.value)
        elif isinstance(node, (ast.For, ast.AsyncFor, ast.comprehension)):
            add(node.target, node.iter)
        elif isinstance(node, ast.AugAssign):
            add(node.target, node.value)
        elif isinstance(node, ast.Call):
            mutate(node, add)
    return values


class Taint:
    def __init__(self, parameters, assignments, context, factories=None):
        self.parameters = parameters
        self.assignments = assignments
        self.aliases = context.aliases
        self.context = context
        self.factories = factories or set()

    def listing_of(self, node, depth=0):
        if isinstance(node, ast.Name) and depth < MAX_DEPTH:
            found = [self.listing_of(v, depth + 1) for v in self.assignments.get(node.id, [])]
            return found[0] if found and all(f is found[0] for f in found) else None
        while (
            isinstance(node, ast.Call)
            and dotted_name(node.func, self.aliases) in KEEPING_CALLS
            and node.args
        ):
            node = node.args[0]
        if not (isinstance(node, ast.Call) and node.args):
            return None
        if dotted_name(node.func, self.aliases) not in LISTING_CALLS:
            return None
        return node

    def listings_of(self, name):
        found = [self.listing_of(v) for v in self.assignments.get(name.id, [])]
        return found if found and all(found) else []

    def plain_path(self, node):
        while (
            isinstance(node, ast.Call)
            and dotted_name(node.func, self.aliases) in PATH_FACTORIES
            and len(node.args) == 1
        ):
            node = node.args[0]
        return node

    def is_listed_base(self, base, listing):
        base = self.plain_path(base)
        if ast.dump(base) == ast.dump(self.plain_path(listing.args[0])):
            return True
        return isinstance(base, ast.Name) and any(
            self.listing_of(v) is listing for v in self.assignments.get(base.id, [])
        )

    def is_listed_entry(self, base, segment):
        if base is None or not isinstance(segment, ast.Name):
            return False
        listings = self.listings_of(segment)
        return bool(listings) and all(
            self.is_listed_base(base, listing) for listing in listings
        )

    def is_unsafe_segment(self, base, segment):
        return self.is_tainted(segment) and not self.is_listed_entry(base, segment)

    def is_tainted(self, node, depth=0):
        if depth > MAX_DEPTH or node is None:
            return False
        if isinstance(node, ast.Name):
            return node.id in self.parameters or any(
                self.is_tainted(value, depth + 1)
                for value in self.assignments.get(node.id, [])
            )
        if isinstance(node, ast.Attribute):
            return self.attribute_tainted(node, depth)
        if isinstance(node, ast.Call):
            return self.call_tainted(node, depth)
        children = [c for c in ast.iter_child_nodes(node) if isinstance(c, ast.expr)]
        return any(self.is_tainted(child, depth + 1) for child in children)

    def attribute_tainted(self, node, depth):
        if node.attr in SAFE_ATTRIBUTES:
            return False
        if isinstance(node.value, ast.Name) and node.value.id in self.parameters:
            return node.attr in PATHLIKE_ATTRIBUTES
        return self.is_tainted(node.value, depth + 1)

    def call_tainted(self, node, depth):
        if dotted_name(node.func, self.aliases) in SAFE_CALLS:
            return False
        parts = [*node.args, *[k.value for k in node.keywords]]
        if isinstance(node.func, ast.Attribute):
            parts.append(node.func.value)
        return any(self.is_tainted(part, depth + 1) for part in parts)

    def builds_from_parameter(self, node, depth=0):
        if depth > MAX_DEPTH or node is None:
            return False
        if isinstance(node, ast.Name):
            return any(
                self.builds_from_parameter(v, depth + 1)
                for v in self.assignments.get(node.id, [])
            )
        if isinstance(node, ast.BinOp) and isinstance(
            node.op, (ast.Div, ast.Add, ast.Mod)
        ):
            return self.is_unsafe_segment(node.left, node.right) or (
                self.builds_from_parameter(node.left, depth + 1)
            )
        if isinstance(node, ast.JoinedStr):
            return self.joined_unsafe(node)
        if isinstance(node, ast.Call):
            return self.call_builds(node, depth)
        if isinstance(node, ast.Attribute):
            return self.builds_from_parameter(node.value, depth + 1)
        return False

    def joined_unsafe(self, node):
        values = [v.value for v in node.values if isinstance(v, ast.FormattedValue)]
        leads = isinstance(node.values[0], ast.FormattedValue)
        base = values[0] if leads and values else None
        listed = leads and any(self.is_listed_entry(base, v) for v in values[1:])
        segments = values[1:] if listed else values
        return any(self.is_unsafe_segment(base, v) for v in segments)

    def call_builds(self, node, depth):
        name = dotted_name(node.func, self.aliases)
        if name in PATH_FACTORIES:
            return (
                any(self.is_unsafe_segment(node.args[0], arg) for arg in node.args[1:])
                or any(
                    self.builds_from_parameter(arg, depth + 1) for arg in node.args[:1]
                )
                or any(
                    isinstance(arg, ast.JoinedStr) and self.is_tainted(arg)
                    for arg in node.args
                )
            )
        if self.is_project_factory(node):
            return any(self.is_tainted(arg) for arg in node.args)
        if isinstance(node.func, ast.Attribute):
            if node.func.attr == "joinpath":
                return any(
                    self.is_unsafe_segment(node.func.value, arg) for arg in node.args
                ) or self.builds_from_parameter(node.func.value, depth + 1)
            return self.builds_from_parameter(node.func.value, depth + 1)
        return False

    def is_project_factory(self, node):
        name = dotted_name(node.func, self.aliases) or ""
        located = self.context.project.locate(name) if "." in name else None
        key = located if located else (self.context.path, name)
        return key in self.factories


def path_factories(project):
    def build(_):
        found = set()
        for path, context in project.contexts.items():
            for function in module_functions(context.tree):
                taint = Taint(
                    tainted_parameters(function, context.aliases),
                    assignments_of(function),
                    context,
                )
                if any(
                    isinstance(node, ast.Return)
                    and taint.builds_from_parameter(node.value)
                    for node in own_nodes(function)
                ):
                    found.add((path, function.name))
        return found

    return project.memo("path-factories", build)


def module_functions(tree):
    return [
        node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]
