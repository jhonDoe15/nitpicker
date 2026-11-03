import ast

from checks.common import dotted_name

ANY_NAMES = {"Any", "typing.Any", "typing_extensions.Any"}
FUNCTIONAL_TYPES = {"TypedDict", "NamedTuple"}
PASSES = 3
ALIAS_VALUES = (
    ast.Subscript,
    ast.Name,
    ast.Attribute,
    ast.BinOp,
    ast.Constant,
)


def alias_statements(tree):
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            if isinstance(node.targets[0], ast.Name):
                yield node.targets[0].id, node.value
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            if isinstance(node.target, ast.Name):
                yield node.target.id, node.value
        elif type(node).__name__ == "TypeAlias":
            yield node.name.id, node.value


def mentions_any(expression, context, aliases):
    for node in ast.walk(expression):
        if isinstance(node, (ast.Name, ast.Attribute)):
            if is_any_reference(node, context, aliases):
                return True
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            if string_mentions_any(node.value, context, aliases):
                return True
    return False


def string_mentions_any(text, context, aliases):
    try:
        parsed = ast.parse(text.strip(), mode="eval").body
    except (SyntaxError, ValueError):
        return False
    return mentions_any(parsed, context, aliases)


def is_any_reference(node, context, aliases):
    name = dotted_name(node, context.aliases) or ""
    if name in ANY_NAMES:
        return True
    located = context.project.locate(name) if "." in name else None
    key = located if located else (context.path, name)
    return key in aliases


def any_aliases(project):
    def build(_):
        found = set()
        for _ in range(PASSES):
            for path, context in project.contexts.items():
                for name, value in alias_statements(context.tree):
                    if (path, name) in found or not isinstance(value, ALIAS_VALUES):
                        continue
                    if mentions_any(value, context, found):
                        found.add((path, name))
        return found

    return project.memo("any-aliases", build)


def has_any(annotation, context):
    return mentions_any(annotation, context, any_aliases(context.project))


def is_functional_type(value, context):
    if not isinstance(value, ast.Call):
        return False
    name = (dotted_name(value.func, context.aliases) or "").rsplit(".", 1)[-1]
    return name in FUNCTIONAL_TYPES and has_any(value, context)
