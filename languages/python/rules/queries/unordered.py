import ast

from checks.common import dotted_name, finding, own_nodes
from queries.query_chains import (
    MANAGER,
    chain_of,
    expanded,
    is_outermost,
    sqlalchemy_query,
    unordered_model,
)
from queries.sql_order import DYNAMIC, statement_gaps
from security.resolve.scopes import scope_of

RULE = "unordered-query"
GUARDED = True
PAGE_STEPS = {"limit", "offset", "slice", "fetch", "paginate"}
SINGLE_STEPS = {"limit", "fetch"}
COUNT_OR_CONSTANT = {
    "count",
    "literal",
    "literal_column",
    "true",
    "exists",
    "max",
    "min",
    "sum",
    "avg",
}
ORM_AGGREGATES = {"array_agg", "json_agg", "jsonb_agg"}
ORM_FUNC_PREFIXES = ("sqlalchemy.func.", "sqlalchemy.sql.func.", "sqlalchemy.sql.functions.func.")
PG_AGGREGATES = {"sqlalchemy.dialects.postgresql.array_agg"}
DJANGO_AGGREGATES = {"ArrayAgg", "JSONBAgg"}
DJANGO_AGGREGATE_MODULE = "django.contrib.postgres"
DJANGO_ORDER_KEYWORDS = {"ordering", "order_by"}
SUBJECT_LENGTH = 30
QUERYSET_STEPS = {
    "all",
    "filter",
    "exclude",
    "annotate",
    "alias",
    "select_related",
    "prefetch_related",
}
QUERYSET_STEPS |= {
    "only",
    "defer",
    "values",
    "values_list",
    "distinct",
    "using",
    "order_by",
    "reverse",
}
QUERYSET_STEPS |= {"select_for_update", "extra"}


def text_parts(node):
    if isinstance(node, ast.Constant):
        return [node.value] if isinstance(node.value, str) else [DYNAMIC]
    if isinstance(node, ast.JoinedStr):
        return [part for value in node.values for part in text_parts(value)]
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return text_parts(node.left) + text_parts(node.right)
    return [DYNAMIC]


def is_text_root(node, context):
    parent = context.parents.get(id(node))
    if isinstance(parent, ast.JoinedStr) or isinstance(parent, ast.Expr):
        return False
    if isinstance(parent, ast.BinOp) and isinstance(parent.op, ast.Add):
        return False
    if isinstance(node, ast.Constant):
        return isinstance(node.value, str)
    if isinstance(node, ast.BinOp):
        return isinstance(node.op, ast.Add) and any(
            isinstance(part, str) and part != DYNAMIC for part in text_parts(node)
        )
    return isinstance(node, ast.JoinedStr)


def text_findings(context):
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, (ast.Constant, ast.JoinedStr, ast.BinOp)) and is_text_root(
            node, context
        ):
            for _, _, form in statement_gaps("".join(text_parts(node))):
                found.append(finding(context.path, RULE, form, node))
    return found


def ordered(steps):
    return any(
        name == "order_by" and node is not None and (node.args or node.keywords)
        for name, node in steps
    )


def held_name(node, context):
    parent = context.parents.get(id(node))
    if (
        isinstance(parent, ast.Assign)
        and len(parent.targets) == 1
        and isinstance(parent.targets[0], ast.Name)
    ):
        return parent.targets[0].id
    return None


def ordered_later(node, context):
    name = held_name(node, context)
    if name is None:
        return False
    for item in own_nodes(scope_of(node, context) or context.tree):
        root, steps = chain_of(item) if isinstance(item, ast.Call) else (None, [])
        if isinstance(root, ast.Name) and root.id == name and ordered(steps):
            return True
    return False


def short(text):
    return text if len(text) <= SUBJECT_LENGTH and "\n" not in text else "..."


def single_row(step, chains, context):
    name, call = step
    if name not in SINGLE_STEPS or len(call.args) != 1:
        return False
    if not (isinstance(call.args[0], ast.Constant) and call.args[0].value == 1):
        return False
    roots = [root for root, _ in chains if isinstance(root, ast.Call)]
    return bool(roots) and all(selects_count_or_constant(root, context) for root in roots)


def selects_count_or_constant(root, context):
    def constant(item):
        if isinstance(item, ast.Constant):
            return True
        name = (dotted_name(item.func, context.aliases) or "") if isinstance(item, ast.Call) else ""
        return name.rsplit(".", 1)[-1] in COUNT_OR_CONSTANT

    return bool(root.args) and all(constant(item) for item in root.args)


def page_step(step):
    name, node = step
    if name == "[]":
        return isinstance(node.slice, ast.Slice)
    return name in PAGE_STEPS and node is not None and bool(node.args or node.keywords)


def orm_page(node, context):
    _, own = chain_of(node)
    pages = [step for step in own if page_step(step)]
    if not pages:
        return None
    chains = expanded(node, context)
    if chains is None or not sqlalchemy_query(chains, context):
        return None
    if any(ordered(steps) for _, steps in chains) or ordered_later(node, context):
        return None
    if single_row(pages[0], chains, context):
        return None
    name, call = pages[0]
    arguments = ", ".join(ast.unparse(item) for item in [*call.args, *call.keywords])
    return finding(context.path, RULE, short(f".{name}({arguments})"), call)


def querysets_until_slice(steps):
    for name, node in steps:
        if name == "[]":
            return isinstance(node.slice, ast.Slice)
        if name not in QUERYSET_STEPS or node is None:
            return False
    return False


def django_slice(node, context):
    _, own = chain_of(node)
    slices = [step for step in own if step[0] == "[]" and isinstance(step[1].slice, ast.Slice)]
    chains = expanded(node, context) if slices else None
    if not chains or any(ordered(steps) for _, steps in chains):
        return None
    for root, steps in chains:
        if root is None:
            continue
        managed = isinstance(root, ast.Name) and steps and steps[0][0] == MANAGER
        managed = managed and querysets_until_slice(steps[1:])
        if not managed or not unordered_model(root.id, context.project):
            return None
    subscript = slices[0][1]
    return finding(context.path, RULE, short(f"[{ast.unparse(subscript.slice)}]"), subscript)


def chain_findings(context):
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, (ast.Call, ast.Subscript)) and is_outermost(node, context):
            problem = orm_page(node, context) or django_slice(node, context)
            if problem is not None:
                found.append(problem)
    return found


def unordered_aggregate(call, context):
    name = dotted_name(call.func, context.aliases) or ""
    last = name.rsplit(".", 1)[-1]
    if (name.startswith(ORM_FUNC_PREFIXES) and last in ORM_AGGREGATES) or name in PG_AGGREGATES:
        parent = context.parents.get(id(call))
        within = isinstance(parent, ast.Attribute) and parent.attr == "within_group"
        sorted_argument = any(
            (dotted_name(item.func, context.aliases) or "").endswith("aggregate_order_by")
            for item in call.args
            if isinstance(item, ast.Call)
        )
        return None if within or sorted_argument else f"{last}(...)"
    if name.startswith(DJANGO_AGGREGATE_MODULE) and last in DJANGO_AGGREGATES:
        keywords = {keyword.arg for keyword in call.keywords}
        return None if keywords & DJANGO_ORDER_KEYWORDS else f"{last}(...)"
    return None


def aggregate_findings(context):
    found = []
    for node in ast.walk(context.tree):
        subject = unordered_aggregate(node, context) if isinstance(node, ast.Call) else None
        if subject is not None:
            found.append(finding(context.path, RULE, subject, node))
    return found


def check(context):
    if context.tests:
        return []
    return text_findings(context) + chain_findings(context) + aggregate_findings(context)
