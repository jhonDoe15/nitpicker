from boundary.pydantic_models import model_findings
from boundary.type_aliases import has_any, is_functional_type
from checks.common import ScopedVisitor, finding


def annotations_of(function):
    arguments = function.args
    every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
    every += [argument for argument in (arguments.vararg, arguments.kwarg) if argument]
    return [a.annotation for a in every if a.annotation is not None] + (
        [function.returns] if function.returns is not None else []
    )


class AnyInDomain(ScopedVisitor):
    def __init__(self, context):
        self.context = context
        self.findings = []

    def report(self, annotation):
        subject = ".".join(self.scope) or "module"
        if has_any(annotation, self.context):
            self.findings.append(
                finding(self.context.path, "any-in-domain", subject, annotation)
            )

    def visit_function(self, node):
        for annotation in annotations_of(node):
            self.report(annotation)

    visit_FunctionDef = visit_function
    visit_AsyncFunctionDef = visit_function

    def visit_AnnAssign(self, node):
        self.report(node.annotation)

    def visit_Assign(self, node):
        if is_functional_type(node.value, self.context):
            target = getattr(node.targets[0], "id", "module")
            subject = ".".join([*self.scope, target])
            self.findings.append(
                finding(self.context.path, "any-in-domain", subject, node)
            )


def check(context):
    found = []
    if context.domain:
        visitor = AnyInDomain(context)
        visitor.visit(context.tree)
        found.extend(visitor.findings)
    if not context.tests:
        found.extend(model_findings(context))
    return found
