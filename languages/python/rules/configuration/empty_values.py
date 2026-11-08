import ast

from checks.common import call_name, dotted_name, finding, overlap_sites

RULE = "env-none-only-check"
OVERLAPS = {RULE: ("PLW1508",)}
READERS = {"os.getenv", "os.environ.get", "os.getenvb", "os.environb.get"}
ENVIRONS = {"os.environ", "os.environb"}
MEASURES = {"len", "bool"}
STRIPS = {"strip", "lstrip", "rstrip"}


def is_none(node):
    return isinstance(node, ast.Constant) and node.value is None


def is_empty_text(node):
    return isinstance(node, ast.Constant) and node.value in ("", b"")


def key_of(call):
    first = call.args[0] if call.args else None
    return first.value if isinstance(first, ast.Constant) else None


def default_of(call):
    if len(call.args) > 1:
        return call.args[1]
    return next(
        (item.value for item in call.keywords if item.arg in ("default", "value")),
        None,
    )


def env_read(node, aliases):
    if not isinstance(node, ast.Call) or call_name(node, aliases) not in READERS:
        return None
    default = default_of(node)
    return key_of(node) if default is None or is_none(default) else None


def store_counts(tree):
    counts = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            counts[node.id] = counts.get(node.id, 0) + 1
    return counts


def env_names(tree, aliases):
    counts = store_counts(tree)
    names = {}
    for node in ast.walk(tree):
        targets = node.targets if isinstance(node, ast.Assign) else []
        if isinstance(node, ast.AnnAssign) and node.value is not None:
            targets = [node.target]
        key = env_read(node.value, aliases) if targets else None
        for target in targets if key is not None else []:
            if isinstance(target, ast.Name) and counts.get(target.id) == 1:
                names[target.id] = key
    return names


def subject_of(node, context, names):
    if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
        return names.get(node.id)
    return env_read(node, context.aliases)


def none_test(node, context, names):
    if not (isinstance(node, ast.Compare) and len(node.ops) == 1):
        return None
    if not isinstance(node.ops[0], (ast.Is, ast.IsNot, ast.Eq, ast.NotEq)):
        return None
    left, right = node.left, node.comparators[0]
    if is_none(right):
        return subject_of(left, context, names)
    return subject_of(right, context, names) if is_none(left) else None


def membership_test(node, context):
    if not (isinstance(node, ast.Compare) and len(node.ops) == 1):
        return None
    if not isinstance(node.ops[0], (ast.In, ast.NotIn)):
        return None
    owner = node.comparators[0]
    if dotted_name(owner, context.aliases) not in ENVIRONS:
        return None
    return node.left.value if isinstance(node.left, ast.Constant) else None


def condition_root(node, context):
    current = node
    parent = context.parents.get(id(current))
    while isinstance(parent, ast.BoolOp) or (
        isinstance(parent, ast.UnaryOp) and isinstance(parent.op, ast.Not)
    ):
        current = parent
        parent = context.parents.get(id(current))
    return current


def leaves_of(root):
    pending = [root]
    leaves = []
    for current in pending:
        if isinstance(current, ast.BoolOp):
            pending.extend(current.values)
        elif isinstance(current, ast.UnaryOp) and isinstance(current.op, ast.Not):
            pending.append(current.operand)
        else:
            leaves.append(current)
    return leaves


def unstripped(node):
    while (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in STRIPS
        and not node.args
    ):
        node = node.func.value
    return node


def emptiness_subject(leaf, context, names):
    if isinstance(leaf, ast.Call) and isinstance(leaf.func, ast.Name) and leaf.args:
        if leaf.func.id in MEASURES:
            return subject_of(unstripped(leaf.args[0]), context, names)
    if isinstance(leaf, ast.Compare) and len(leaf.ops) == 1:
        sides = [leaf.left, leaf.comparators[0]]
        if any(is_empty_text(side) for side in sides):
            other = next(side for side in sides if not is_empty_text(side))
            return subject_of(unstripped(other), context, names)
        measured = next((side for side in sides if isinstance(side, ast.Call)), None)
        return None if measured is None else emptiness_subject(measured, context, names)
    return subject_of(unstripped(leaf), context, names)


def tests_emptiness(node, key, context, names):
    return any(
        leaf is not node and emptiness_subject(leaf, context, names) == key
        for leaf in leaves_of(condition_root(node, context))
    )


def fallback_key(node, context):
    if not isinstance(node, ast.Call) or call_name(node, context.aliases) not in READERS:
        return None
    default = default_of(node)
    if default is None or is_none(default) or is_empty_text(default):
        return None
    return key_of(node)


def check(context):
    if context.tests:
        return []
    names = env_names(context.tree, context.aliases)
    found = []
    for node in ast.walk(context.tree):
        key = none_test(node, context, names) or membership_test(node, context)
        if key is not None and not tests_emptiness(node, key, context, names):
            found.append(finding(context.path, RULE, key, node))
            continue
        fallback = fallback_key(node, context)
        if fallback is not None:
            found.append(finding(context.path, RULE, fallback, node))
    return found


def allowances(context):
    return overlap_sites(check(context), OVERLAPS)
