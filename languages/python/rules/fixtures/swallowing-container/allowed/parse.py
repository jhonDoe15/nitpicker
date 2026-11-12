def parse(texts: list[str]) -> tuple[list[int], list[ValueError]]:
    values: list[int] = []
    errors: list[ValueError] = []
    for text in texts:
        try:
            values.append(int(text))
        except ValueError as error:
            errors.append(error)
    return values, errors
