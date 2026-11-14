import ast

SETTERS = {"setattr", "delattr", "__setattr__", "__delattr__"}


def last_name(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def field_names(node):
    names = set()
    for statement in node.body:
        if isinstance(statement, ast.AnnAssign) and isinstance(
            statement.target, ast.Name
        ):
            names.add(statement.target.id)
        elif isinstance(statement, ast.Assign):
            names.update(t.id for t in statement.targets if isinstance(t, ast.Name))
    return names


def attribute_targets(target):
    if isinstance(target, ast.Attribute):
        yield target.attr
    elif isinstance(target, (ast.Tuple, ast.List)):
        for item in target.elts:
            yield from attribute_targets(item)
    elif isinstance(target, ast.Starred):
        yield from attribute_targets(target.value)


def assigned_attributes(tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            targets = node.targets
        elif isinstance(node, (ast.AugAssign, ast.AnnAssign)):
            targets = [node.target]
        elif isinstance(node, ast.Delete):
            targets = node.targets
        elif (
            isinstance(node, ast.Call)
            and last_name(node.func) in SETTERS
            and len(node.args) >= 2
        ):
            argument = node.args[1]
            if isinstance(argument, ast.Constant) and isinstance(argument.value, str):
                yield argument.value
            continue
        else:
            continue
        for target in targets:
            yield from attribute_targets(target)


def project_trees(context):
    project = context.project
    return [other.tree for other in project.contexts.values()] + list(
        getattr(project, "reads", [])
    )


def subclassed_in_project(context, node):
    for tree in project_trees(context):
        for found in ast.walk(tree):
            if isinstance(found, ast.ClassDef) and found is not node:
                if any(last_name(base) == node.name for base in found.bases):
                    return True
    return False


def assigned_in_project(context, node):
    fields = field_names(node)
    for tree in project_trees(context):
        if fields.intersection(assigned_attributes(tree)):
            return True
    return False
