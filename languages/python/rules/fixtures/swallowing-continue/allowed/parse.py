def parse_all(texts: list[str]) -> tuple[list[int], list[str]]:
    numbers = []
    rejected = []
    for text in texts:
        try:
            numbers.append(int(text))
        except ValueError:
            rejected.append(text)
    return numbers, rejected
