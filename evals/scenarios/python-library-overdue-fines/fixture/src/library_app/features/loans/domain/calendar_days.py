from datetime import date


def day_number(iso_date: str) -> int:
    return date.fromisoformat(iso_date).toordinal()
