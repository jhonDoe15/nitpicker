def parse(text: str) -> int:
    value = 0
    try:
        value = int(text)
    except ValueError:
        value = -1
    return value
