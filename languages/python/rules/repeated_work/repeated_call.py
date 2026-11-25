import ast

from checks.common import finding, functions_of, last_name, own_nodes
from checks.loop_scope import ancestors
from containers.scope import contains, parameter_names, store_targets
from repeated_work.scope_helpers import (
    has_caching_decorator,
    is_fs_call,
    is_settled,
    is_verb,
    names_in,
    reads_memo,
    same_ast,
    short_text,
)

RULE = "repeated-call"
GUARDED = True
CHEAP = {
    "abs",
    "at",
    "basename",
    "bool",
    "bytes",
    "chr",
    "count",
    "dirname",
    "endswith",
    "exists",
    "extname",
    "find",
    "float",
    "get",
    "getattr",
    "get_attribute",
    "get_item",
    "has",
    "hasattr",
    "id",
    "index",
    "int",
    "is_dir",
    "is_file",
    "is_present",
    "isinstance",
    "issubclass",
    "item",
    "items",
    "keys",
    "len",
    "lower",
    "lstrip",
    "max",
    "min",
    "normpath",
    "ord",
    "replace",
    "repr",
    "rfind",
    "rindex",
    "round",
    "rsplit",
    "rstrip",
    "size",
    "slice",
    "split",
    "splitext",
    "splitlines",
    "startswith",
    "str",
    "strip",
    "sum",
    "to_string",
    "trim",
    "type",
    "upper",
    "values",
}
PYTHON_BUILTINS = {
    "abs",
    "all",
    "any",
    "ascii",
    "bin",
    "bool",
    "bytearray",
    "bytes",
    "callable",
    "chr",
    "classmethod",
    "complex",
    "delattr",
    "dict",
    "dir",
    "divmod",
    "enumerate",
    "filter",
    "float",
    "format",
    "frozenset",
    "getattr",
    "globals",
    "hasattr",
    "hash",
    "hex",
    "id",
    "input",
    "int",
    "isinstance",
    "issubclass",
    "iter",
    "len",
    "list",
    "locals",
    "map",
    "max",
    "memoryview",
    "min",
    "next",
    "object",
    "oct",
    "open",
    "ord",
    "pow",
    "print",
    "property",
    "range",
    "repr",
    "reversed",
    "round",
    "set",
    "setattr",
    "slice",
    "sorted",
    "staticmethod",
    "str",
    "sum",
    "super",
    "tuple",
    "type",
    "vars",
    "zip",
}
EQUALITY_OPS = (ast.Is, ast.IsNot, ast.Eq, ast.NotEq)


def is_costly_pure_looking(call, aliases):
    name = last_name(call.func)
    if name is None or not (call.args or call.keywords):
        return False
    if name in CHEAP or is_verb(name):
        return False
    if isinstance(call.func, ast.Name) and call.func.id in PYTHON_BUILTINS:
        return False
    if is_fs_call(call, aliases):
        return False
    if not is_settled(call.func):
        return False
    values = [*call.args, *(keyword.value for keyword in call.keywords)]
    return all(is_settled(value) for value in values)


def spine_step(node):
    if isinstance(node, (ast.Attribute, ast.Subscript)):
        return node.value
    if isinstance(node, ast.Call):
        return node.func
    if isinstance(node, (ast.Compare, ast.BinOp)):
        return node.left
    if isinstance(node, ast.BoolOp) and node.values:
        return node.values[0]
    if isinstance(node, ast.UnaryOp):
        return node.operand
    if isinstance(node, ast.Await):
        return node.value
    return None


def spine_nodes(expression):
    nodes = []
    current = expression
    while current is not None:
        nodes.append(current)
        current = spine_step(current)
    return nodes


def spine_calls(expression):
    return [node for node in spine_nodes(expression) if isinstance(node, ast.Call)]


def last_tested(test):
    current = test
    while isinstance(current, ast.BoolOp) and current.values:
        current = current.values[-1]
    return current


def settled_around(node, inner):
    current = node
    while current is not None:
        if current is inner:
            return True
        toward = spine_step(current)
        if toward is None or not contains(toward, inner):
            return False
        for child in ast.iter_child_nodes(current):
            if child is not toward and not is_settled(child):
                return False
        current = toward
    return False


def is_none_literal(node):
    return isinstance(node, ast.Constant) and node.value is None


def compares_itself(node, call):
    if isinstance(node, ast.Compare) and node.left is call:
        return not (
            len(node.ops) == 1
            and isinstance(node.ops[0], EQUALITY_OPS)
            and is_none_literal(node.comparators[0])
        )
    if isinstance(node, ast.UnaryOp) and node.operand is call:
        return not isinstance(node.op, ast.Not)
    return False


def tests_presence(test, call):
    spine = spine_nodes(test)
    end = spine.index(call) if call in spine else len(spine)
    return not any(compares_itself(node, call) for node in spine[:end])


def used_as_value(use, call, parents):
    if call is use:
        return True
    parent = parents.get(id(call))
    return isinstance(parent, (ast.Attribute, ast.Subscript)) and parent.value is call


def first_use(statements):
    if not statements:
        return None
    first = statements[0]
    if isinstance(first, (ast.Expr, ast.Return)):
        return first.value
    if isinstance(first, ast.Raise):
        return first.exc
    if isinstance(first, ast.Assign):
        return first.value
    if isinstance(first, ast.AnnAssign):
        return first.value
    return None


