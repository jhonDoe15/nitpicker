from checks.common import finding
from locking.lock_sites import CONSTRUCTION, UNKNOWN, class_sites

RULE = "inconsistent-attribute-locking"


def locked_write(write, sites):
    for other in sites.writes:
        if other.name != write.name or other.method in CONSTRUCTION:
            continue
        lock = next((key for key in reversed(other.held) if key != UNKNOWN), None)
        if lock is not None:
            return other, lock
    return None


def unlocked_writes(context, sites):
    for write in sites.writes:
        if (
            write.held
            or write.method in CONSTRUCTION
            or write.method in sites.locked_calls
            or write.method in sites.opaque
        ):
            continue
        found = locked_write(write, sites)
        if found is None:
            continue
        other, lock = found
        subject = f"{sites.klass.name}.{write.method}: self.{write.name}"
        item = finding(context.path, RULE, subject, write.node)
        item["via"] = (
            f"`{write.method}` writes `self.{write.name}` without a lock, "
            f"while `{other.method}` writes it holding `{lock}`"
        )
        yield item


def check(context):
    return [
        item
        for sites in class_sites(context)
        for item in unlocked_writes(context, sites)
    ]
