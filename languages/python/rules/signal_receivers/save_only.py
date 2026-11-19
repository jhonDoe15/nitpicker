import ast

from checks.common import finding
from signal_receivers.deletions import rows_deleted
from signal_receivers.invalidation import direct_signatures, reached_signatures
from soft_delete.models import project_classes
from signal_receivers.receivers import DELETE_SIGNALS, SAVE_SIGNALS, project_receivers

RULE = "cache-invalidated-on-save-only"
GUARDED = True


def override_coverage(project):
    for name, (cls, context) in project_classes(project).items():
        for member in cls.body:
            if isinstance(member, ast.FunctionDef) and member.name == "delete":
                yield name, reached_signatures(member, context)


def delete_coverage(project):
    def build(_):
        found = []
        for receiver in project_receivers(project):
            if receiver.signals & DELETE_SIGNALS:
                signatures = reached_signatures(receiver.function, receiver.context)
                sender = None if "m2m_changed" in receiver.signals else receiver.sender
                found.append((sender, signatures))
        found.extend(override_coverage(project))
        return found

    return project.memo("delete-coverage", build)


def is_covered(sender, signatures, project):
    return any(
        covered_sender in (sender, None) and covered & signatures
        for covered_sender, covered in delete_coverage(project)
    )


def check(context):
    if context.tests:
        return []
    project = context.project
    if not rows_deleted(project):
        return []
    found = []
    for receiver in project_receivers(project):
        if receiver.context is not context or not receiver.sender:
            continue
        if not receiver.signals & SAVE_SIGNALS:
            continue
        signatures = direct_signatures(receiver.function, context)
        if signatures and not is_covered(receiver.sender, signatures, project):
            signal = sorted(receiver.signals & SAVE_SIGNALS)[0]
            subject = (
                f"{receiver.function.name}|{receiver.sender}|{signal}"
                f"|{sorted(signatures)[0]}"
            )
            found.append(finding(context.path, RULE, subject, receiver.function))
    return found
