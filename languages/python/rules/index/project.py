import importlib.machinery
import os
import sys

ROOT_MARKERS = {".", ""}
SCRIPT_ROOT = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))


def module_parts(path):
    stem = path[: -len(".py")] if path.endswith(".py") else path
    parts = stem.split("/")
    return parts[:-1] if parts[-1] == "__init__" else parts


def under_root(parts, root):
    prefix = [] if root in ROOT_MARKERS else root.strip("/").split("/")
    return parts[len(prefix) :] if parts[: len(prefix)] == prefix else None


class Project:
    def __init__(self, options, paths):
        self.options = options
        self.paths = paths
        self.test_files = frozenset(options.get("testFiles", []))
        self.contexts = {}
        self.memos = {}
        self.names = {}
        self.suffixes = {}
        self.packages = set()
        self.outside = {}
        roots = sorted(options.get("sourceRoots") or ["."], key=len, reverse=True)
        for path in paths:
            self.index_path(path, roots)

    def index_path(self, path, roots):
        parts = module_parts(path)
        relative = next(
            filter(None, (under_root(parts, root) for root in roots)), parts
        )
        self.names.setdefault(".".join(relative), path)
        self.packages.update(path.split("/")[:-1])
        for start in range(len(parts)):
            self.suffixes.setdefault(".".join(parts[start:]), []).append(path)

    def add(self, context):
        self.contexts[context.path] = context

    def memo(self, key, build):
        if key not in self.memos:
            self.memos[key] = build(self)
        return self.memos[key]

    def module_path(self, dotted):
        if dotted in self.names:
            return self.names[dotted]
        if not self.may_be_suffix(dotted.split(".")[0]):
            return None
        matches = self.suffixes.get(dotted, [])
        return matches[0] if len(matches) == 1 else None

    def may_be_suffix(self, first):
        if first in sys.stdlib_module_names or first not in self.packages:
            return False
        if first not in self.outside:
            self.outside[first] = installed_elsewhere(first)
        return not self.outside[first]

    def module_name(self, path):
        parts = module_parts(path)
        for root in sorted(
            self.options.get("sourceRoots") or ["."], key=len, reverse=True
        ):
            relative = under_root(parts, root)
            if relative:
                return ".".join(relative)
        return ".".join(parts)

    def relative_module(self, path, level, module, existing=True):
        base = os.path.dirname(path).split("/") if "/" in path else []
        base = base[: len(base) - (level - 1)] if level > 1 else base
        target = [part for part in base if part] + (module.split(".") if module else [])
        candidate = "/".join(target)
        for option in (f"{candidate}.py", f"{candidate}/__init__.py"):
            if option in self.paths:
                return self.module_name(option)
        return (
            self.module_name(f"{candidate}/__init__.py")
            if candidate and not existing
            else None
        )

    def locate(self, dotted):
        parts = dotted.split(".")
        for size in range(len(parts) - 1, 0, -1):
            path = self.module_path(".".join(parts[:size]))
            if path is not None:
                return path, parts[size]
        return None


def installed_elsewhere(name):
    search = [
        entry for entry in sys.path if os.path.realpath(entry or ".") != SCRIPT_ROOT
    ]
    try:
        spec = importlib.machinery.PathFinder.find_spec(name, search)
    except (ImportError, ValueError):
        return False
    origin = getattr(spec, "origin", None) if spec else None
    locations = list(getattr(spec, "submodule_search_locations", None) or [])
    places = [origin] if origin else locations
    root = os.path.realpath(os.getcwd())
    return bool(places) and not any(
        os.path.realpath(place).startswith(root + os.sep) for place in places
    )
