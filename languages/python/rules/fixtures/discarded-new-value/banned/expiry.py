from datetime import datetime, timezone


def expiry(offset):
    expires = datetime.now(timezone.utc)
    expires.replace(microsecond=0)
    return expires + offset
