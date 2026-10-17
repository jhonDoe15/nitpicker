def parse_all(texts: list[str]) -> tuple[list[int], list[tuple[str, ValueError]]]:
    numbers = []
    rejected = []
    for text in texts:
        try:
            numbers.append(int(text))
        except ValueError as error:
            rejected.append((text, error))
    return numbers, rejected
