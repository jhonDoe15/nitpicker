from datetime import date, datetime


def stamps(text: str, seconds: float) -> list[object]:
    return [
        datetime(2024, 1, 1),
        datetime.today(),
        datetime.utcnow(),
        datetime.utcfromtimestamp(seconds),
        datetime.now(),
        datetime.fromtimestamp(seconds),
        datetime.strptime(text, "%Y-%m-%d"),
        date.today(),
        date.fromtimestamp(seconds),
        datetime.min,
    ]
