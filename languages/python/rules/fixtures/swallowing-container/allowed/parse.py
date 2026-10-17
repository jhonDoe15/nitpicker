def parse(text: str, errors: list[ValueError]) -> list[int]:
    try:
        return [int(text)]
    except ValueError as error:
        errors.append(error)
        return []
