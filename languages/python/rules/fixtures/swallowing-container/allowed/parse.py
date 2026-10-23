def parse(text: str) -> tuple[list[int], list[ValueError]]:
    try:
        return [int(text)], []
    except ValueError as error:
        return [], [error]
