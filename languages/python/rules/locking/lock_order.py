from checks.common import finding
from locking.lock_sites import UNKNOWN, class_sites

RULE = "lock-order-inversion"


def reversed_by(acquisition, outer, sites):
    return next(
        (
            other
            for other in sites.acquisitions
            if other.key == outer
            and acquisition.key in other.held
            and other.key not in other.held
        ),
        None,
    )


def evidence(acquisition, outer, other):
    there = (
        f"another nesting in `{other.method}`"
        if other.method == acquisition.method
        else f"`{other.method}`"
    )
    return (
        f"`{acquisition.method}` takes `{acquisition.key}` while it holds `{outer}`, "
        f"and {there} takes `{outer}` while it holds `{acquisition.key}`"
    )


def inversions(context, sites):
    for acquisition in sites.acquisitions:
        if acquisition.key in acquisition.held:
            continue
        for outer in dict.fromkeys(reversed(acquisition.held)):
            if outer in (UNKNOWN, acquisition.key):
                continue
            other = reversed_by(acquisition, outer, sites)
            if other is None:
                continue
            subject = (
                f"{sites.klass.name}.{acquisition.method}: {outer} -> {acquisition.key}"
            )
            item = finding(context.path, RULE, subject, acquisition.node)
            item["via"] = evidence(acquisition, outer, other)
            yield item
            break


def check(context):
    return [
        item for sites in class_sites(context) for item in inversions(context, sites)
    ]
