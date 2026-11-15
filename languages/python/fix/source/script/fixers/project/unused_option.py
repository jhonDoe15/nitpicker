import ast

from fixers.project.parameter_text import remove_parameter
from fixers.project.scan import binders, module_functions, names_mentioned
from source_text import refuse, replacement

DYNAMIC = {"locals", "vars", "eval", "exec"}
NUMBERS = (int, float, complex)


def literal_default(node):
    inner = node.operand if isinstance(node, ast.UnaryOp) else node
    if isinstance(node, ast.UnaryOp) and not isinstance(node.op, (ast.USub, ast.UAdd)):
        return False
    return isinstance(inner, ast.Constant) and not isinstance(inner.value, bytes)


PLAIN_PARENTS = (
    ast.Assign,
    ast.AnnAssign,
    ast.Return,
    ast.Expr,
    ast.Compare,
    ast.keyword,
)


def needs_parentheses(default, read, parent):
    numeric = isinstance(default, ast.Constant) and isinstance(default.value, NUMBERS)
    if isinstance(parent, (ast.Attribute, ast.Subscript)):
        return (numeric or isinstance(default, ast.UnaryOp)) and parent.value is read
    if isinstance(parent, ast.Call):
        return (numeric or isinstance(default, ast.UnaryOp)) and parent.func is read
    return isinstance(default, ast.UnaryOp) and not isinstance(parent, PLAIN_PARENTS)


def inside_fstring(context, node):
    current = context.parents.get(id(node))
    while current is not None:
        if isinstance(current, ast.JoinedStr):
            return True
        current = context.parents.get(id(current))
    return False


def reads_of(fn, name):
    return [
        node
        for statement in fn.body
        for node in ast.walk(statement)
        if isinstance(node, ast.Name)
        and isinstance(node.ctx, ast.Load)
        and node.id == name
    ]


def calls_dynamic(fn):
    return any(
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id in DYNAMIC
        for statement in fn.body
        for node in ast.walk(statement)
    )


def inline_edits(source, context, fn, parameter, default):
    reads = reads_of(fn, parameter.arg)
    if not reads:
        return []
    if not literal_default(default):
        refuse("the body reads the parameter and its default is not a literal")
    if calls_dynamic(fn):
        refuse("the body reads local names by string")
    text = source.source_of(default)
    edits = []
    for node in reads:
        if inside_fstring(context, node):
            refuse("the body reads the parameter inside an f-string")
        parent = context.parents.get(id(node))
        wrapped = f"({text})" if needs_parentheses(default, node, parent) else text
        edits.append(replacement(*source.span(node), wrapped))
    return edits


def unused_option(index, source, context, item):
    function_name, _, option = item["subject"].partition(".")
    found = module_functions(context.tree, function_name)
    if len(found) != 1 or isinstance(found[0], ast.ClassDef):
        refuse("the module defines the name more than once")
    fn = found[0]
    if getattr(fn, "type_params", None):
        refuse("the function has type parameters")
    parameters = list(fn.args.args)
    positional = list(fn.args.posonlyargs) + parameters
    defaults = [None] * (len(positional) - len(fn.args.defaults)) + list(
        fn.args.defaults
    )
    pairs = {p.arg: d for p, d in zip(positional, defaults) if p in parameters}
    if any(isinstance(node, ast.Lambda) for node in ast.walk(fn.args)):
        refuse("a default or annotation of the signature holds a lambda")
    if option not in pairs or pairs[option] is None:
        refuse("only a positional-or-keyword parameter with a default is removed")
    if names_mentioned(index, fn.name):
        refuse("a string or a non-Python file in the project names the function")
    if any(binders(statement, option) for statement in fn.body):
        refuse("the body rebinds the name of the parameter")
    parameter = next(p for p in parameters if p.arg == option)
    edits = [remove_parameter(source, fn, parameter)]
    return edits + inline_edits(source, context, fn, parameter, pairs[option])
