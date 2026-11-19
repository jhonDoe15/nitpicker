from checks.common import finding, string_value
from permissions.sites import permission_sites

RULE = "permission-name-without-app-label"
OBJECT_BACKENDS = ("guardian",)


def uses(project, roots):
    def build(_):
        return any(
            value.startswith(roots)
            for context in project.contexts.values()
            for table in context.aliases[:2]
            for value in table.values()
        )

    return project.memo(("imports", roots), build)


def check(context):
    if context.tests or not uses(context.project, ("django",)):
        return []
    object_backend = uses(context.project, OBJECT_BACKENDS)
    return [
        finding(context.path, RULE, f"{owner}()|{string_value(literal)}", literal)
        for owner, literal, scoped in permission_sites(context)
        if not (scoped and object_backend)
    ]
