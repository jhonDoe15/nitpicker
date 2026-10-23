import ast
from collections import namedtuple

from checks.common import dotted_name
from orm.models import class_assignments, relations_of
from security.resolve.scopes import MAX_HOPS, definition, lookup, where_of

Origin = namedtuple("Origin", "model context orm plan text relations")
Segment = namedtuple("Segment", "name call")
FORWARD = "*forward"
EVERYTHING = "*"
WRAPPERS = {"list", "tuple", "iter", "reversed", "set"}
DJANGO_QUERYSET = {
    "all",
    "filter",
    "exclude",
    "order_by",
    "distinct",
    "annotate",
    "only",
    "defer",
    "iterator",
    "reverse",
    "select_related",
    "prefetch_related",
    "select_for_update",
    "using",
    "union",
    "intersection",
    "difference",
    "alias",
}
DJANGO_MANAGERS = {"objects", "_default_manager"}
SQLALCHEMY_STATEMENT = {
    "where",
    "filter",
    "filter_by",
    "order_by",
    "limit",
    "offset",
    "options",
    "join",
    "outerjoin",
    "distinct",
    "group_by",
    "having",
    "with_for_update",
    "execution_options",
}
SQLALCHEMY_RESULT = {"all", "unique"}
SCALAR_EXECUTES = {"scalars", "exec"}
NOT_LOADING = {"defaultload", "lazyload", "noload", "raiseload"}
SQLALCHEMY_SELECTS = {
    "sqlalchemy.select",
    "sqlalchemy.future.select",
    "sqlmodel.select",
}


def strip(node):
    while True:
        if isinstance(node, (ast.Await, ast.Subscript)):
            node = node.value
        elif (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id in WRAPPERS
            and len(node.args) == 1
        ):
            node = node.args[0]
        else:
            return node


def segments(node):
    parts = []
    while True:
        if isinstance(node, ast.Await):
            node = node.value
        elif isinstance(node, ast.Call):
            parts.append(node)
            node = node.func
        elif isinstance(node, ast.Attribute):
            parts.append(node.attr)
            node = node.value
        elif isinstance(node, ast.Name):
            parts.append(node.id)
            break
        else:
            return None
    result = []
    for part in reversed(parts):
        if isinstance(part, str):
            result.append(Segment(part, None))
        elif result and result[-1].call is None:
            result[-1] = Segment(result[-1].name, part)
        else:
            return None
    return result


def loader_targets(argument):
    targets = []
    node = argument
    while isinstance(node, ast.Call):
        function = node.func
        loader = function.attr if isinstance(function, ast.Attribute) else None
        loader = loader or getattr(function, "id", "")
        if node.args and loader not in NOT_LOADING:
            targets.append(node.args[0])
        node = function.value if isinstance(function, ast.Attribute) else None
    return targets


def plan_names(arguments):
    names = set()
    for argument in arguments:
        if isinstance(argument, ast.Starred):
            return {EVERYTHING}
        targets = (
            loader_targets(argument) if isinstance(argument, ast.Call) else [argument]
        )
        for node in (n for target in targets for n in ast.walk(target)):
            if isinstance(node, ast.Attribute):
                names.add(node.attr)
            elif isinstance(node, ast.Constant) and isinstance(node.value, str):
                names.update(node.value.split("__"))
    return names or {EVERYTHING}


def segments_text(parts):
    texts = []
    for part in parts[:-1]:
        arguments = part.call is not None and (part.call.args or part.call.keywords)
        call = "(...)" if arguments else "()" if part.call is not None else ""
        texts.append(f"{part.name}{call}")
    return ".".join(texts + [f"{parts[-1].name}()"])


def single_value(name, where):
    entries = lookup(name, where)
    if len(entries) != 1 or entries[0][0] != "value":
        return None
    return entries[0][1], entries[0][2]


def resolve_name(node, where, depth=0):
    while isinstance(node, ast.Name) and depth <= MAX_HOPS:
        found = single_value(node.id, where)
        if found is None:
            return None, where
        node, where = found
        depth += 1
    return node, where


