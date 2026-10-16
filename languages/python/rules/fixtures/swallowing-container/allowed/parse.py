def parse(text: str, default: list[int]) -> list[int]:
    try:
        return [int(text)]
    except ValueError:
        return default
