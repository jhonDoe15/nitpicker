import ast

FIELD_METHODS = {"startswith", "endswith", "lower", "upper"}
KEY_GETTER = "attrgetter"
OPERATORS = (
    ast.Compare,
    ast.BoolOp,
    ast.UnaryOp,
    ast.BinOp,
    ast.IfExp,
    ast.Tuple,
    ast.List,
    ast.Set,
)
SYMBOLS = (ast.cmpop, ast.boolop, ast.operator, ast.unaryop, ast.expr_context)


class Reads:
    def __init__(self, elements):
        self.elements = elements
        self.fields = set()
        self.valid = True


def chain_root(node):
    names = []
    while isinstance(node, ast.Attribute):
        names.append(node.attr)
        node = node.value
    return node, names


def element_field(node, elements):
    root, names = chain_root(node)
    if isinstance(root, ast.Name) and root.id in elements and names:
        return names[-1]
    return None


def visit_attribute(node, reads):
    field = element_field(node, reads.elements)
    if field is not None:
        reads.fields.add(field)
        return
    root, _ = chain_root(node)
    if not isinstance(root, ast.Name):
        visit(root, reads)


def visit_call(node, reads):
    func = node.func
    field = None
    if isinstance(func, ast.Attribute) and func.attr in FIELD_METHODS:
        field = element_field(func.value, reads.elements)
    if field is None or node.keywords:
        reads.valid = False
        return
    reads.fields.add(field)
    for argument in node.args:
        visit(argument, reads)


def visit(node, reads):
    if isinstance(node, (ast.Constant, *SYMBOLS)):
        return
    if isinstance(node, ast.Name):
        reads.valid = reads.valid and node.id not in reads.elements
    elif isinstance(node, ast.Attribute):
        visit_attribute(node, reads)
    elif isinstance(node, ast.Call):
        visit_call(node, reads)
    elif isinstance(node, OPERATORS):
        for child in ast.iter_child_nodes(node):
            visit(child, reads)
    else:
        reads.valid = False


def field_reads(nodes, elements):
    reads = Reads(set(elements))
    for node in nodes:
        visit(node, reads)
    return frozenset(reads.fields) if reads.valid and reads.fields else None


def lambda_fields(node):
    arguments = node.args
    extra = arguments.posonlyargs or arguments.kwonlyargs or arguments.vararg or arguments.kwarg
    if len(arguments.args) != 1 or extra:
        return None
    return field_reads([node.body], {arguments.args[0].arg})


def getter_fields(node):
    func = node.func
    name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", None)
    texts = [argument.value for argument in node.args if isinstance(argument, ast.Constant)]
    if name != KEY_GETTER or not texts or len(texts) != len(node.args):
        return None
    if not all(isinstance(text, str) for text in texts):
        return None
    return frozenset(text.split(".")[0] for text in texts)


def key_fields(node):
    if isinstance(node, ast.Lambda):
        return lambda_fields(node)
    return getter_fields(node) if isinstance(node, ast.Call) else None
