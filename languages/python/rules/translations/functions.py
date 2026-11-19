import ast

from checks.common import dotted_name

LITERAL_ARGUMENTS = {
    "_": (0,),
    "gettext": (0,),
    "gettext_lazy": (0,),
    "gettext_noop": (0,),
    "ugettext": (0,),
    "ugettext_lazy": (0,),
    "pgettext": (1,),
    "pgettext_lazy": (1,),
    "ngettext": (0, 1),
    "ngettext_lazy": (0, 1),
    "ungettext": (0, 1),
    "npgettext": (1, 2),
    "npgettext_lazy": (1, 2),
}
MODULES = (
    "django.utils.translation",
    "gettext",
    "flask_babel",
    "flask_babelex",
    "babel",
)


def in_modules(dotted):
    return any(
        dotted == module or dotted.startswith(module + ".") for module in MODULES
    )


def assigns_underscore(tree):
    return any(
        isinstance(node, ast.Name)
        and node.id == "_"
        and isinstance(node.ctx, ast.Store)
        for node in ast.walk(tree)
    )


def literal_indexes(call, context):
    if not isinstance(call, ast.Call):
        return None
    dotted = dotted_name(call.func, context.aliases)
    if dotted is None:
        return None
    name = dotted.rsplit(".", 1)[-1]
    if name not in LITERAL_ARGUMENTS:
        return None
    if not (dotted == name or in_modules(dotted)):
        return None
    if dotted == "_" and assigns_underscore(context.tree):
        return None
    return LITERAL_ARGUMENTS[name]


def gettext_literals(call, context):
    indexes = literal_indexes(call, context)
    texts = []
    for index in indexes or ():
        argument = call.args[index] if index < len(call.args) else None
        if isinstance(argument, ast.Constant) and isinstance(argument.value, str):
            texts.append(argument.value)
    return texts or None
