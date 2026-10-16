import ast
import io
import tokenize

SKIPPED_TOKENS = {
    tokenize.COMMENT,
    tokenize.NL,
    tokenize.NEWLINE,
    tokenize.INDENT,
    tokenize.DEDENT,
    tokenize.ENCODING,
    tokenize.ENDMARKER,
}
CLOSERS = {")", "]", "}"}
LITERAL_TYPES = (ast.Constant, ast.Tuple, ast.List, ast.Set, ast.Dict, ast.UnaryOp)
PACKAGE_FILE = "__init__.py"


def decoded(source):
    encoding, _ = tokenize.detect_encoding(io.BytesIO(source).readline)
    return source.decode(encoding)


def docstring_spans(node):
    spans = []
    for owner in ast.walk(node):
        body = getattr(owner, "body", None)
        first = body[0] if isinstance(body, list) and body else None
        if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant):
            if isinstance(first.value.value, str):
                spans.append(
                    ((first.lineno, first.col_offset), (first.end_lineno, first.end_col_offset))
                )
    return spans


def token_text(token):
    if token.type != tokenize.STRING:
        return token.string
    try:
        return "str:" + repr(ast.literal_eval(token.string))
    except (ValueError, SyntaxError):
        return token.string


def normalized(texts):
    kept = [text for text in texts if text != ";"]
    return [
        text
        for index, text in enumerate(kept)
        if not (text == "," and index + 1 < len(kept) and kept[index + 1] in CLOSERS)
    ]


def tokens_of(lines, node):
    first = min([node.lineno] + [d.lineno for d in getattr(node, "decorator_list", [])])
    source = "".join(lines[first - 1 : node.end_lineno])
    spans = docstring_spans(node)
    texts = []
    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        position = (token.start[0] + first - 1, token.start[1])
        inside = any(start <= position < end for start, end in spans)
        if token.type not in SKIPPED_TOKENS and not inside:
            texts.append(token_text(token))
    return normalized(texts), first


def is_literal(node):
    return all(
        isinstance(child, LITERAL_TYPES + (ast.expr_context, ast.unaryop))
        for child in ast.walk(node)
    )


def definition_kind(statement):
    if isinstance(statement, ast.FunctionDef):
        return "function", "function"
    if isinstance(statement, ast.AsyncFunctionDef):
        return "function", "function:async"
    if isinstance(statement, ast.ClassDef):
        return "class", "class"
    if type(statement).__name__ == "TypeAlias":
        return "type", "type"
    annotation = getattr(statement, "annotation", None)
    if isinstance(annotation, (ast.Name, ast.Attribute)) and (
        getattr(annotation, "id", None) == "TypeAlias"
        or getattr(annotation, "attr", None) == "TypeAlias"
    ):
        return "type", "type"
    return "constant", "constant"


def defined_name(statement):
    if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        return statement.name
    if type(statement).__name__ == "TypeAlias":
        return statement.name.id
    if isinstance(statement, ast.Assign) and len(statement.targets) == 1:
        target = statement.targets[0]
    elif isinstance(statement, ast.AnnAssign) and statement.value is not None:
        target = statement.target
    else:
        return None
    return target.id if isinstance(target, ast.Name) else None


def all_names(tree):
    for statement in tree.body:
        if defined_name(statement) == "__all__" and isinstance(
            statement.value, (ast.List, ast.Tuple)
        ):
            values = [e.value for e in statement.value.elts if isinstance(e, ast.Constant)]
            return [value for value in values if isinstance(value, str)]
    return None


def import_bindings(tree):
    bindings = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                local = alias.asname or alias.name.split(".")[0]
                bindings[local] = {
                    "kind": "module",
                    "module": alias.name if alias.asname else local,
                    "level": 0,
                }
        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                if alias.name != "*":
                    bindings[alias.asname or alias.name] = {
                        "kind": "import",
                        "module": node.module,
                        "level": node.level,
                        "name": alias.name,
                    }
    return bindings


def loaded_names(node):
    return {
        child.id
        for child in ast.walk(node)
        if isinstance(child, ast.Name) and isinstance(child.ctx, ast.Load)
    }


def free_bindings(node, name, module_names, bindings):
    free = []
    for used in sorted(loaded_names(node) - {name}):
        if used in bindings:
            free.append({"name": used, "binding": bindings[used]})
        elif used in module_names:
            free.append({"name": used, "binding": {"kind": "local"}})
    return free


def used_locally(tree, statement, name):
    return any(name in loaded_names(other) for other in tree.body if other is not statement)


def definitions_of(tree, lines, bindings):
    exported_names = all_names(tree)
    named = [(statement, defined_name(statement)) for statement in tree.body]
    named = [(statement, name) for statement, name in named if name and name != "__all__"]
    module_names = {name for _, name in named}
    found = []
    for statement, name in named:
        kind, tag = definition_kind(statement)
        tokens, first = tokens_of(lines, statement)
        value = getattr(statement, "value", None)
        found.append(
            {
                "name": name,
                "kind": kind,
                "tag": tag,
                "line": first,
                "lines": statement.end_lineno - first + 1,
                "exported": not name.startswith("_")
                and (exported_names is None or name in exported_names),
                "usedLocally": used_locally(tree, statement, name),
                "literal": kind == "constant" and value is not None and is_literal(value),
                "tokens": tokens,
                "free": free_bindings(statement, name, module_names, bindings),
            }
        )
    return found


def qualified_uses(tree, bindings):
    uses = set()
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Attribute)
            and isinstance(node.value, ast.Name)
            and node.value.id in bindings
        ):
            uses.add(f"{node.value.id}.{node.attr}")
    return sorted(uses)


def reexports_of(tree, relative, exported_names):
    is_package = relative.endswith(PACKAGE_FILE)
    found = []
    for statement in tree.body:
        if not isinstance(statement, ast.ImportFrom):
            continue
        for alias in statement.names:
            bound = alias.asname or alias.name
            listed = exported_names is not None and (bound in exported_names or alias.name == "*")
            if listed or (is_package and exported_names is None and not bound.startswith("_")):
                found.append(
                    {
                        "name": bound,
                        "imported": alias.name,
                        "module": statement.module,
                        "level": statement.level,
                        "line": statement.lineno,
                    }
                )
    return found


def facts_of(relative, tree, text, imports):
    lines = text.splitlines(keepends=True)
    bindings = import_bindings(tree)
    exported_names = all_names(tree)
    return {
        "imports": imports,
        "definitions": definitions_of(tree, lines, bindings),
        "qualifiedUses": qualified_uses(tree, bindings),
        "exports": {
            "all": exported_names,
            "reexports": reexports_of(tree, relative, exported_names),
        },
    }
