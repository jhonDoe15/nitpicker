import ast

from design.astutil import chain, chain_text, constant_text, own_nodes
from design.classes import enum_cases
from design.evaluate import evaluate
from design.lookup import find_member
from design.symbols import Klass, LiteralAlias


def is_none(node):
    return isinstance(node, ast.Constant) and node.value is None


MATCH = getattr(ast, "Match", None)
VALUE_PATTERN = getattr(ast, "MatchValue", None)
SINGLETON_PATTERN = getattr(ast, "MatchSingleton", None)
OR_PATTERN = getattr(ast, "MatchOr", None)
AS_PATTERN = getattr(ast, "MatchAs", None)


def constant_of(scope, node):
    text = None if is_none(node) else constant_text(node)
    if text is not None:
        return text
    if isinstance(node, ast.Attribute):
        base = evaluate(scope, node.value)
        if base is not None and base[0] == "cls":
            if node.attr in (enum_cases(scope.index, base[1]) or []):
                return node.attr
    return None


def constants_of(scope, node):
    if isinstance(node, (ast.Tuple, ast.List, ast.Set)):
        found = [constant_of(scope, element) for element in node.elts]
        return found if found and None not in found else None
    single = constant_of(scope, node)
    return [single] if single is not None else None


def enum_subject(scope, expression):
    value = evaluate(scope, expression)
    if value is None or value[0] != "inst":
        return None
    typedef = value[1]
    is_enum = (
        isinstance(typedef, LiteralAlias)
        or enum_cases(scope.index, typedef) is not None
    )
    return typedef.id if is_enum else None


def field_subject(scope, expression):
    if not isinstance(expression, ast.Attribute):
        return None
    base = evaluate(scope, expression.value)
    if base is None or base[0] != "inst" or not isinstance(base[1], Klass):
        return None
    member = find_member(scope.index, base[1], expression.attr)
    if member is None or member[0] is not None:
        return None
    return f"{member[1].id}.{expression.attr}"


def subject_id(scope, expression):
    if chain(expression) is None:
        return None
    return enum_subject(scope, expression) or field_subject(scope, expression)


def comparison_arm(scope, test):
    if not isinstance(test, ast.Compare) or len(test.ops) != 1:
        return None
    operator, left, right = test.ops[0], test.left, test.comparators[0]
    if isinstance(operator, (ast.Eq, ast.Is)):
        for subject, other in ((left, right), (right, left)):
            constants = constants_of(scope, other)
            if (
                constants is not None
                and chain(subject) is not None
                and len(constants) == 1
            ):
                return subject, constants
        return None
    if isinstance(operator, ast.In) and chain(left) is not None:
        constants = constants_of(scope, right)
        return (left, constants) if constants is not None else None
    return None


def arm_of(scope, test):
    if isinstance(test, ast.BoolOp) and isinstance(test.op, ast.Or):
        parts = [comparison_arm(scope, value) for value in test.values]
        if None in parts or len({chain_text(p[0]) for p in parts}) != 1:
            return None
        return parts[0][0], [c for _, constants in parts for c in constants]
    return comparison_arm(scope, test)


def chain_groups(scope, node, absorbed):
    first = arm_of(scope, node.test)
    if first is None:
        return None
    subject, groups, otherwise = first[0], [first[1]], False
    while True:
        absorbed.add(id(node))
        if not node.orelse:
            break
        follower = node.orelse[0] if len(node.orelse) == 1 else None
        arm = arm_of(scope, follower.test) if isinstance(follower, ast.If) else None
        if arm is None or chain_text(arm[0]) != chain_text(subject):
            otherwise = True
            break
        groups.append(arm[1])
        node = follower
    return subject, groups, otherwise


def if_decisions(scope, nodes):
    absorbed, found = set(), []
    for node in sorted(nodes, key=lambda n: (n.lineno, n.col_offset)):
        if id(node) in absorbed:
            continue
        chain_result = chain_groups(scope, node, absorbed)
        if chain_result is None:
            continue
        identifier = subject_id(scope, chain_result[0])
        if identifier is not None:
            found.append(
                decision(identifier, chain_result[1], node.lineno, chain_result[2])
            )
    return found


def decision(identifier, groups, line, otherwise):
    fact = {"subject": identifier, "groups": groups, "line": line}
    if otherwise:
        fact["otherwise"] = True
    return fact


def pattern_constants(scope, pattern):
    if VALUE_PATTERN is not None and isinstance(pattern, VALUE_PATTERN):
        value = constant_of(scope, pattern.value)
        return [value] if value is not None else None
    if isinstance(pattern, SINGLETON_PATTERN):
        return None if pattern.value is None else [str(pattern.value)]
    if isinstance(pattern, OR_PATTERN):
        parts = [pattern_constants(scope, p) for p in pattern.patterns]
        return None if None in parts else [c for part in parts for c in part]
    return None


def match_decision(scope, node):
    identifier = subject_id(scope, node.subject)
    if identifier is None:
        return None
    groups, otherwise = [], False
    for case in node.cases:
        pattern = case.pattern
        wildcard = isinstance(pattern, AS_PATTERN) and pattern.pattern is None
        if case.guard is not None:
            return None
        if wildcard:
            otherwise = True
            continue
        constants = pattern_constants(scope, pattern)
        if constants is None:
            return None
        groups.append(constants)
    return decision(identifier, groups, node.lineno, otherwise)


def decisions(scope):
    nodes = list(own_nodes(scope.function.node))
    found = if_decisions(scope, [n for n in nodes if isinstance(n, ast.If)])
    if MATCH is not None:
        matches = [match_decision(scope, n) for n in nodes if isinstance(n, MATCH)]
        found.extend(m for m in matches if m is not None)
    return sorted(found, key=lambda fact: fact["line"])
