import ast

from airflow_templates.operators import init_of, is_operator, template_fields
from checks.common import finding, parameter_names, walk_statements

GUARDED = True
RULE = "templated-field-used-in-init"


def is_self_attribute(node):
    return (
        isinstance(node, ast.Attribute)
        and isinstance(node.value, ast.Name)
        and node.value.id == "self"
    )


def assignment_pairs(node):
    if isinstance(node, ast.AnnAssign) and node.value is not None:
        return [([node.target], node.value)]
    if not isinstance(node, ast.Assign):
        return []
    target = node.targets[0]
    both = isinstance(target, ast.Tuple) and isinstance(node.value, ast.Tuple)
    if len(node.targets) == 1 and both and len(target.elts) == len(node.value.elts):
        return [([t], v) for t, v in zip(target.elts, node.value.elts)]
    return [(node.targets, node.value)]


def plain_attribute(targets, value, fields):
    if not isinstance(value, ast.Name) or not all(map(is_self_attribute, targets)):
        return None
    return next((t.attr for t in targets if t.attr in fields), None)


def plain_assignments(init, fields):
    plain = {}
    for node in walk_statements(init.body):
        for targets, value in assignment_pairs(node):
            attribute = plain_attribute(targets, value, fields)
            if attribute is not None:
                plain[id(value)] = (value.id, attribute)
    return plain


def templated_parameters(init, fields, plain):
    names = set(parameter_names(init)) & fields
    names |= {name for name, attribute in plain.values() if attribute in fields}
    return names - {"self"}


def is_super_call(node):
    func = getattr(node, "func", None)
    return (
        isinstance(func, ast.Attribute)
        and isinstance(func.value, ast.Call)
        and isinstance(func.value.func, ast.Name)
        and func.value.func.id == "super"
    )


def shadowed_nodes(init):
    shadowed = set()
    nested = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)
    for node in ast.walk(init):
        if isinstance(node, nested) and node is not init:
            own = parameter_names(node)
            for inner in ast.walk(node):
                if isinstance(inner, ast.Name) and inner.id in own:
                    shadowed.add(id(inner))
    return shadowed


def skipped_nodes(init, plain):
    skipped = set(plain) | shadowed_nodes(init)
    for node in ast.walk(init):
        if is_super_call(node):
            skipped |= {id(inner) for inner in ast.walk(node)}
    return skipped


def position(node):
    return getattr(node, "lineno", 0), getattr(node, "col_offset", 0)


def uses(init, names, fields, plain):
    skipped = skipped_nodes(init, plain)
    ordered = sorted(ast.walk(init), key=position)
    for node in ordered:
        if id(node) in skipped or not isinstance(getattr(node, "ctx", None), ast.Load):
            continue
        if isinstance(node, ast.Name) and node.id in names:
            yield node.id, node
        elif is_self_attribute(node) and node.attr in fields:
            yield node.attr, node


def class_findings(cls, context):
    init = init_of(cls)
    fields = template_fields(cls, context)
    if init is None or not fields:
        return []
    plain = plain_assignments(init, fields)
    names = templated_parameters(init, fields, plain)
    found, seen = [], set()
    for name, node in uses(init, names, fields, plain):
        if name not in seen:
            seen.add(name)
            found.append(finding(context.path, RULE, f"{cls.name}.{name}", node))
    return found


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, ast.ClassDef) and is_operator(node, context):
            found.extend(class_findings(node, context))
    return found
