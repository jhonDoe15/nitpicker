class ParseError(ValueError):
    pass


def parse(text: str) -> int:
    try:
        return int(text)
    except ValueError as error:
        raise ParseError(text) from error
