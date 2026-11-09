from checks.common import finding
from persistence.foreign_keys.alchemy import alchemy_models
from persistence.foreign_keys.database import has_alembic, mysql_only
from persistence.foreign_keys.django_keys import django_models
from persistence.foreign_keys.keys import unindexed

RULE = "unindexed-foreign-key"
GUARDED = True


def findings(context, models):
    return [
        finding(context.path, RULE, f"{model.name}.{label}", node)
        for model in models
        for node, label, _ in unindexed(model)
    ]


def check(context):
    project = context.project
    if context.tests or project.memo("foreign-keys-mysql-only", mysql_only):
        return []
    found = findings(context, django_models(context))
    if not project.memo("foreign-keys-alembic", has_alembic):
        found += findings(context, alchemy_models(context))
    return found
