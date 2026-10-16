def parse(text: str) -> list[int]:
    try:
        return [int(text)]
    except ValueError:
        return []
