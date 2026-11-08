import ast

from checks.common import call_name, dotted_name, finding
from credentials.hardcoded import check as secret_check
from environment.environment import check as environment_check

RULE = "env-none-only-check"
OWNERS = {"process-env-access", "hardcoded-secret"}
READERS = {"os.getenv", "os.environ.get", "os.getenvb", "os.environb.get"}
ENVIRONS = {"os.environ", "os.environb"}
MEASURES = {"len", "bool"}
STRIPS = {"strip", "lstrip", "rstrip"}


def is_none(node):
    return isinstance(node, ast.Constant) and node.value is None


def is_empty_text(node):
    return isinstance(node, ast.Constant) and node.value in ("", b"")


def is_other_constant(node):
    return isinstance(node, ast.Constant) and not isinstance(node.value, (str, bytes))


def key_of(call):
    named = (item.value for item in call.keywords if item.arg == "key")
    first = call.args[0] if call.args else next(named, None)
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


def bound_names(node):
    if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
        return [node.id]
    if isinstance(node, ast.arg):
        return [node.arg]
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        return [node.name]
    if isinstance(node, ast.ExceptHandler) and node.name:
        return [node.name]
    if isinstance(node, ast.alias):
        return [node.asname or node.name.split(".")[0]]
    return []


def store_counts(tree):
    counts = {}
    for node in ast.walk(tree):
        for name in bound_names(node):
            counts[name] = counts.get(name, 0) + 1
    return counts


def assignment_targets(node):
    if isinstance(node, ast.Assign):
        return node.targets
    if isinstance(node, (ast.AnnAssign, ast.NamedExpr)) and node.value is not None:
        return [node.target]
    return []


def env_names(tree, aliases):
    counts = store_counts(tree)
    names = {}
    for node in ast.walk(tree):
        targets = assignment_targets(node)
        key = env_read(node.value, aliases) if targets else None
        for target in targets if key is not None else []:
            if isinstance(target, ast.Name) and counts.get(target.id) == 1:
                names[target.id] = key
    return names


def subject_of(node, context, names):
    if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
        return names.get(node.id)
    if isinstance(node, ast.NamedExpr):
        return env_read(node.value, context.aliases)
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
    if isinstance(leaf, ast.Call) and isinstance(leaf.func, ast.Attribute):
        receiver = subject_of(unstripped(leaf.func.value), context, names)
        if receiver is not None:
            return receiver
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
    if default is None or is_empty_text(default) or is_other_constant(default):
        return None
    return key_of(node)


def reported_lines(context):
    return {
        item["line"]
        for item in environment_check(context) + secret_check(context)
        if item["rule"] in OWNERS
    }


def check(context):
    if context.tests:
        return []
    names = env_names(context.tree, context.aliases)
    taken = reported_lines(context)
    found = []
    for node in ast.walk(context.tree):
        if getattr(node, "lineno", None) in taken:
            continue
        key = none_test(node, context, names) or membership_test(node, context)
        if key is not None and not tests_emptiness(node, key, context, names):
            found.append(finding(context.path, RULE, key, node))
            continue
        fallback = fallback_key(node, context)
        if fallback is not None:
            found.append(finding(context.path, RULE, fallback, node))
    return found
