import ast
import re

from checks.declarations import decorator_name
from fixers.call_edits import add_keyword, has_spread, keyword_named
from fixers.project_reads import assigned_in_project, subclassed_in_project
from source_text import refuse, replacement, required

SAFE_PARENTS = (
    ast.Assign,
    ast.AnnAssign,
    ast.AugAssign,
    ast.Return,
    ast.Expr,
    ast.keyword,
)
GAP = re.compile(r"[\s\\]*or[\s\\(]*")


def is_self_target(target):
    return (
        isinstance(target, ast.Attribute)
        and isinstance(target.value, ast.Name)
        and target.value.id == "self"
    )


def mutates_self(node):
    for child in ast.walk(node):
        targets = []
        if isinstance(child, ast.Assign):
            targets = child.targets
        elif isinstance(child, (ast.AugAssign, ast.AnnAssign)):
            targets = [child.target]
        if any(is_self_target(target) for target in targets):
            return True
        if (
            isinstance(child, ast.Call)
            and isinstance(child.func, ast.Name)
            and child.func.id in {"setattr", "delattr"}
            and child.args
            and isinstance(child.args[0], ast.Name)
            and child.args[0].id == "self"
        ):
            return True
        if isinstance(child, ast.Delete) and any(
            is_self_target(t) for t in child.targets
        ):
            return True
    return False


def frozen_dataclass(source, node, context):
    if not isinstance(node, ast.ClassDef):
        refuse("not a class")
    if node.bases or node.keywords:
        refuse(
            "the class has bases, and a frozen dataclass cannot extend a mutable one"
        )
    if mutates_self(node):
        refuse("a method assigns to self")
    if subclassed_in_project(context, node):
        refuse("another class in the project extends it")
    if assigned_in_project(context, node):
        refuse("the project assigns to an attribute with the name of a field")
    found = [
        d
        for d in node.decorator_list
        if decorator_name(d, context.aliases) == "dataclass"
    ]
    if len(found) != 1:
        refuse("no single dataclass decorator")
    decorator = found[0]
    if not isinstance(decorator, ast.Call):
        end = source.span(decorator)[1]
        return [replacement(end, end, "(frozen=True)")]
    if has_spread(decorator) or keyword_named(decorator, "frozen") is not None:
        refuse("the decorator spreads arguments or already names frozen")
    return [
        required(
            add_keyword(source, decorator, "frozen=True"), "the decorator has comments"
        )
    ]


def falsy_ternary(source, node):
    if not (isinstance(node.test, ast.Name) and isinstance(node.body, ast.Name)):
        refuse("the conditional does not repeat one name")
    start, end = source.span(node.test)
    return [replacement(start, end, f"{node.test.id} is not None")]


def falsy_or(source, node, context):
    if len(node.values) != 2 or not isinstance(node.values[0], ast.Name):
        refuse("the expression is not name or default")
    parent = context.parents.get(id(node))
    if not isinstance(parent, SAFE_PARENTS) and not (
        isinstance(parent, ast.Call) and node in parent.args
    ):
        refuse(
            "the expression sits inside a larger one where the rewrite could regroup it"
        )
    name = node.values[0].id
    start, end = source.span(node)
    left_end = source.span(node.values[0])[1]
    right_start = source.span(node.values[1])[0]
    gap = source.text[left_end:right_start]
    if not GAP.fullmatch(gap):
        refuse("the operator has comments or odd spacing around it")
    tail = source.text[left_end + gap.index("or") + 2 : end].lstrip(" \t\\\r\n")
    if "#" in tail:
        refuse("the default has comments inside")
    return [replacement(start, end, f"{name} if {name} is not None else {tail}")]


def falsy_default(source, node, context):
    if isinstance(node, ast.IfExp):
        return falsy_ternary(source, node)
    if isinstance(node, ast.BoolOp):
        return falsy_or(source, node, context)
    refuse("not an or expression or a conditional")
