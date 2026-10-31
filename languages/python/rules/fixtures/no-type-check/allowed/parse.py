def parse(value: str, *, strict: bool) -> str:
    return value if strict else value.strip()
