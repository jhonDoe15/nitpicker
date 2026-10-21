import ast

from checks.common import finding, own_nodes

TYPING_MODULES = {"typing", "typing_extensions"}
SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)


def scope_bindings(root):
    bindings = {}
    imports = {}
    for node in own_nodes(root):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                name = alias.asname or alias.name.split(".")[0]
                target = (
                    alias.name
                    if isinstance(node, ast.Import)
                    else (f"{node.module}.{alias.name}" if node.level == 0 else None)
                )
                imports.setdefault(name, []).append(target)
        elif isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
            bindings[node.id] = None
        elif isinstance(node, SCOPES) and not isinstance(node, ast.Lambda):
            bindings[node.name] = None
        elif isinstance(node, ast.ExceptHandler) and node.name:
            bindings[node.name] = None
    if isinstance(root, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
        args = root.args
        for arg in (
            args.posonlyargs + args.args + args.kwonlyargs + [args.vararg, args.kwarg]
        ):
            if arg is not None:
                bindings[arg.arg] = None
    for name, targets in imports.items():
        if name not in bindings:
            bindings[name] = targets[0] if len(set(targets)) == 1 else None
    return bindings


class TypeLaundering(ast.NodeVisitor):
    def __init__(self, context, existing):
        self.context = context
        self.scopes = []
        self.class_scopes = []
        self.names = []
        self.findings = []
        self.existing_any = {
            item["line"]
            for item in existing
            if item["rule"] in {"any-in-domain", "pydantic-any-field"}
        }

    def resolve(self, node):
        if isinstance(node, ast.Attribute):
            base = self.resolve(node.value)
            return f"{base}.{node.attr}" if base else None
        if isinstance(node, ast.Name):
            for scope in reversed(self.scopes):
                if node.id in scope:
                    return scope[node.id]
        return None

    def report(self, rule, node, target):
        if rule == "explicit-any" and node.lineno in self.existing_any:
            return
        subject = ".".join([*self.names, target])
        self.findings.append(finding(self.context.path, rule, subject, node))

    def visit_Module(self, node):
        self.scopes.append(scope_bindings(node))
        self.generic_visit(node)
        self.scopes.pop()

    def visit_function(self, node):
        for decorator in node.decorator_list:
            self.visit(decorator)
        args = node.args
        for default in args.defaults + [v for v in args.kw_defaults if v is not None]:
            self.visit(default)
        self.names.append(node.name)
        for arg in (
            args.posonlyargs + args.args + args.kwonlyargs + [args.vararg, args.kwarg]
        ):
            if arg is not None and arg.annotation is not None:
                self.annotation(arg.annotation)
        if node.returns is not None:
            self.annotation(node.returns)
        outer = self.scopes
        self.scopes = [
            scope
            for scope in outer
            if not any(scope is cls for cls in self.class_scopes)
        ]
        self.scopes.append(scope_bindings(node))
        for statement in node.body:
            self.visit(statement)
        self.scopes = outer
        self.names.pop()

    visit_FunctionDef = visit_function
    visit_AsyncFunctionDef = visit_function

    def visit_ClassDef(self, node):
        for expression in node.bases + node.decorator_list:
            self.visit(expression)
        self.names.append(node.name)
        self.scopes.append(scope_bindings(node))
        self.class_scopes.append(self.scopes[-1])
        for statement in node.body:
            self.visit(statement)
        self.scopes.pop()
        self.class_scopes.pop()
        self.names.pop()

    def visit_Lambda(self, node):
        for default in node.args.defaults + [
            v for v in node.args.kw_defaults if v is not None
        ]:
            self.visit(default)
        outer = self.scopes
        self.scopes = [
            scope
            for scope in outer
            if not any(scope is cls for cls in self.class_scopes)
        ]
        self.scopes.append(scope_bindings(node))
        self.visit(node.body)
        self.scopes = outer

    def reference(self, node):
        target = self.resolve(node)
        if target in {f"{module}.Any" for module in TYPING_MODULES}:
            self.report("explicit-any", node, target)

    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Load):
            self.reference(node)

    def visit_Attribute(self, node):
        self.reference(node)
        self.generic_visit(node)

    def visit_Call(self, node):
        target = self.resolve(node.func)
        if target in {f"{module}.cast" for module in TYPING_MODULES}:
            self.report("type-cast", node, target)
        self.generic_visit(node)

    def annotation(self, node):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            try:
                parsed = ast.parse(node.value, mode="eval").body
            except SyntaxError:
                return
            ast.increment_lineno(parsed, node.lineno - 1)
            self.annotation(parsed)
        elif isinstance(node, ast.Subscript):
            self.visit(node.value)
            target = self.resolve(node.value)
            if target in {f"{module}.Literal" for module in TYPING_MODULES}:
                return
            parts = (
                node.slice.elts if isinstance(node.slice, ast.Tuple) else [node.slice]
            )
            if target in {f"{module}.Annotated" for module in TYPING_MODULES}:
                parts = parts[:1]
            for part in parts:
                self.annotation(part)
        elif isinstance(node, (ast.Name, ast.Attribute)):
            self.reference(node)
        elif isinstance(node, ast.Call):
            self.visit(node)
        else:
            for child in ast.iter_child_nodes(node):
                self.annotation(child)

    def visit_AnnAssign(self, node):
        self.annotation(node.annotation)
        if node.value is not None:
            if self.resolve(node.annotation) in {
                f"{m}.TypeAlias" for m in TYPING_MODULES
            }:
                self.annotation(node.value)
            else:
                self.visit(node.value)

    def visit_TypeAlias(self, node):
        self.annotation(node.value)

    def visit_Assign(self, node):
        value = node.value
        target = value.value if isinstance(value, ast.Subscript) else None
        name = self.resolve(target) or ""
        builtin = (
            isinstance(target, ast.Name)
            and target.id in {"list", "dict", "tuple", "set", "frozenset", "type"}
            and not any(target.id in scope for scope in self.scopes)
        )
        if builtin or name.split(".")[0] in TYPING_MODULES:
            self.annotation(value)
        else:
            self.visit(value)


def check(context, existing):
    visitor = TypeLaundering(context, existing)
    visitor.visit(context.tree)
    return visitor.findings
