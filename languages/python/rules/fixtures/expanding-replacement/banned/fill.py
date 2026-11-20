import re


def fill(text: str, name: str) -> str:
    return re.sub(r"\{name\}", name, text)
