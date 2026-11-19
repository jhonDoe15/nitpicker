import json
from json import JSONDecodeError


class ParseError(Exception):
    pass


def parse(text):
    try:
        return json.loads(text)
    except JSONDecodeError as error:
        raise ParseError(text) from error
