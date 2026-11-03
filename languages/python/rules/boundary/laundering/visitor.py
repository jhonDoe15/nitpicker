import ast

from boundary.laundering.bindings import (
    COMPREHENSIONS,
    TYPING,
    comprehension_bindings,
    parameters,
    scope_bindings,
)
from checks.common import finding

ANY = f"{TYPING}.Any"
CAST = f"{TYPING}.cast"
LITERAL = f"{TYPING}.Literal"
ANNOTATED = f"{TYPING}.Annotated"
TYPE_ALIAS = f"{TYPING}.TypeAlias"
OVERLOAD = f"{TYPING}.overload"
GENERIC_BUILTINS = {"list", "dict", "tuple", "set", "frozenset", "type"}
PRECEDING_RULES = {"any-in-domain", "pydantic-any-field"}
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
MAX_TYPE_TEXT = 40


def type_text(call):
    typed = [k.value for k in call.keywords if k.arg == "typ"]
    nodes = call.args[:1] or typed
    text = ast.unparse(nodes[0]) if nodes else ""
    return text if len(text) <= MAX_TYPE_TEXT else f"{text[:MAX_TYPE_TEXT - 3]}..."


def without_class_scopes(scopes, class_scopes):
    return [s for s in scopes if not any(s is cls for cls in class_scopes)]


