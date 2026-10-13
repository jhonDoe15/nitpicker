def parse_all(values: list[str]) -> list[int]:
    parsed: list[int] = []
    for value in values:
        try:
            parsed.append(int(value))
        except ValueError:
            parsed.append(0)
    return parsed
