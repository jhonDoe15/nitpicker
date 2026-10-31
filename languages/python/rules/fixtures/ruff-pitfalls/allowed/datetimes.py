from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

PARIS = ZoneInfo("Europe/Paris")


def stamps(value, text):
    return [
        datetime(2026, 1, 1, tzinfo=timezone.utc),
        datetime.now(tz=timezone.utc),
        datetime.fromtimestamp(value, tz=timezone.utc),
        datetime.strptime(text, "%Y-%m-%d %z"),
        datetime.strptime(text, "%Y-%m-%d").replace(tzinfo=PARIS),
        date.fromisoformat(text),
        time.fromisoformat(text),
        datetime.now(tz=PARIS).date(),
        datetime.fromtimestamp(value, tz=timezone.utc).date(),
        datetime.max.replace(tzinfo=timezone.utc),
        datetime.min.replace(tzinfo=timezone.utc),
    ]
