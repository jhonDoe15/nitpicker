from datetime import datetime, timezone


def expiry(offset):
    expires = datetime.now(timezone.utc)
    expires = expires.replace(microsecond=0)
    return expires + offset
