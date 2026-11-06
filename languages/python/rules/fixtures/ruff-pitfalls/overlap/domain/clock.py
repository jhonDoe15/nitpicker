from datetime import date, datetime


def stamps():
    return [
        datetime.now(),
        datetime.utcnow(),
        datetime.today(),
        date.today(),
    ]
