try:
    import tomllib
except ImportError:
    tomllib = None


def parse(text: str, default: int) -> int:
    value = default
    try:
        value = int(text)
    except ValueError:
        value = default
    return value
