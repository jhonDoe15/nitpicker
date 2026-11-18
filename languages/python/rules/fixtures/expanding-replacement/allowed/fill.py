import re


def fill(text: str, name: str) -> str:
    return re.sub(r"\{name\}", lambda _: name, text)
