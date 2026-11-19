import ast

from checks.common import dotted_name
from django_models.graph import project_graph

USER_BASES = {"AbstractUser", "AbstractBaseUser"}
KNOWN_ATTRIBUTES = {
    "email",
    "first_name",
    "last_name",
    "date_joined",
    "last_login",
    "password",
    "get_full_name",
    "get_short_name",
    "email_user",
}
ANONYMOUS_ATTRIBUTES = {"id", "pk", "username", "is_staff", "is_active", "groups"}
MARKERS = ("login", "permission", "authenticated", "user_passes_test", "staff_member")
CLASS_MARKERS = {"permission_classes", "login_required", "permission_required"}
FRAMEWORKS = ("django", "rest_framework")


def is_user_model(model):
    names = {
        (dotted_name(base, ({}, {})) or "").rsplit(".", 1)[-1]
        for base in model.node.bases
    }
    return model.name == "User" or bool(names & USER_BASES)


def user_attributes(project):
    def build(_):
        graph = project_graph(project)
        found = set(KNOWN_ATTRIBUTES)
        for model in graph.by_key.values():
            if is_user_model(model):
                found |= set(model.fields) | model.properties
                found |= {r.query_name for r in graph.reverse.get(model.key, [])}
                found |= {r.name for r in graph.reverse.get(model.key, [])}
        return found - ANONYMOUS_ATTRIBUTES

    return project.memo("django-user-attributes", build)


def uses_django(context):
    return any(
        value.startswith(FRAMEWORKS)
        for table in context.aliases[:2]
        for value in table.values()
    )


def marked(node):
    texts = [ast.unparse(item).lower() for item in getattr(node, "decorator_list", [])]
    texts += [ast.unparse(base).lower() for base in getattr(node, "bases", [])]
    return any(marker in text for text in texts for marker in MARKERS)


def class_marked(cls):
    names = {
        target.id
        for statement in cls.body
        if isinstance(statement, (ast.Assign, ast.AnnAssign))
        for target in (
            statement.targets
            if isinstance(statement, ast.Assign)
            else [statement.target]
        )
        if isinstance(target, ast.Name)
    }
    return bool(names & CLASS_MARKERS)


def authenticated_scope(function, context):
    node = function
    while node is not None:
        if marked(node) or (isinstance(node, ast.ClassDef) and class_marked(node)):
            return True
        node = context.parents.get(id(node))
    return False
