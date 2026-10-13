def parse(text: str) -> int | None:
    try:
        return int(text)
    except Exception:
        return None
