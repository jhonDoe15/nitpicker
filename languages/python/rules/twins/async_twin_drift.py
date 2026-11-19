from twins.pairs import scopes_of, twins_in
from twins.shapes import normalized, shape_of
from checks.common import finding

RULE = "async-twin-drift"
KINDS = ("parameter", "exception", "guard", "call")


def qualified(owner, function):
    return f"{owner}.{function.name}" if owner else function.name


def differences(asynchronous, synchronous, known, aliases):
    plain = shape_of(synchronous, aliases)
    known = known | plain["call"]
    other = shape_of(normalized(asynchronous, known), aliases)
    if not (plain["call"] & other["call"]):
        return []
    found = []
    for kind in KINDS:
        found += [(kind, item, "sync") for item in sorted(plain[kind] - other[kind])]
        found += [(kind, item, "async") for item in sorted(other[kind] - plain[kind])]
    return found


def check(context):
    if context.tests:
        return []
    found = []
    for body, owner in scopes_of(context.tree):
        for asynchronous, synchronous, known in twins_in(body):
            names = (qualified(owner, asynchronous), qualified(owner, synchronous))
            for kind, detail, side in differences(
                asynchronous, synchronous, known, context.aliases
            ):
                subject = "|".join([*names, kind, detail, side])
                found.append(finding(context.path, RULE, subject, asynchronous))
    return found
