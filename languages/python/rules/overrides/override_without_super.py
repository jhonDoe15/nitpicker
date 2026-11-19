from checks.common import finding
from overrides.decisions import decide

RULE = "override-without-super"


def check(context):
    chosen = context.project.memo("override-without-super", decide)
    return [
        finding(context.path, RULE, f"{item.cls.name}.{name}|{label}", item.method)
        for item, name, label in chosen.values()
        if item.context is context
    ]
