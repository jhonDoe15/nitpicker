import ast

from checks.common import last_name, parameter_names, words_of
from kinds.index import functions_of
from kinds.names import chain_names
from soft_delete.learned.reads import is_assigned, is_counted, project_reads
from soft_delete.majority import MINIMUM, THRESHOLD, Majority
from soft_delete.models import base_names, project_classes

USER_NAMES = {"user", "request", "request_user", "current_user", "actor"}
PLACES = {
    "view",
    "views",
    "form",
    "forms",
    "serializer",
    "serializers",
    "templatetag",
    "templatetags",
    "api",
    "viewset",
    "viewsets",
}
CONTAINERS = ("QuerySet", "Manager")


def is_container(cls):
    return any(name.endswith(CONTAINERS) for name in base_names(cls))


def scoping_methods(project):
    def build(_):
        found = set()
        for cls, _ in project_classes(project).values():
            if not is_container(cls):
                continue
            for member in cls.body:
                if isinstance(member, ast.FunctionDef):
                    if parameter_names(member) & USER_NAMES:
                        found.add(member.name)
        return found

    return project.memo("scoping-methods", build)


def in_place(path):
    parts = {w for part in path.removesuffix(".py").split("/") for w in words_of(part)}
    return bool(parts & PLACES)


def has_user(function):
    names = parameter_names(function)
    return bool(names & USER_NAMES) or any(
        isinstance(n, ast.Attribute) and n.attr in USER_NAMES
        for n in ast.walk(function)
    )


def calls_method(read, method, context):
    if method in chain_names(read.chain) or any(
        isinstance(n, ast.Attribute) and n.attr == method for n in ast.walk(read.chain)
    ):
        return True
    if not is_assigned(read, context):
        return False
    name = context.parents[id(read.chain)].targets[0].id
    return any(
        isinstance(n, ast.Attribute)
        and n.attr == method
        and getattr(n.value, "id", None) == name
        for n in ast.walk(read.function)
    )


def method_majority(reads, method):
    placed = [(r, c) for r, c in reads if in_place(c.path)]
    called = [r for r, c in placed if calls_method(r, method, c)]
    missing = [
        r
        for r, c in placed
        if is_counted(r) and not calls_method(r, method, c) and has_user(r.function)
    ]
    total = len([1 for r, c in placed if is_counted(r) or calls_method(r, method, c)])
    if total < MINIMUM or len(called) / total < THRESHOLD or not missing:
        return None
    return Majority(len(called), total, f"{method}()"), missing


def scoping_findings(project):
    def build(_):
        found = {}
        for model, reads in project_reads(project).items():
            for method in sorted(scoping_methods(project)):
                result = method_majority(reads, method)
                for read in result[1] if result else []:
                    found.setdefault(id(read.chain), (read, f"{method}()", result[0]))
        return found

    return project.memo("learned-scoping-findings", build)
