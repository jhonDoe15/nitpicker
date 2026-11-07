import re


def route(name: str) -> re.Pattern[str]:
    return re.compile(rf"^/{name}/\d+$")
