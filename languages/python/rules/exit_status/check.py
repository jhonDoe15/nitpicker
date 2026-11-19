from exit_status.commands import command_findings
from exit_status.zero_exits import exit_findings

RULE = "exit-status-zero-on-failure"


def check(context):
    if context.tests:
        return []
    return exit_findings(context, RULE) + command_findings(context, RULE)
