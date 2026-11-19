import ast

from checks.common import dotted_name
from orm.models import class_assignments
from security.resolve.scopes import MAX_HOPS, definition, module_where

DJANGO_MODEL = "django.db.models.Model"
LOOKUPS = set(
    "exact iexact contains icontains in gt gte lt lte startswith istartswith endswith iendswith "
    "range isnull regex iregex date year month day week week_day iso_week_day iso_year quarter "
    "time hour minute second search unaccent contained_by has_key has_keys has_any_keys overlap "
    "len trigram_similar trigram_word_similar isempty".split()
)
KEYED_TYPES = {"JSONField", "HStoreField", "ArrayField", "SearchVectorField"}
ANNOTATING = {"annotate", "alias", "values"}


def annotated_names(project):
    def build(_):
        names = set()
        for context in project.contexts.values():
            for node in ast.walk(context.tree):
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                    names |= call_names(node)
        return names

    return project.memo("django-annotated-names", build)


def call_names(node):
    names = set()
    if node.func.attr in ANNOTATING:
        names |= {item.arg for item in node.keywords if item.arg}
    if node.func.attr == "extra":
        for item in node.keywords:
            if item.arg == "select" and isinstance(item.value, ast.Dict):
                names |= {
                    key.value
                    for key in item.value.keys
                    if isinstance(key, ast.Constant) and isinstance(key.value, str)
                }
    return names


def parent_models(model, graph, hops=0):
    found = [model]
    if hops <= MAX_HOPS:
        for key in model.bases:
            parent = graph.by_key.get(key)
            if parent is not None:
                found.extend(parent_models(parent, graph, hops + 1))
    return found


def is_closed(model, graph, hops=0):
    if hops > MAX_HOPS:
        return False
    for base in model.node.bases:
        if dotted_name(base, model.context.aliases) == DJANGO_MODEL:
            continue
        found = definition(base, module_where(model.context))
        if found is None:
            return False
        parent = graph.by_key.get((found[1].context.path, found[0].name))
        if parent is not None and not is_closed(parent, graph, hops + 1):
            return False
    return True


def opaque_names(model, graph):
    names = set()
    for parent in parent_models(model, graph):
        names |= {name for name, _ in class_assignments(parent.node)}
    return names - set(model.fields)
