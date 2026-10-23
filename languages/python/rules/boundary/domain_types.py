import ast

from boundary.pydantic_models import model_findings
from boundary.type_aliases import has_any, is_functional_type
from checks.common import finding
from syntax.walk import IterativeVisitor


def annotations_of(function):
    arguments = function.args
    every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
    every += [argument for argument in (arguments.vararg, arguments.kwarg) if argument]
    return [a.annotation for a in every if a.annotation is not None] + (
        [function.returns] if function.returns is not None else []
    )


class AnyInDomain(IterativeVisitor):
    def __init__(self, context):
        super().__init__()
        self.context = context
        self.scope = []
        self.findings = []

    def report(self, annotation):
        subject = ".".join(self.scope) or "module"
        if has_any(annotation, self.context):
            self.findings.append(
                finding(self.context.path, "any-in-domain", subject, annotation)
            )

    def visit_function(self, node):
        self.scope.append(node.name)
        for annotation in annotations_of(node):
            self.report(annotation)
        self.on_exit(self.scope.pop)
        self.generic_visit(node)

    visit_FunctionDef = visit_function
    visit_AsyncFunctionDef = visit_function

    def visit_ClassDef(self, node):
        self.scope.append(node.name)
        self.on_exit(self.scope.pop)
        self.generic_visit(node)

    def visit_AnnAssign(self, node):
        self.report(node.annotation)
        self.generic_visit(node)

    def visit_Assign(self, node):
        if is_functional_type(node.value, self.context):
            target = getattr(node.targets[0], "id", "module")
            subject = ".".join([*self.scope, target])
            self.findings.append(
                finding(self.context.path, "any-in-domain", subject, node)
            )
        self.generic_visit(node)


def check(context):
    found = []
    if context.domain:
        visitor = AnyInDomain(context)
        visitor.visit(context.tree)
        found.extend(visitor.findings)
    if not context.tests:
        found.extend(model_findings(context))
    return found
