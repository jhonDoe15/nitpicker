import ast
import io
import tokenize

from near_expressions import ExpressionConverter
from near_statements import StatementConverter
from near_tree_parts import FUNCTIONS, bound_names, located

SKIPPED_TOKENS = {
    tokenize.COMMENT,
    tokenize.NL,
    tokenize.NEWLINE,
    tokenize.INDENT,
    tokenize.DEDENT,
    tokenize.ENCODING,
    tokenize.ENDMARKER,
}


class Converter(StatementConverter, ExpressionConverter):
    pass


def tree_of(function, scope, text):
    converter = Converter({**scope, "bound": bound_names(function)}, text)
    order = [function]
    for node in order:
        if node is function or not isinstance(node, ast.ClassDef):
            order.extend(ast.iter_child_nodes(node))
    for node in reversed(order[1:]):
        converted = converter.convert(node)
        if converted is not None:
            converter.converted[id(node)] = converted
    return located("function", function, [
        converter.type_of(function.returns),
        converter.parameters(function.args, function),
        converter.block(function.body, function),
    ])


def module_names(statement):
    if isinstance(statement, FUNCTIONS + (ast.ClassDef,)):
        return [statement.name]
    targets = statement.targets if isinstance(statement, ast.Assign) else []
    if isinstance(statement, ast.AnnAssign):
        targets = [statement.target]
    return [target.id for target in targets if isinstance(target, ast.Name)]


def module_scope(tree, bindings, module):
    names = {name: f"{module}#{name}" for statement in tree.body for name in module_names(statement)}
    for local, binding in bindings.items():
        imported = binding.get("name")
        source = "." * binding.get("level", 0) + (binding.get("module") or "")
        names[local] = f"{source}#{imported}" if imported else source
    return {"module": names}


def token_count(text, function):
    first = min([function.lineno] + [decorator.lineno for decorator in function.decorator_list])
    lines = text.splitlines(keepends=True)[first - 1 : function.end_lineno]
    try:
        tokens = tokenize.generate_tokens(io.StringIO("".join(lines)).readline)
        return sum(1 for token in tokens if token.type not in SKIPPED_TOKENS)
    except (tokenize.TokenError, IndentationError, SyntaxError):
        return 0


def unit_roots(tree):
    pending = [(statement, "") for statement in tree.body]
    roots = []
    for node, qualifier in pending:
        if isinstance(node, FUNCTIONS):
            roots.append((node, f"{qualifier}{node.name}"))
        elif isinstance(node, ast.ClassDef):
            pending.extend((child, f"{qualifier}{node.name}.") for child in node.body)
    return sorted(roots, key=lambda root: (root[0].lineno, root[0].col_offset))


def module_of(relative):
    stem = relative[: -len(".py")] if relative.endswith(".py") else relative
    return stem.replace("/", ".").removesuffix(".__init__")


def near_duplicate_units(tree, text, bindings, relative):
    scope = module_scope(tree, bindings, module_of(relative))
    seen = {}
    units = []
    for function, label in unit_roots(tree):
        count = seen.get(label, 0) + 1
        seen[label] = count
        unit_tree = tree_of(function, scope, text)
        units.append({
            "name": label if count == 1 else f"{label}#{count}",
            "start": unit_tree["start"],
            "end": unit_tree["end"],
            "tokens": token_count(text, function),
            "final": "." not in label,
            "tree": unit_tree,
        })
    return units
