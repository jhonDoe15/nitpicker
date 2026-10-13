def parse_one(value: str) -> int:
    try:
        return int(value)
    except ValueError:
        return 0


def parse_all(values: list[str]) -> list[int]:
    return [parse_one(value) for value in values]
