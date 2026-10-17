try:
    import tomllib
except ImportError:
    tomllib = None


def parse(text: str, default: int) -> int:
    return int(text) if text.lstrip("-").isdigit() else default