def test_use_pairs(node):
    if isinstance(node, ast.BoolOp):
        return [
            (node.values[index], [node.values[index + 1]])
            for index in range(len(node.values) - 1)
        ]
    if isinstance(node, ast.IfExp):
        return [(node.test, [node.body, node.orelse])]
    if isinstance(node, ast.If):
        return [(node.test, [first_use(node.body), first_use(node.orelse)])]
    return []


def tested_then_used_matches(node, aliases, parents):
    matches = []
    for raw_test, uses in test_use_pairs(node):
        tested = last_tested(raw_test)
        candidates = [
            call
            for call in spine_calls(tested)
            if is_costly_pure_looking(call, aliases)
            and not isinstance(parents.get(id(call)), ast.Await)
            and settled_around(tested, call)
            and tests_presence(tested, call)
        ]
        if not candidates:
            continue
        for use in uses:
            if use is None:
                continue
            for second in spine_calls(use):
                if used_as_value(use, second, parents) and any(
                    same_ast(first, second) for first in candidates
                ):
                    matches.append(second)
                    break
    return matches


def shares_state(function):
    for node in own_nodes(function):
        if isinstance(node, (ast.Global, ast.Nonlocal)):
            return True
        for target in store_targets(node):
            if isinstance(target, (ast.Attribute, ast.Subscript)):
                return True
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and is_verb(node.func.attr)
        ):
            return True
    return False


def is_self_call(call, function):
    if isinstance(call.func, ast.Name):
        return call.func.id == function.name
    positional = function.args.posonlyargs + function.args.args
    first_param = positional[0].arg if positional else None
    return (
        first_param == "self"
        and isinstance(call.func, ast.Attribute)
        and isinstance(call.func.value, ast.Name)
        and call.func.value.id == "self"
        and call.func.attr == function.name
    )


def reassigned_names(function):
    params = parameter_names(function)
    counts = {}
    for node in own_nodes(function):
        if isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
            counts[node.id] = counts.get(node.id, 0) + 1
    return {
        name
        for name, count in counts.items()
        if count > 1 or (name in params and count >= 1)
    }


def branch_tag(ancestor, child):
    if isinstance(ancestor, ast.If):
        if child in ancestor.body:
            return f"if:{id(ancestor)}:body"
        if child in ancestor.orelse:
            return f"if:{id(ancestor)}:orelse"
    if isinstance(ancestor, ast.IfExp):
        if child is ancestor.body:
            return f"ifexp:{id(ancestor)}:body"
        if child is ancestor.orelse:
            return f"ifexp:{id(ancestor)}:orelse"
    if isinstance(ancestor, ast.BoolOp) and child in ancestor.values[1:]:
        return f"bool:{id(ancestor)}:{ancestor.values.index(child)}"
    if isinstance(ancestor, (ast.ExceptHandler, ast.match_case)):
        return f"branch:{id(ancestor)}"
    if isinstance(ancestor, (ast.For, ast.AsyncFor, ast.While)):
        if child in ancestor.body:
            return f"loop:{id(ancestor)}:body"
        if child in ancestor.orelse:
            return f"loop:{id(ancestor)}:orelse"
    return None


def branch_path(call, function, parents):
    chain = ancestors(call, parents)
    stop = chain.index(function) if function in chain else len(chain)
    tags = []
    for index in range(1, stop):
        tag = branch_tag(chain[index], chain[index - 1])
        if tag is not None:
            tags.append(tag)
    return tuple(tags)


def call_argument_values(call):
    return [*call.args, *(keyword.value for keyword in call.keywords)]


def repeated_recursion_call(function, aliases, parents):
    if has_caching_decorator(function, aliases) or shares_state(function):
        return None
    reassigned = reassigned_names(function)
    calls = []
    for node in own_nodes(function):
        if not (isinstance(node, ast.Call) and is_self_call(node, function)):
            continue
        if isinstance(parents.get(id(node)), ast.Expr):
            continue
        values = call_argument_values(node)
        if not values:
            continue
        if all(
            is_settled(value) and not (names_in(value) & reassigned)
            for value in values
        ):
            calls.append(node)
    calls.sort(key=lambda item: (item.lineno, item.col_offset))
    for index, first in enumerate(calls):
        first_path = branch_path(first, function, parents)
        arg_names = set().union(*(names_in(v) for v in call_argument_values(first)))
        for second in calls[index + 1 :]:
            if (
                same_ast(first, second)
                and branch_path(second, function, parents) == first_path
                and not reads_memo(
                    function, lambda arg, keys=arg_names: bool(names_in(arg) & keys)
                )
            ):
                return second
    return None


def check(context):
    if context.tests:
        return []
    found = []
    seen_ids = set()
    for node in ast.walk(context.tree):
        for match in tested_then_used_matches(node, context.aliases, context.parents):
            if id(match) not in seen_ids:
                seen_ids.add(id(match))
                subject = f"call|{short_text(match)}"
                found.append(finding(context.path, RULE, subject, match))
    for function in functions_of(context.tree):
        duplicate = repeated_recursion_call(function, context.aliases, context.parents)
        if duplicate is not None and id(duplicate) not in seen_ids:
            seen_ids.add(id(duplicate))
            subject = f"recursion|{ast.unparse(duplicate.func)}|{short_text(duplicate)}"
            found.append(finding(context.path, RULE, subject, duplicate))
    return found
