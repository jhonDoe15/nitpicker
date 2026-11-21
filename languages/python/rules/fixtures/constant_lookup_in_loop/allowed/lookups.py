import importlib
from urllib.parse import urlparse, urlsplit
from zoneinfo import ZoneInfo

BASE = urlparse("https://example.com/api")
UTC = ZoneInfo("UTC")


def build_urls(paths: list[str]) -> list[str]:
    return [f"{BASE.netloc}/{path}" for path in paths]


def parse_dynamic(addresses: list[str]) -> list[str]:
    return [urlsplit(address).netloc for address in addresses]


def tag_zones(items: list[str]) -> list[tuple[str, ZoneInfo]]:
    return [(item, UTC) for item in items]


def load_dynamic(module_names: list[str]) -> list[object]:
    return [importlib.import_module(name) for name in module_names]


def reload_handlers(names: list[str]) -> list[object]:
    loaded: list[object] = []
    for name in names:
        importlib.invalidate_caches()
        module = importlib.import_module("app.handlers")
        loaded.append(getattr(module, name))
    return loaded
