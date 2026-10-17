import ast
import os

HELPER_DIRECTORIES = {
    "testing",
    "test_utils",
    "test_helpers",
    "test_support",
    "testutils",
    "test_fixtures",
    "fixtures",
}
HELPER_STEMS = {"testing", "testutils", "fixtures"}


def under_source_root(path, roots):
    return any(
        root in {".", ""} or path == root or path.startswith(root.rstrip("/") + "/")
        for root in roots
    )


def helper_name(path):
    parts = path.split("/")
    directory = next((part for part in parts[:-1] if part in HELPER_DIRECTORIES), None)
    if directory is not None:
        return f"{directory}/"
    stem = os.path.splitext(parts[-1])[0]
    return parts[-1] if stem in HELPER_STEMS else None


def exported_names(tree):
    names = set()
    for node in tree.body:
        if isinstance(node, ast.ImportFrom):
            if node.module:
                names.add(node.module.split(".")[-1])
            names.update(alias.name for alias in node.names)
        elif isinstance(node, ast.Import):
            names.update(alias.name.split(".")[-1] for alias in node.names)
        elif isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == "__all__" for t in node.targets
        ):
            names.update(
                e.value
                for e in getattr(node.value, "elts", [])
                if isinstance(e, ast.Constant) and isinstance(e.value, str)
            )
    return names


def is_exported(context):
    parts = context.path.split("/")
    package = "/".join(parts[:-1] + ["__init__.py"])
    owner = context.project.contexts.get(package)
    stem = os.path.splitext(parts[-1])[0]
    return owner is not None and stem in exported_names(owner.tree)


def check(context):
    roots = context.options.get("sourceRoots") or ["."]
    if context.tests or not under_source_root(context.path, roots):
        return []
    name = helper_name(context.path)
    if name is None or (not name.endswith("/") and is_exported(context)):
        return []
    return [
        {
            "rule": "test-helper-in-source",
            "path": context.path,
            "subject": name,
            "line": 1,
        }
    ]
