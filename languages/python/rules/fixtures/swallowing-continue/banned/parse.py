def parse_all(texts: list[str]) -> list[int]:
    numbers = []
    for text in texts:
        try:
            numbers.append(int(text))
        except ValueError:
            continue
    return numbers
