import ast

from checks.common import finding, last_name
from persistence.memory.fields import field_reads, key_fields
from persistence.memory.models import model_columns
from persistence.memory.results import MAPPING, listed, query_result

RULE = "in-memory-query"
GUARDED = True
COUNT, FILTER, SORT, AGGREGATE = "count", "filter", "sort", "aggregate"
COUNT_CALLS = {"len", "bool"}
KEY_CALLS = {"sorted", "max", "min"}
AGGREGATE_CALLS = {"sum", "max", "min", "Counter"}
MATCH_CALLS = {"any", "all"}
FIRST_CALL = "next"
FILTER_CALL = "filter"
SORT_METHOD = "sort"
KEY = "key"
TESTS = (ast.If, ast.While, ast.IfExp, ast.Assert)
LOOPS = (ast.For, ast.AsyncFor, ast.While, ast.comprehension)
SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.GeneratorExp)


def called(node):
    return last_name(node.func) if isinstance(node, ast.Call) else None


def keyword(call, name):
    return next((item.value for item in call.keywords if item.arg == name), None)


def in_test(node, parent, context):
    while isinstance(parent, ast.BoolOp):
        node, parent = parent, context.parents.get(id(parent))
    return isinstance(parent, TESTS) and parent.test is node


def count_shape(node, parent, context):
    sole = isinstance(parent, ast.Call) and parent.args == [node] and not parent.keywords
    if sole and called(parent) in COUNT_CALLS:
        return parent, COUNT, None
    if isinstance(parent, ast.UnaryOp) and isinstance(parent.op, ast.Not):
        return parent, COUNT, None
    return (node, COUNT, None) if in_test(node, parent, context) else None


def key_shape(node, parent, context):
    if isinstance(parent, ast.Attribute) and parent.attr == SORT_METHOD:
        call = context.parents.get(id(parent))
        key = keyword(call, KEY) if isinstance(call, ast.Call) else None
        return (call, SORT, key_fields(key)) if key is not None else None
    if not isinstance(parent, ast.Call):
        return None
    name = called(parent)
    if name in KEY_CALLS and parent.args == [node] and keyword(parent, KEY) is not None:
        return parent, SORT, key_fields(keyword(parent, KEY))
    if name == FILTER_CALL and len(parent.args) == 2 and parent.args[1] is node:
        return parent, FILTER, key_fields(parent.args[0])
    return None


def consumer_shape(comprehension, generator, outer):
    element = {generator.target.id}
    conditions = generator.ifs
    name = called(outer) if outer is not None and outer.args[:1] == [comprehension] else None
    if name in AGGREGATE_CALLS:
        return outer, AGGREGATE, field_reads([comprehension.elt, *conditions], element)
    if name in MATCH_CALLS:
        return outer, FILTER, field_reads([comprehension.elt, *conditions], element)
    if conditions:
        site = outer if name == FIRST_CALL else comprehension
        return site, FILTER, field_reads(conditions, element)
    return None


def comprehension_shape(node, parent, context):
    if not isinstance(parent, ast.comprehension) or parent.iter is not node:
        return None
    comprehension = context.parents.get(id(parent))
    single = isinstance(comprehension, COMPREHENSIONS) and len(comprehension.generators) == 1
    if not single or not isinstance(parent.target, ast.Name):
        return None
    outer = context.parents.get(id(comprehension))
    return consumer_shape(comprehension, parent, outer if isinstance(outer, ast.Call) else None)


def shape_of(node, context, kind):
    parent = context.parents.get(id(node))
    shapes = [count_shape] if kind == MAPPING else [count_shape, key_shape, comprehension_shape]
    for shape in shapes:
        found = shape(node, parent, context)
        if found is not None:
            return found
    return None


def enclosing(node, context, kinds):
    current = context.parents.get(id(node))
    while current is not None and not isinstance(current, kinds):
        current = context.parents.get(id(current))
    return current


def crosses(read, function, context):
    child, current = read, context.parents.get(id(read))
    while current is not None and current is not function:
        first_iter = isinstance(current, ast.comprehension) and current.iter is child
        if isinstance(current, LOOPS + SCOPES) and not first_iter:
            return True
        child, current = current, context.parents.get(id(current))
    return False


def single_read(assignment, context):
    targets = assignment.targets
    if len(targets) != 1 or not isinstance(targets[0], ast.Name):
        return None
    function = enclosing(assignment, context, FUNCTIONS)
    if function is None or enclosing(assignment, context, LOOPS + SCOPES) is not function:
        return None
    name = targets[0].id
    uses = [node for node in ast.walk(function) if isinstance(node, ast.Name) and node.id == name]
    reads = [node for node in uses if isinstance(node.ctx, ast.Load)]
    if len(uses) != 2 or len(reads) != 1 or crosses(reads[0], function, context):
        return None
    return reads[0]


def result_site(node, context):
    parent = context.parents.get(id(node))
    if isinstance(parent, ast.Assign) and parent.value is node:
        return single_read(parent, context)
    return node


def is_known(context, model, fields):
    columns = model_columns(context, model)
    return bool(fields) and fields <= columns


def query_findings(node, context):
    result = listed(node, context) or query_result(node, context)
    site = result_site(node, context) if result is not None else None
    found = shape_of(site, context, result.kind) if site is not None else None
    if found is None:
        return []
    report, shape, fields = found
    if shape != COUNT and not is_known(context, result.model, fields):
        return []
    return [finding(context.path, RULE, f"{result.model} {shape}", report)]


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, ast.Call):
            found.extend(query_findings(node, context))
    return found
