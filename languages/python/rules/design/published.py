import os

SOURCE_LAYOUT = "src"


def distribution_of(distributions, path):
    found = None
    for distribution in distributions:
        root = distribution["root"]
        inside = root == "" or path.startswith(root + "/")
        if inside and (found is None or len(root) > len(found["root"])):
            found = distribution
    return found


def package_parts(project, root, path):
    relative = path[len(root) + 1 :] if root else path
    parts = relative.split("/")
    if parts[0] == SOURCE_LAYOUT and len(parts) > 2:
        root = os.path.join(root, SOURCE_LAYOUT) if root else SOURCE_LAYOUT
        parts = parts[1:]
    folders = parts[:-1]
    for size in range(1, len(folders) + 1):
        folder = "/".join([*([root] if root else []), *folders[:size]])
        if f"{folder}/__init__.py" not in project.contexts:
            return None
    return parts if folders else None


def public_module(project, distribution, path):
    parts = package_parts(project, distribution["root"], path)
    if parts is None:
        return False
    stem = os.path.splitext(parts[-1])[0]
    return all(not part.startswith("_") for part in parts[:-1]) and (
        stem == "__init__" or not stem.startswith("_")
    )


def public_name(module, name):
    if module.exports is not None:
        return name in module.exports
    return not name.startswith("_")


def is_published(index, module, name):
    distribution = distribution_of(index.distributions, module.path)
    if distribution is None or not distribution["published"]:
        return False
    return public_module(index.project, distribution, module.path) and public_name(
        module, name
    )
