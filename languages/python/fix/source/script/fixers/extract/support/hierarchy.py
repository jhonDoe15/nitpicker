import ast

from source_text import refuse

SPECIAL_METHODS = {"__new__", "__init_subclass__", "__class_getitem__"}
CONTRACTS = {"Protocol", "runtime_checkable"}


def tail_name(node):
    if isinstance(node, ast.Call):
        node = node.func
    if isinstance(node, ast.Name):
        return node.id
    return node.attr if isinstance(node, ast.Attribute) else None


def defines(cls, name):
    for statement in cls.body:
        if (
            isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef))
            and statement.name == name
        ):
            return True
        targets = (
            statement.targets
            if isinstance(statement, ast.Assign)
            else [getattr(statement, "target", None)]
        )
        if any(isinstance(target, ast.Name) and target.id == name for target in targets):
            return True
    return False


def method_problem(functions, containers):
    for function in functions:
        if function.name in SPECIAL_METHODS:
            refuse("a method is implicitly static or a class method")
        arguments = function.args.args
        if not arguments or arguments[0].arg != "self":
            refuse("the first parameter of a method is not self")
    container = containers[0]
    marks = [tail_name(node) for node in container.bases + container.decorator_list]
    if CONTRACTS & set(marks):
        refuse("the class is a protocol")


def subclass_problem(container, name, sources):
    classes = [
        node
        for source in sources.values()
        for node in ast.walk(source.tree)
        if isinstance(node, ast.ClassDef) and node is not container
    ]
    family = [container.name]
    for known in family:
        for cls in classes:
            bases = {tail_name(base) for base in cls.bases}
            if known in bases and cls.name not in family:
                family.append(cls.name)
    if any(cls.name in family and defines(cls, name) for cls in classes):
        refuse("a subclass defines a member with the name of the shared function")
