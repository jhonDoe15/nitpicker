def parse(text: str) -> int:
    try:
        return int(text)
    except ValueError:
        return 0
