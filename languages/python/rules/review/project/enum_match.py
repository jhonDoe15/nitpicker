import ast

COLLECTION_CALLS = {"frozenset", "set", "tuple", "list"}


def listed_collection(node):
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id in COLLECTION_CALLS
        and len(node.args) == 1
        and not node.keywords
    ):
        node = node.args[0]
    if isinstance(node, (ast.Tuple, ast.List, ast.Set)) and node.elts:
        return node.elts
    return None


def is_wildcard(pattern):
    return isinstance(pattern, ast.MatchAs) and pattern.pattern is None


def pattern_values(pattern):
    if isinstance(pattern, ast.MatchValue):
        return [pattern.value]
    if isinstance(pattern, ast.MatchOr) and all(
        isinstance(option, ast.MatchValue) for option in pattern.patterns
    ):
        return [option.value for option in pattern.patterns]
    return None


def returned_boolean(body):
    if len(body) != 1 or not isinstance(body[0], ast.Return):
        return None
    value = body[0].value
    if isinstance(value, ast.Constant) and isinstance(value.value, bool):
        return value.value
    return None


def match_values(node):
    if not isinstance(node, ast.Match) or len(node.cases) < 2:
        return None
    *listed, last = node.cases
    fallback = returned_boolean(last.body)
    if fallback is None or last.guard is not None or not is_wildcard(last.pattern):
        return None
    values = []
    for case in listed:
        found = pattern_values(case.pattern)
        if found is None or case.guard is not None:
            return None
        if returned_boolean(case.body) != (not fallback):
            return None
        values.extend(found)
    return values
