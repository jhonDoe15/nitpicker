import ast
import re
from collections import Counter

from checks.common import last_name
from soft_delete.learned.models import boolean_fields
from soft_delete.learned.reads import is_assigned, is_counted, project_reads
from soft_delete.majority import MINIMUM, THRESHOLD, Majority
from soft_delete.reads import FILTERED, UNFILTERED

ACTIVITY = re.compile(
    r"^(is_)?(user_)?(active|enabled|internal|deactivated|mirror_dummy)$"
)
OPERATORS = {"exact", "iexact", "in", "isnull"}
MENTIONED = "mentioned"


def lookup_of(name):
    parts = name.split("__")
    while len(parts) > 1 and parts[-1] in OPERATORS:
        parts.pop()
    return "__".join(parts)


def flag_uses(node):
    for call in (n for n in ast.walk(node) if isinstance(n, ast.Call)):
        negated = last_name(call.func) == "exclude"
        for keyword in call.keywords:
            value = keyword.value
            if keyword.arg and isinstance(value, ast.Constant):
                if isinstance(value.value, bool):
                    yield lookup_of(keyword.arg), value.value != negated


def mentions_lookup(node, lookup):
    return any(
        isinstance(n, ast.keyword) and n.arg and lookup_of(n.arg) == lookup
        for n in ast.walk(node)
    )


def stores_flag(function, lookup):
    attribute = lookup.rsplit("__", 1)[-1]
    for node in ast.walk(function):
        if isinstance(node, ast.Subscript) and isinstance(node.ctx, ast.Store):
            if getattr(node.slice, "value", None) == lookup:
                return True
        if isinstance(node, ast.Attribute) and isinstance(node.ctx, ast.Store):
            if node.attr == attribute:
                return True
        if isinstance(node, ast.Dict) and any(
            getattr(key, "value", None) == lookup for key in node.keys
        ):
            return True
    return False


def forwards_keywords(chain):
    return any(
        isinstance(n, ast.keyword) and n.arg is None for n in ast.walk(chain)
    )


def is_flag_name(lookup, model, project):
    if ACTIVITY.match(lookup.rsplit("__", 1)[-1]):
        return True
    return lookup in boolean_fields(project).get(model, set())


def candidate_flags(reads, model, project):
    counts = Counter()
    for read, _ in reads:
        for use in set(flag_uses(read.chain)):
            if is_flag_name(use[0], model, project):
                counts[use] += 1
    return counts


def status_for(read, context, flag):
    lookup = flag[0]
    if flag in set(flag_uses(read.chain)):
        return FILTERED
    if mentions_lookup(read.chain, lookup) or forwards_keywords(read.chain):
        return MENTIONED
    if stores_flag(read.function, lookup):
        return MENTIONED
    if not is_counted(read):
        return None
    if is_assigned(read, context) and mentions_lookup(read.function, lookup):
        return MENTIONED
    return UNFILTERED


def flag_majority(reads, flag):
    statuses = [(read, status_for(read, context, flag)) for read, context in reads]
    counted = [(read, status) for read, status in statuses if status]
    filtered = sum(1 for _, status in counted if status == FILTERED)
    unfiltered = [read for read, status in counted if status == UNFILTERED]
    total = len(counted)
    if total < MINIMUM or filtered / total < THRESHOLD or not unfiltered:
        return None
    lookup, value = flag
    return Majority(filtered, total, f"{lookup}={value}"), unfiltered


def flag_findings(project):
    def build(_):
        found = {}
        for model, reads in project_reads(project).items():
            counts = candidate_flags(reads, model, project)
            for flag, _ in sorted(counts.items(), key=lambda i: (-i[1], i[0])):
                result = flag_majority(reads, flag)
                for read in result[1] if result else []:
                    found.setdefault(id(read.chain), (read, flag[0], result[0]))
        return found

    return project.memo("learned-flag-findings", build)
