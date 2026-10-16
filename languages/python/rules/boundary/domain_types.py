import ast

from checks.common import dotted_name, finding

PYDANTIC_MODELS = {"BaseModel", "BaseSettings", "RootModel"}


def has_any(annotation, aliases):
    for node in ast.walk(annotation):
        if isinstance(node, (ast.Name, ast.Attribute)):
            name = dotted_name(node, aliases) or ""
            if name in {"Any", "typing.Any", "typing_extensions.Any"}:
                return True
        if isinstance(node, ast.Constant) and node.value == "Any":
            return True
    return False


def annotations_of(function):
    arguments = function.args
    every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
    every += [argument for argument in (arguments.vararg, arguments.kwarg) if argument]
    return [a.annotation for a in every if a.annotation is not None] + (
        [function.returns] if function.returns is not None else []
    )


class AnyInDomain(ast.NodeVisitor):
    def __init__(self, context):
        self.context = context
        self.scope = []
        self.findings = []

    def report(self, annotation):
        subject = ".".join(self.scope) or "module"
        if has_any(annotation, self.context.aliases):
            self.findings.append(
                finding(self.context.path, "any-in-domain", subject, annotation)
            )

    def visit_function(self, node):
        self.scope.append(node.name)
        for annotation in annotations_of(node):
            self.report(annotation)
        self.generic_visit(node)
        self.scope.pop()

    visit_FunctionDef = visit_function
    visit_AsyncFunctionDef = visit_function

    def visit_ClassDef(self, node):
        self.scope.append(node.name)
        self.generic_visit(node)
        self.scope.pop()

    def visit_AnnAssign(self, node):
        self.report(node.annotation)
        self.generic_visit(node)


def is_pydantic_class(node, aliases, known):
    for base in node.bases:
        name = dotted_name(base, aliases) or ""
        root = name.split(".")[0]
        if (
            root in {"pydantic", "pydantic_settings"}
            and name.rsplit(".", 1)[-1] in PYDANTIC_MODELS
        ):
            return True
        if name in known:
            return True
    return False


def pydantic_classes(tree, aliases):
    known = set()
    classes = [node for node in ast.walk(tree) if isinstance(node, ast.ClassDef)]
    changed = True
    while changed:
        changed = False
        for node in classes:
            if node.name not in known and is_pydantic_class(node, aliases, known):
                known.add(node.name)
                changed = True
    return [node for node in classes if node.name in known]


def allows_extra(value):
    if isinstance(value, ast.Constant):
        return value.value == "allow"
    return isinstance(value, ast.Attribute) and value.attr == "allow"


def keyword_allows(call):
    return any(
        keyword.arg == "extra" and allows_extra(keyword.value)
        for keyword in call.keywords
    )


def dict_allows(node):
    return any(
        isinstance(key, ast.Constant) and key.value == "extra" and allows_extra(value)
        for key, value in zip(node.keys, node.values)
    )


def config_allows_extra(value):
    if isinstance(value, ast.Call):
        return keyword_allows(value)
    return isinstance(value, ast.Dict) and dict_allows(value)


def class_allows_extra(node):
    if keyword_allows(node):
        return True
    for statement in node.body:
        if isinstance(statement, ast.Assign):
            names = [t.id for t in statement.targets if isinstance(t, ast.Name)]
            if "model_config" in names and config_allows_extra(statement.value):
                return True
            if "extra" in names and allows_extra(statement.value):
                return True
        elif isinstance(statement, ast.AnnAssign) and isinstance(
            statement.target, ast.Name
        ):
            named = (
                statement.target.id == "model_config" and statement.value is not None
            )
            if named and config_allows_extra(statement.value):
                return True
        elif isinstance(statement, ast.ClassDef) and statement.name == "Config":
            if class_allows_extra(statement):
                return True
    return False


def model_findings(context):
    found = []
    for node in pydantic_classes(context.tree, context.aliases):
        if class_allows_extra(node):
            found.append(finding(context.path, "pydantic-extra-allow", node.name, node))
        for statement in node.body:
            if isinstance(statement, ast.AnnAssign) and has_any(
                statement.annotation, context.aliases
            ):
                target = getattr(statement.target, "id", "field")
                found.append(
                    finding(
                        context.path,
                        "pydantic-any-field",
                        f"{node.name}.{target}",
                        statement,
                    )
                )
    return found


def check(context):
    found = []
    if context.domain:
        visitor = AnyInDomain(context)
        visitor.visit(context.tree)
        found.extend(visitor.findings)
    if not context.tests:
        found.extend(model_findings(context))
    return found
