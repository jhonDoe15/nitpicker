def name(value: str | int) -> str:
    if isinstance(value, str):
        return value
    raise TypeError("Expected a name")
