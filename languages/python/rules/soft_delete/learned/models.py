import ast

from checks.common import dotted_name
from django_models.graph import project_graph
from orm.models import class_assignments
from soft_delete.models import SoftModel, lineage, objects_state, project_classes

BOOLEAN_FIELDS = {"BooleanField", "NullBooleanField"}


def learnable_models(project):
    def build(_):
        classes = project_classes(project)
        models = project_graph(project).by_key
        found = {}
        for name, (cls, context) in classes.items():
            if (context.path, cls.name) not in models:
                continue
            chain = lineage(cls, context, classes)
            if objects_state(chain, classes, None) != "filters":
                found[name] = SoftModel(name, frozenset(), "django")
        return found

    return project.memo("learned-models", build)


def boolean_fields(project):
    def build(_):
        classes = project_classes(project)
        found = {}
        for name, (cls, context) in classes.items():
            found[name] = {
                field
                for member, member_context in lineage(cls, context, classes)
                for field, value in class_assignments(member)
                if is_boolean_field(value, member_context)
            }
        return found

    return project.memo("learned-boolean-fields", build)


def is_boolean_field(value, context):
    if not isinstance(value, ast.Call):
        return False
    dotted = dotted_name(value.func, context.aliases) or ""
    return dotted.startswith("django") and dotted.rsplit(".", 1)[-1] in BOOLEAN_FIELDS
