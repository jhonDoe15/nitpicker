import ast
from collections import namedtuple

from kinds.index import functions_of
from soft_delete.fields import is_intentional
from soft_delete.learned.models import learnable_models
from soft_delete.reads import (
    EXEMPT,
    is_shortcut,
    model_roots,
    outer_chain,
    status_of,
)

LearnedRead = namedtuple("LearnedRead", "model chain function qualified status")


def raw_reads(context):
    def build(_):
        models = learnable_models(context.project)
        found = []
        for qualified, function in functions_of(context):
            if is_intentional(qualified, context.path):
                continue
            for root, model in model_roots(function, models):
                chain = (
                    root if is_shortcut(root) else outer_chain(root, context.parents)
                )
                status, _ = status_of(
                    chain, root, model, function, context, frozenset()
                )
                found.append(
                    LearnedRead(model.name, chain, function, qualified, status)
                )
        return found

    return context.project.memo(("learned-reads", context.path), build)


def project_reads(project):
    def build(_):
        tally = {}
        for context in project.contexts.values():
            if context.tests:
                continue
            for read in raw_reads(context):
                tally.setdefault(read.model, []).append((read, context))
        return tally

    return project.memo("learned-project-reads", build)


def is_assigned(read, context):
    parent = context.parents.get(id(read.chain))
    return isinstance(parent, ast.Assign) and isinstance(parent.targets[0], ast.Name)


def is_counted(read):
    return read.status != EXEMPT
