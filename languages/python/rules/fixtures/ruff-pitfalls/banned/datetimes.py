from datetime import date, datetime


def stamps(value, text):
    return [
        datetime(2026, 1, 1),
        datetime.today(),
        datetime.utcnow(),
        datetime.utcfromtimestamp(value),
        datetime.now(),
        datetime.fromtimestamp(value),
        datetime.strptime(text, "%Y-%m-%d"),
        date.today(),
        date.fromtimestamp(value),
        datetime.max,
    ]
