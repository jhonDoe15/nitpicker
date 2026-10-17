try:
    import tomllib
except ImportError:
    tomllib = None

try:
    from yaml import CSafeLoader as Loader
except ImportError:
    from yaml import SafeLoader as Loader


def parse(text: str, default: int) -> int:
    return int(text) if text.lstrip("-").isdigit() else default
