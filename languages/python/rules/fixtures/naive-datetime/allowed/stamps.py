from datetime import datetime, timezone


def stamps(text: str, seconds: float) -> list[object]:
    return [
        datetime(2024, 1, 1, tzinfo=timezone.utc),
        datetime.now(tz=timezone.utc),
        datetime.fromtimestamp(seconds, tz=timezone.utc),
        datetime.strptime(text, "%Y-%m-%d %z"),
        datetime.now(tz=timezone.utc).date(),
        datetime.min.replace(tzinfo=timezone.utc),
    ]
