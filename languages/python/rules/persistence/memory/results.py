import ast

from persistence.relationships import imports_orm

QUERYSET_METHODS = {
    "all",
    "filter",
    "exclude",
    "order_by",
    "select_related",
    "prefetch_related",
    "only",
    "defer",
    "distinct",
    "using",
}
MAPPING_METHODS = {"in_bulk"}
MANAGER = "objects"
STATEMENT_METHODS = {
    "filter",
    "filter_by",
    "where",
    "join",
    "outerjoin",
    "options",
    "order_by",
    "distinct",
    "execution_options",
}
RESULT_METHODS = {"scalars", "unique"}
EXECUTORS = {"scalars", "execute"}
SELECT = "select"
QUERY = "query"
SESSION_WORD = "session"
DB_NAME = "db"
LIST_CALLS = {"list"}
ROWS, MAPPING = "rows", "mapping"


class QueryResult:
    def __init__(self, model, kind):
        self.model = model
        self.kind = kind


def unawaited(node):
    return node.value if isinstance(node, ast.Await) else node


def method_call(node, names):
    node = unawaited(node)
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in names
    ):
        return node
    return None


def model_name(node):
    if isinstance(node, ast.Name) and node.id[:1].isupper():
        return node.id
    return None


def django_result(node):
    call = method_call(node, QUERYSET_METHODS | MAPPING_METHODS)
    if call is None:
        return None
    kind = MAPPING if call.func.attr in MAPPING_METHODS else ROWS
    current = call
    while current is not None:
        owner = unawaited(current.func.value)
        current = method_call(owner, QUERYSET_METHODS)
    if not (isinstance(owner, ast.Attribute) and owner.attr == MANAGER):
        return None
    model = model_name(owner.value)
    return QueryResult(model, kind) if model else None


def root_name(node):
    while isinstance(node, (ast.Attribute, ast.Call, ast.Await)):
        node = node.func if isinstance(node, ast.Call) else node.value
    return node.id if isinstance(node, ast.Name) else None


def without_statement_methods(node):
    current = method_call(node, STATEMENT_METHODS)
    while current is not None:
        node = current.func.value
        current = method_call(node, STATEMENT_METHODS)
    return unawaited(node)


def selected_model(node):
    node = without_statement_methods(node)
    is_select = isinstance(node, ast.Call) and getattr(node.func, "id", None) == SELECT
    if not is_select or len(node.args) != 1:
        return None
    selected = node.args[0]
    while isinstance(selected, ast.Attribute):
        selected = selected.value
    return model_name(selected)


def statement_model(node):
    node = without_statement_methods(node)
    query = method_call(node, {QUERY})
    if query is not None and len(query.args) == 1:
        return model_name(query.args[0]), query.func.value
    if isinstance(node, ast.Attribute) and node.attr == QUERY:
        return model_name(node.value), None
    return None, None


def executed_model(node):
    node = unawaited(node)
    step = method_call(node, RESULT_METHODS)
    while step is not None and not step.args:
        node = unawaited(step.func.value)
        step = method_call(node, RESULT_METHODS)
    executor = method_call(node, EXECUTORS)
    if executor is None or len(executor.args) != 1:
        return None, None
    return selected_model(executor.args[0]), executor.func.value


def is_session_like(receiver, context):
    if receiver is None:
        return True
    text = ast.unparse(receiver).lower()
    return imports_orm(context) or SESSION_WORD in text or root_name(receiver) == DB_NAME


def sqlalchemy_result(node, context):
    call = method_call(node, {"all"})
    if call is None or call.args:
        return None
    model, receiver = statement_model(call.func.value)
    if model is None:
        model, receiver = executed_model(call.func.value)
    if model is None or not is_session_like(receiver, context):
        return None
    return QueryResult(model, ROWS)


def query_result(node, context):
    return django_result(node) or sqlalchemy_result(node, context)


def listed(node, context):
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id in LIST_CALLS
        and len(node.args) == 1
        and not node.keywords
    ):
        return query_result(node.args[0], context)
    return None
