import re


def allowed(glob: str, path: str) -> bool:
    pattern = re.escape(glob).replace("\\*\\*", ".*").replace("\\*", "[^/]*")
    return re.fullmatch(pattern, path) is not None