class TypeLaundering(ast.NodeVisitor):
    def __init__(self, context, existing):
        self.context = context
        self.scopes = []
        self.class_scopes = []
        self.names = []
        self.findings = []
        self.collected = None
        self.hint = None
        self.implementations = set()
        self.preceding = [
            (item["line"], item.get("end", item["line"]))
            for item in existing
            if item["rule"] in PRECEDING_RULES
        ]

    def resolve(self, node):
        if isinstance(node, ast.Attribute):
            base = self.resolve(node.value)
            return f"{base}.{node.attr}" if base else None
        if isinstance(node, ast.Name):
            for scope in reversed(self.scopes):
                if node.id in scope:
                    return scope[node.id]
        return None

    def qualified(self, name):
        return ".".join([*self.names, name])

    def place(self, text):
        return f"{text} in {'.'.join(self.names)}" if self.names else text

    def binding(self, target):
        text = target.id if isinstance(target, ast.Name) else ast.unparse(target)
        return self.qualified(text)

    def report_cast(self, node, text):
        subject = self.place(text)
        self.findings.append(finding(self.context.path, "type-cast", subject, node))

    def report_any(self, node, subject):
        if any(first <= node.lineno <= last for first, last in self.preceding):
            return
        self.findings.append(finding(self.context.path, "explicit-any", subject, node))

    def collecting(self, subject, action, *arguments):
        outer = self.collected
        self.collected = []
        action(*arguments)
        found, self.collected = self.collected, outer
        if found:
            self.report_any(found[0], subject)

    def reference(self, node):
        target = self.resolve(node)
        if target == ANY:
            if self.collected is None:
                self.report_any(node, self.hint or ".".join(self.names) or "module")
            else:
                self.collected.append(node)
        elif target == CAST:
            self.report_cast(node, "cast")

    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Load):
            self.reference(node)

    def visit_Attribute(self, node):
        self.reference(node)
        self.generic_visit(node)

    def visit_Call(self, node):
        if self.resolve(node.func) != CAST:
            self.generic_visit(node)
            return
        self.report_cast(node, f"cast({type_text(node)})")
        for argument in node.args[1:]:
            self.visit(argument)
        for keyword in node.keywords:
            if keyword.arg != "typ":
                self.visit(keyword.value)

    def mark_implementations(self, body):
        overloaded = set()
        for statement in body:
            if not isinstance(statement, FUNCTIONS):
                continue
            if any(self.resolve(item) == OVERLOAD for item in statement.decorator_list):
                overloaded.add(statement.name)
            elif statement.name in overloaded:
                self.implementations.add(id(statement))

    def visit_Module(self, node):
        self.scopes.append(scope_bindings(node))
        self.mark_implementations(node.body)
        self.generic_visit(node)
        self.scopes.pop()

    def type_parameters(self, node, label):
        for parameter in getattr(node, "type_params", []):
            for bound in (
                getattr(parameter, "bound", None),
                getattr(parameter, "default_value", None),
            ):
                if bound is not None:
                    self.collecting(f"{label}[{parameter.name}]", self.annotation, bound)

    def visit_function(self, node):
        for decorator in node.decorator_list:
            self.visit(decorator)
        args = node.args
        for default in args.defaults + [v for v in args.kw_defaults if v is not None]:
            self.visit(default)
        self.names.append(node.name)
        label = ".".join(self.names)
        self.type_parameters(node, label)
        if id(node) not in self.implementations:
            for arg in parameters(node):
                if arg.annotation is not None:
                    self.collecting(f"{label}({arg.arg})", self.annotation, arg.annotation)
            if node.returns is not None:
                self.collecting(f"{label}(return)", self.annotation, node.returns)
        outer = self.scopes
        self.scopes = without_class_scopes(outer, self.class_scopes)
        self.scopes.append(scope_bindings(node))
        self.mark_implementations(node.body)
        for statement in node.body:
            self.visit(statement)
        self.scopes = outer
        self.names.pop()

    visit_FunctionDef = visit_function
    visit_AsyncFunctionDef = visit_function

    def visit_ClassDef(self, node):
        self.hint = f"{self.qualified(node.name)}(bases)"
        for expression in [*node.bases, *node.decorator_list]:
            self.visit(expression)
        for keyword in node.keywords:
            self.visit(keyword.value)
        self.hint = None
        self.names.append(node.name)
        self.type_parameters(node, ".".join(self.names))
        self.scopes.append(scope_bindings(node))
        self.class_scopes.append(self.scopes[-1])
        self.mark_implementations(node.body)
        for statement in node.body:
            self.visit(statement)
        self.scopes.pop()
        self.class_scopes.pop()
        self.names.pop()

    def visit_Lambda(self, node):
        defaults = node.args.defaults + [v for v in node.args.kw_defaults if v is not None]
        for default in defaults:
            self.visit(default)
        outer = self.scopes
        self.scopes = without_class_scopes(outer, self.class_scopes)
        self.scopes.append(scope_bindings(node))
        self.visit(node.body)
        self.scopes = outer

    def visit_comprehension_scope(self, node):
        self.scopes.append(comprehension_bindings(node))
        self.generic_visit(node)
        self.scopes.pop()

    visit_ListComp = visit_comprehension_scope
    visit_SetComp = visit_comprehension_scope
    visit_DictComp = visit_comprehension_scope
    visit_GeneratorExp = visit_comprehension_scope

    def parsed_string(self, node):
        try:
            parsed = ast.parse(node.value.strip(), mode="eval").body
        except (SyntaxError, ValueError):
            return None
        for child in ast.walk(parsed):
            if hasattr(child, "lineno"):
                child.lineno = node.lineno
                child.end_lineno = node.end_lineno
        return parsed

    def unquoted(self, node):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            return self.parsed_string(node) or node
        return node

    def annotation(self, node):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            parsed = self.parsed_string(node)
            if parsed is not None:
                self.annotation(parsed)
        elif isinstance(node, ast.Subscript):
            self.annotate_subscript(node)
        elif isinstance(node, (ast.Name, ast.Attribute)):
            self.reference(node)
        elif isinstance(node, ast.Call):
            self.visit(node)
        else:
            for child in ast.iter_child_nodes(node):
                self.annotation(child)

    def annotate_subscript(self, node):
        self.visit(node.value)
        target = self.resolve(node.value)
        if target == LITERAL:
            return
        parts = node.slice.elts if isinstance(node.slice, ast.Tuple) else [node.slice]
        for part in parts[:1] if target == ANNOTATED else parts:
            self.annotation(part)

    def visit_AnnAssign(self, node):
        self.visit(node.target)
        name = self.binding(node.target)
        self.collecting(name, self.annotation, node.annotation)
        if node.value is None:
            return
        if self.resolve(self.unquoted(node.annotation)) == TYPE_ALIAS:
            self.collecting(name, self.annotation, node.value)
        else:
            self.collecting(name, self.visit, node.value)

    def visit_TypeAlias(self, node):
        name = self.qualified(node.name.id)
        self.type_parameters(node, name)
        self.collecting(name, self.annotation, node.value)

    def is_type_expression(self, value):
        if self.resolve(value) == ANY:
            return True
        target = value.value if isinstance(value, ast.Subscript) else None
        if target is None:
            return False
        builtin = (
            isinstance(target, ast.Name)
            and target.id in GENERIC_BUILTINS
            and not any(target.id in scope for scope in self.scopes)
        )
        return builtin or (self.resolve(target) or "").split(".")[0] == TYPING

    def visit_Assign(self, node):
        for target in node.targets:
            self.visit(target)
        walk = self.annotation if self.is_type_expression(node.value) else self.visit
        self.collecting(self.binding(node.targets[0]), walk, node.value)


def check(context, existing):
    visitor = TypeLaundering(context, existing)
    visitor.visit(context.tree)
    return visitor.findings
