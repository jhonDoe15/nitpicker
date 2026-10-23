import ast

from boundary.domain_types import annotations_of, check as boundary_findings
from checks.common import finding
from checks.typing_names import TypingNames

ANY_NAMES = {"typing.Any", "typing_extensions.Any"}
CAST_NAMES = {"typing.cast", "typing_extensions.cast"}
LITERAL_NAMES = {"typing.Literal", "typing_extensions.Literal"}
ANNOTATED_NAMES = {"typing.Annotated", "typing_extensions.Annotated"}
TYPE_ALIAS_NAMES = {"typing.TypeAlias", "typing_extensions.TypeAlias"}


class TypeLaundering(ast.NodeVisitor):
    def __init__(self, context):
        self.context = context
        self.names = TypingNames(context.tree)
        self.scope = []
        self.findings = []
        self.seen = set()

    def report(self, rule, node):
        subject = ".".join(self.scope) or "module"
        key = (rule, node.lineno, subject)
        if key not in self.seen:
            self.seen.add(key)
            self.findings.append(finding(self.context.path, rule, subject, node))

    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Load):
            self.reference(node)

    def reference(self, node):
        name = self.names.resolve(node)
        if name in ANY_NAMES:
            self.report("no-explicit-any", node)
        elif name in CAST_NAMES:
            self.report("no-typing-cast", node)

    def visit_Attribute(self, node):
        if self.names.resolve(node) in ANY_NAMES | CAST_NAMES:
            self.reference(node)
        else:
            self.generic_visit(node)

    def visit_Call(self, node):
        if self.names.resolve(node.func) in CAST_NAMES:
            self.report("no-typing-cast", node)
        self.generic_visit(node)

    def annotation(self, node, source=None):
        if node is None:
            return
        source = source or node
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            try:
                self.annotation(ast.parse(node.value, mode="eval").body, source)
            except (SyntaxError, ValueError):
                return
        elif self.names.resolve(node) in ANY_NAMES:
            self.report("no-explicit-any", source)
        elif isinstance(node, ast.Subscript):
            name = self.names.resolve(node.value)
            self.annotation(node.value, source)
            if name in LITERAL_NAMES:
                return
            values = (
                node.slice.elts if isinstance(node.slice, ast.Tuple) else [node.slice]
            )
            for value in values[:1] if name in ANNOTATED_NAMES else values:
                self.annotation(value, source)
        else:
            for child in ast.iter_child_nodes(node):
                self.annotation(child, source)

    def visit_AnnAssign(self, node):
        self.annotation(node.annotation)
        self.visit(node.target)
        if node.value:
            if self.names.resolve(node.annotation) in TYPE_ALIAS_NAMES:
                self.annotation(node.value)
            else:
                self.visit(node.value)

    def visit_TypeAlias(self, node):
        self.annotation(node.value)

    def visit_function(self, node):
        for decorator in node.decorator_list:
            self.visit(decorator)
        self.scope.append(node.name)
        for annotation in annotations_of(node):
            self.annotation(annotation)
        for default in node.args.defaults + [v for v in node.args.kw_defaults if v]:
            self.visit(default)
        self.body(node)
        self.scope.pop()

    visit_FunctionDef = visit_function
    visit_AsyncFunctionDef = visit_function

    def body(self, node):
        outer = self.names
        self.names = outer.child(node)
        for statement in node.body:
            self.visit(statement)
        self.names = outer

    def visit_ClassDef(self, node):
        for expression in node.bases + node.decorator_list:
            self.visit(expression)
        for keyword in node.keywords:
            self.visit(keyword.value)
        self.scope.append(node.name)
        self.body(node)
        self.scope.pop()

    def visit_Lambda(self, node):
        for default in node.args.defaults + [v for v in node.args.kw_defaults if v]:
            self.visit(default)
        outer = self.names
        self.names = outer.child(node)
        self.visit(node.body)
        self.names = outer

    def visit_comprehension_scope(self, node):
        self.visit(node.generators[0].iter)
        outer = self.names
        self.names = outer.child(node)
        for index, generator in enumerate(node.generators):
            if index:
                self.visit(generator.iter)
            for condition in generator.ifs:
                self.visit(condition)
        if isinstance(node, ast.DictComp):
            self.visit(node.key)
            self.visit(node.value)
        else:
            self.visit(node.elt)
        self.names = outer

    visit_ListComp = visit_comprehension_scope
    visit_SetComp = visit_comprehension_scope
    visit_DictComp = visit_comprehension_scope
    visit_GeneratorExp = visit_comprehension_scope


def check(context):
    visitor = TypeLaundering(context)
    visitor.visit(context.tree)
    covered = {
        item["line"]
        for item in boundary_findings(context)
        if item["rule"] in {"any-in-domain", "pydantic-any-field"}
    }
    return [
        item
        for item in visitor.findings
        if item["rule"] != "no-explicit-any" or item["line"] not in covered
    ]
