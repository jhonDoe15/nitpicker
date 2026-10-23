def decode(value: int | str) -> int:
    if isinstance(value, int):
        return value
    return int(value)
