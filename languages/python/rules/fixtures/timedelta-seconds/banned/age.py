from datetime import datetime


def is_stale(last_sent: datetime) -> bool:
    return (datetime.now() - last_sent).seconds > 3600
