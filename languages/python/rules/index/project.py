import os

ROOT_MARKERS = {".", ""}


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
        roots = sorted(options.get("sourceRoots") or ["."], key=len, reverse=True)
        for path in paths:
            self.index_path(path, roots)

    def index_path(self, path, roots):
        parts = module_parts(path)
        relative = next(
            filter(None, (under_root(parts, root) for root in roots)), parts
        )
        self.names.setdefault(".".join(relative), path)
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
        matches = self.suffixes.get(dotted, [])
        return matches[0] if len(matches) == 1 else None

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
        return self.module_name(f"{candidate}/__init__.py") if candidate and not existing else None

    def locate(self, dotted):
        parts = dotted.split(".")
        for size in range(len(parts) - 1, 0, -1):
            path = self.module_path(".".join(parts[:size]))
            if path is not None:
                return path, parts[size]
        return None
