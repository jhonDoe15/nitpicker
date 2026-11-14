import ast
import re

NONE = {"kind": "none", "children": []}
SNIPPET_LENGTH = 60
ELLIPSIS = "..."
SNIPPET_KINDS = {
    "call", "new", "member", "index", "binary", "unary", "update", "assign", "conditional", "lambda", "expression",
}
STATEMENT_KINDS = {
    "declare", "evaluate", "if", "return", "throw", "break", "continue", "for", "foreach", "while", "block",
    "statement",
}
OPERATORS = {
    ast.Add: "+", ast.Sub: "-", ast.Mult: "*", ast.Div: "/", ast.FloorDiv: "//", ast.Mod: "%",
    ast.Pow: "**", ast.MatMult: "@", ast.LShift: "<<", ast.RShift: ">>", ast.BitOr: "|",
    ast.BitXor: "^", ast.BitAnd: "&", ast.And: "&&", ast.Or: "||", ast.Not: "!",
    ast.USub: "-", ast.UAdd: "+", ast.Invert: "~", ast.Eq: "==", ast.NotEq: "!=", ast.Lt: "<",
    ast.LtE: "<=", ast.Gt: ">", ast.GtE: ">=", ast.Is: "is", ast.IsNot: "is not", ast.In: "in",
    ast.NotIn: "not in",
}
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


def operator(node):
    return OPERATORS[type(node)]


def located(kind, source, children=None, **fields):
    return {
        "kind": kind,
        "children": children or [],
        **fields,
        "start": source.lineno,
        "end": source.end_lineno or source.lineno,
    }


def flat(text):
    return re.sub(r"\s+", " ", text)


def shortened(text):
    line = flat(text)
    return line if len(line) <= SNIPPET_LENGTH else line[: SNIPPET_LENGTH - len(ELLIPSIS)] + ELLIPSIS


def literal_of(source):
    value = source.value
    if isinstance(value, bool):
        return located("literal", source, literal="boolean", value=str(value).lower())
    if value is None:
        return located("literal", source, literal="null", value="null")
    if isinstance(value, (int, float, complex)):
        return located("literal", source, literal="number", value=repr(value))
    if value is Ellipsis:
        return located("literal", source, literal="ellipsis", value="...")
    kind = "bytes" if isinstance(value, bytes) else "string"
    return located("literal", source, literal=kind, value=repr(value))


def declared(node, function):
    if isinstance(node, ast.arg):
        return {node.arg}
    if isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
        return {node.id}
    if isinstance(node, ast.ExceptHandler) and node.name:
        return {node.name}
    if isinstance(node, FUNCTIONS + (ast.ClassDef,)) and node is not function:
        return {node.name}
    return set()


def bound_names(function):
    bound = set()
    released = set()
    for node in ast.walk(function):
        bound.update(declared(node, function))
        if isinstance(node, (ast.Global, ast.Nonlocal)):
            released.update(node.names)
    return bound - released


class BaseConverter:
    def __init__(self, scope, text):
        self.scope = scope
        self.text = text
        self.converted = {}

    def get(self, source):
        if source is None:
            return NONE
        return self.converted.get(id(source)) or self.opaque(source)

    def opaque(self, source):
        kind = "statement" if isinstance(source, ast.stmt) else "expression"
        segment = ast.get_source_segment(self.text, source) or type(source).__name__
        return located(kind, source, value=f"{type(source).__name__}:{flat(segment)}")

    def name(self, text, source):
        if text in self.scope["bound"]:
            return located("name", source, binding="bound", value=text, text=text)
        value = self.scope["module"].get(text, text)
        return located("name", source, binding="free", value=value, text=text)

    def block(self, statements, source):
        first = statements[0] if statements else source
        return located("block", first, [self.statement(statement) for statement in statements])

    def statement(self, source):
        node = self.get(source)
        return node if node["kind"] in STATEMENT_KINDS else located("evaluate", source, [node])

    def type_of(self, source):
        if source is None:
            return NONE
        segment = ast.get_source_segment(self.text, source) or ""
        return located("type", source, value=re.sub(r"\s+", "", segment))

    def parameters(self, arguments, source):
        positional = arguments.posonlyargs + arguments.args
        defaults = [None] * (len(positional) - len(arguments.defaults)) + list(arguments.defaults)
        parameters = [self.parameter(argument, default) for argument, default in zip(positional, defaults)]
        if arguments.vararg:
            parameters.append(self.parameter(arguments.vararg, None, "rest"))
        for argument, default in zip(arguments.kwonlyargs, arguments.kw_defaults):
            parameters.append(self.parameter(argument, default, "keyword"))
        if arguments.kwarg:
            parameters.append(self.parameter(arguments.kwarg, None, "keywords"))
        return located("parameters", source, parameters)

    def parameter(self, argument, default, form=None):
        name = self.name(argument.arg, argument)
        if form is not None:
            name = located("expression", argument, [name], value=form)
        if default is not None:
            name = located("expression", argument, [name, self.get(default)], value="default")
        return located("parameter", argument, [self.type_of(argument.annotation), name])

    def convert(self, source):
        method = getattr(self, "on_" + type(source).__name__, None)
        if method is None:
            return None
        node = method(source)
        if node["kind"] in SNIPPET_KINDS and "text" not in node:
            segment = ast.get_source_segment(self.text, source)
            if segment:
                node["text"] = shortened(segment)
        return node

    def grouped(self, kind, value, source, children):
        return located(kind, source, children, value=value)
