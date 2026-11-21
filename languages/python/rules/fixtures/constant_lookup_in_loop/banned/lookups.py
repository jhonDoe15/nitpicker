import importlib
from urllib.parse import urlparse, urlsplit
from zoneinfo import ZoneInfo

BASE_URL = "https://example.com/api"


def build_urls(paths: list[str]) -> list[str]:
    results: list[str] = []
    for path in paths:
        parsed = urlparse("https://example.com/api")
        results.append(f"{parsed.netloc}/{path}")
    return results


def split_urls(paths: list[str]) -> list[str]:
    return [f"{urlsplit(BASE_URL).netloc}/{path}" for path in paths]


def tag_zones(items: list[str]) -> list[tuple[str, ZoneInfo]]:
    tagged: list[tuple[str, ZoneInfo]] = []
    for item in items:
        tagged.append((item, ZoneInfo("UTC")))
    return tagged


def load_handlers(names: list[str]) -> list[object]:
    loaded: list[object] = []
    for name in names:
        module = importlib.import_module("app.handlers")
        loaded.append(getattr(module, name))
    return loaded
