import re


def route(name: str) -> re.Pattern[str]:
    return re.compile(rf"^/{re.escape(name)}/\d+$")