def has_custom_manager(cls):
    return any(name in DJANGO_MANAGERS for name, _value in class_assignments(cls))


def django_plan(parts):
    plan = set()
    for part in parts:
        if part.name == "select_related":
            plan |= plan_names(part.call.args) if part.call.args else {FORWARD}
        elif part.name == "prefetch_related":
            plan |= plan_names(part.call.args)
    return plan


def django_origin(parts, where):
    if len(parts) < 3 or parts[1].name not in DJANGO_MANAGERS or parts[0].call:
        return None
    chain = parts[2:]
    if not all(p.call is not None and p.name in DJANGO_QUERYSET for p in chain):
        return None
    found = definition(ast.Name(id=parts[0].name), where)
    if found is None or has_custom_manager(found[0]):
        return None
    orm, relations = relations_of(found[0], found[1].context)
    if orm != "django":
        return None
    text = segments_text(parts)
    return Origin(found[0], found[1].context, orm, django_plan(chain), text, relations)


def select_entity(node, where):
    node, place = resolve_name(node, where)
    parts = segments(node) if node is not None else None
    if not parts or parts[0].call is None or len(parts[0].call.args) != 1:
        return None
    selector = dotted_name(parts[0].call.func, place.context.aliases)
    entity = parts[0].call.args[0]
    if selector not in SQLALCHEMY_SELECTS or not isinstance(entity, ast.Name):
        return None
    if not all(
        p.call is not None and p.name in SQLALCHEMY_STATEMENT for p in parts[1:]
    ):
        return None
    return entity, place, [p for p in parts[1:] if p.name == "options"]


def sqlalchemy_origin(entity, place, options, text):
    found = definition(entity, place)
    if found is None:
        return None
    orm, relations = relations_of(found[0], found[1].context)
    if orm != "sqlalchemy":
        return None
    plan = set()
    for part in options:
        plan |= plan_names(part.call.args)
    return Origin(found[0], found[1].context, orm, plan, text, relations)


def sqlalchemy_select_origin(parts, where):
    for index, part in enumerate(parts):
        rest = parts[index + 1 :]
        if part.name in SCALAR_EXECUTES and part.call and part.call.args:
            statement, tail = part.call.args[0], rest
        elif part.name == "execute" and part.call and part.call.args:
            if not rest or rest[0].name != "scalars" or rest[0].call is None:
                continue
            statement, tail = part.call.args[0], rest[1:]
        else:
            continue
        if not all(p.call is not None and p.name in SQLALCHEMY_RESULT for p in tail):
            return None
        selected = select_entity(statement, where)
        if selected is None:
            return None
        entity, place, options = selected
        return sqlalchemy_origin(entity, place, options, f"select({entity.id})")
    return None


def sqlalchemy_query_origin(parts, where):
    for index, part in enumerate(parts):
        if part.name != "query" or part.call is None or len(part.call.args) != 1:
            continue
        entity = part.call.args[0]
        rest = parts[index + 1 :]
        allowed = SQLALCHEMY_STATEMENT | SQLALCHEMY_RESULT
        if not isinstance(entity, ast.Name):
            return None
        if not all(p.call is not None and p.name in allowed for p in rest):
            return None
        options = [p for p in rest if p.name == "options"]
        return sqlalchemy_origin(
            entity, where, options, f"{parts[0].name}.query({entity.id})"
        )
    return None


def expanded(parts, place, depth=0):
    if len(parts) < 2 or parts[0].call is not None or depth > MAX_HOPS:
        return parts, place
    found = single_value(parts[0].name, place)
    inner = segments(strip(found[0])) if found is not None else None
    if not inner:
        return parts, place
    return expanded(inner + parts[1:], found[1], depth + 1)


def origin_of(node, context):
    where = where_of(node, context)
    expression, place = resolve_name(strip(node), where)
    expression = strip(expression) if expression is not None else None
    parts = segments(expression) if expression is not None else None
    if not parts:
        return None
    parts, place = expanded(parts, place)
    return (
        django_origin(parts, place)
        or sqlalchemy_select_origin(parts, place)
        or sqlalchemy_query_origin(parts, place)
    )
