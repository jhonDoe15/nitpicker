import ast

from design.calls.calls import receiver_key
from design.resolve.lookup import find_member
from design.resolve.symbols import Klass
from design.support.astutil import all_nodes
from design.types.classes import classify

READ_KINDS = {"class", "data"}


def condition_roots(function_node):
    roots = []
    for node in all_nodes(function_node):
        if isinstance(node, (ast.If, ast.While, ast.IfExp)):
            roots.append(node.test)
        elif isinstance(node, ast.comprehension):
            roots.extend(node.ifs)
        elif getattr(ast, "Match", None) and isinstance(node, ast.Match):
            roots.append(node.subject)
        elif getattr(ast, "match_case", None) and isinstance(node, ast.match_case):
            roots.extend([node.guard] if node.guard is not None else [])
    return roots


def decided_ids(function_node):
    return {
        id(inner)
        for root in condition_roots(function_node)
        for inner in all_nodes(root)
    }


def value_type(scope, node):
    if isinstance(node, ast.Name):
        if node.id == scope.self_name or node.id not in scope.sites:
            return None
        return scope.local_type(node.id)
    if (
        isinstance(node, ast.Attribute)
        and isinstance(node.value, ast.Name)
        and node.value.id == scope.self_name
        and isinstance(scope.owner, Klass)
    ):
        return scope.index.attribute_type_via(scope.owner, node.attr)
    return None


def is_member_read(scope, typedef, attribute):
    if (
        not isinstance(typedef, Klass)
        or classify(scope.index, typedef) not in READ_KINDS
    ):
        return False
    found = find_member(scope.index, typedef, attribute)
    return found is not None and (found[0] is None or found[0].is_property)


def reads(scope):
    decided = decided_ids(scope.function.node)
    entries = {}
    for node in all_nodes(scope.function.node):
        if not isinstance(node, ast.Attribute) or not isinstance(node.ctx, ast.Load):
            continue
        typedef = value_type(scope, node.value)
        if typedef is None or not is_member_read(scope, typedef, node.attr):
            continue
        key = receiver_key(scope, node.value)
        if key is None:
            continue
        entry = entries.setdefault(
            key, {"type": typedef.id, "fields": {}, "decided": {}, "line": node.lineno}
        )
        entry["line"] = min(entry["line"], node.lineno)
        at = (node.lineno, node.col_offset)
        entry["fields"][node.attr] = min(at, entry["fields"].get(node.attr, at))
        if id(node) in decided:
            entry["decided"].setdefault(node.attr, None)
    return [
        entry_fact(entry) for entry in sorted(entries.values(), key=lambda e: e["line"])
    ]


def entry_fact(entry):
    ordered = sorted(entry["fields"], key=lambda name: entry["fields"][name])
    fact = {"type": entry["type"], "fields": ordered, "line": entry["line"]}
    decided = [name for name in ordered if name in entry["decided"]]
    if decided:
        fact["decided"] = decided
    return fact
