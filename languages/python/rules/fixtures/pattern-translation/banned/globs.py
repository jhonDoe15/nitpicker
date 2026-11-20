import re


def allowed(glob: str, path: str) -> bool:
    pattern = glob.replace("**", ".*").replace("*", "[^/]*")
    return re.fullmatch(pattern, path) is not None
