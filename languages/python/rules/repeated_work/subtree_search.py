import ast

from checks.common import dotted_name, finding
from checks.loop_scope import FUNCTIONS, ancestors
from containers.scope import contains, is_iterating_lambda
from repeated_work.scope_helpers import reads_memo, reads_name, short_text

RULE = "subtree-search-per-ancestor"
GUARDED = True
PARENT_LINKS = {
    "parent",
    "parent_element",
    "parent_node",
    "parent_path",
    "parentElement",
    "parentNode",
    "parentPath",
}
PARENT_CALLS = {
    "get_parent",
    "get_parent_node",
    "getparent",
    "getParent",
    "getParentNode",
}
SUBTREE_CALLS = {
    "descendants",
    "find_all",
    "findAll",
    "findall",
    "for_each_child",
    "forEachChild",
    "get_elements_by_class_name",
    "get_elements_by_tag_name",
    "getElementsByClassName",
    "getElementsByTagName",
    "glob",
    "iter",
    "iterdescendants",
    "query_selector",
    "query_selector_all",
    "querySelector",
    "querySelectorAll",
    "rglob",
    "select",
    "select_one",
    "traverse",
    "walk",
    "xpath",
}
STANDALONE_SUBTREE_CALLS = {"ast.walk", "ast.iter_child_nodes", "os.walk"}
CHILD_LISTS = {"children", "child_nodes", "childNodes", "descendants"}
CHILD_CALLS = {
    "get_children",
    "getChildren",
    "iter_children",
    "iterchildren",
    "iterdir",
}
ITERATING_BUILTINS = {
    "all",
    "any",
    "enumerate",
    "filter",
    "frozenset",
    "list",
    "map",
    "max",
    "min",
    "reversed",
    "set",
    "sorted",
    "sum",
    "tuple",
}
LIST_SEARCH_METHODS = {"count", "index"}


def is_level(node, name):
    return isinstance(node, ast.Name) and node.id == name


def is_parent_of(value, name):
    if isinstance(value, ast.Attribute):
        return value.attr in PARENT_LINKS and is_level(value.value, name)
    if (
        isinstance(value, ast.Call)
        and not value.args
        and not value.keywords
        and isinstance(value.func, ast.Attribute)
    ):
        return value.func.attr in PARENT_CALLS and is_level(value.func.value, name)
    return False


def parent_step(statement):
    if (
        isinstance(statement, ast.Assign)
        and len(statement.targets) == 1
        and isinstance(statement.targets[0], ast.Name)
    ):
        name = statement.targets[0].id
        return name if is_parent_of(statement.value, name) else None
    if (
        isinstance(statement, ast.AnnAssign)
        and isinstance(statement.target, ast.Name)
        and statement.value is not None
    ):
        name = statement.target.id
        return name if is_parent_of(statement.value, name) else None
    return None


def climbing_step(loop):
    for node in ast.walk(loop.test):
        if isinstance(node, ast.NamedExpr) and is_parent_of(node.value, node.target.id):
            return node.target.id, node
    for statement in loop.body:
        name = parent_step(statement)
        if name is not None:
            return name, None
    return None, None


def is_child_list(node, name):
    if isinstance(node, ast.Attribute):
        return node.attr in CHILD_LISTS and is_level(node.value, name)
    if (
        isinstance(node, ast.Call)
        and not node.args
        and not node.keywords
        and isinstance(node.func, ast.Attribute)
    ):
        return node.func.attr in CHILD_CALLS and is_level(node.func.value, name)
    return False


def is_subtree_call(node, name, aliases):
    if not isinstance(node, ast.Call):
        return False
    if (
        isinstance(node.func, ast.Attribute)
        and node.func.attr in SUBTREE_CALLS
        and is_level(node.func.value, name)
    ):
        return True
    dotted = dotted_name(node.func, aliases) or ""
    return (
        dotted in STANDALONE_SUBTREE_CALLS
        and bool(node.args)
        and is_level(node.args[0], name)
    )


def search_shown(node, name, aliases):
    if is_subtree_call(node, name, aliases):
        return node
    if isinstance(node, (ast.For, ast.AsyncFor, ast.comprehension)):
        return node.iter if is_child_list(node.iter, name) else None
    if isinstance(node, ast.Starred):
        return node.value if is_child_list(node.value, name) else None
    if (
        isinstance(node, ast.Compare)
        and len(node.ops) == 1
        and isinstance(node.ops[0], (ast.In, ast.NotIn))
        and is_child_list(node.comparators[0], name)
    ):
        return node
    if isinstance(node, ast.Call):
        if (
            isinstance(node.func, ast.Name)
            and node.func.id in ITERATING_BUILTINS
            and any(is_child_list(arg, name) for arg in node.args)
        ):
            return node
        if (
            isinstance(node.func, ast.Attribute)
            and node.func.attr in LIST_SEARCH_METHODS
            and is_child_list(node.func.value, name)
        ):
            return node
    return None


def position(node):
    if isinstance(node, ast.comprehension):
        node = node.iter
    return (node.lineno, node.col_offset)


def subtree_searches(loop, name, aliases):
    found = []
    for statement in loop.body:
        for node in ast.walk(statement):
            shown = search_shown(node, name, aliases)
            if shown is not None:
                found.append((node, shown))
    found.sort(key=lambda pair: position(pair[0]))
    return found


def header_narrows(loop, name, walrus_step):
    for node in ast.walk(loop.test):
        if walrus_step is not None and contains(walrus_step, node):
            continue
        if isinstance(node, ast.Attribute) and is_level(node.value, name):
            return True
    return False


def narrowing_tests(statement):
    for node in ast.walk(statement):
        if isinstance(node, (ast.If, ast.IfExp)):
            yield node.test
        elif isinstance(node, ast.Match):
            yield node.subject
        elif isinstance(node, ast.BoolOp):
            yield from node.values[:-1]


def is_narrowed(loop, search, name, walrus_step):
    if header_narrows(loop, name, walrus_step):
        return True
    search_pos = position(search)
    for statement in loop.body:
        for test in narrowing_tests(statement):
            if (
                position(test) < search_pos
                and not contains(test, search)
                and reads_name(test, name, except_node=search)
            ):
                return True
    return False


def in_nested_function(search, loop, parents):
    chain = ancestors(search, parents)
    stop = chain.index(loop) if loop in chain else len(chain)
    return any(
        isinstance(node, FUNCTIONS) and not is_iterating_lambda(node, parents)
        for node in chain[1:stop]
    )


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.While):
            continue
        name, walrus_step = climbing_step(node)
        if name is None or reads_memo(
            node, lambda arg, target=name: reads_name(arg, target)
        ):
            continue
        for search, shown in subtree_searches(node, name, context.aliases):
            if not (
                is_narrowed(node, search, name, walrus_step)
                or in_nested_function(search, node, context.parents)
            ):
                subject = f"{name}|{short_text(shown)}"
                found.append(finding(context.path, RULE, subject, search))
                break
    return found
