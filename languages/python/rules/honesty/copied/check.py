import ast

from checks.common import finding
from honesty.copied.constants import is_trivial, literal_key, production_constants
from honesty.copied.positions import enclosing, excluded_ids, named_in
from honesty.copied.seen import seen_modules

RULE = "copied-constant-in-test"


def constants_by_value(context, constants):
    found = {}
    for path in seen_modules(context, constants):
        module, entries = constants[path]
        for name, key in entries:
            found.setdefault(key, set()).add((name, module))
    return found


def check(context):
    if not context.tests:
        return []
    constants = context.project.memo("production-constants", production_constants)
    known = constants_by_value(context, constants)
    if not known:
        return []
    skipped = excluded_ids(context.tree, context.aliases)
    covered = set()
    findings = []
    for node in ast.walk(context.tree):
        if id(node) in skipped or id(node) in covered:
            continue
        key = literal_key(node)
        if key is None or is_trivial(key) or key not in known:
            continue
        covered.update(id(child) for child in ast.walk(node))
        named = named_in(enclosing(node, context.parents))
        copies = sorted(
            entry for entry in known[key] if entry[0].rsplit(".", 1)[-1] not in named
        )
        if copies:
            subject = " or ".join(f"{name} from {module}" for name, module in copies)
            findings.append(finding(context.path, RULE, subject, node))
    return findings
