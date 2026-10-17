from defusedxml import ElementTree


def read(text: str) -> object:
    return ElementTree.fromstring(text)
