import json


class ParseError(Exception):
    pass


def parse(text):
    try:
        return json.loads(text)
    except ValueError as error:
        raise ParseError(text) from error
