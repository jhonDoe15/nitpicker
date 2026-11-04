from pathlib import PurePosixPath

SOURCE_LAYOUT = "src"
NOT_PACKAGES = {"tests", "test", "docs", "doc", "examples", "scripts", "benchmarks"}


def distribution_of(distributions, path):
    found = None
    for distribution in distributions:
        root = distribution["root"]
        inside = root == "" or path.startswith(root + "/")
        if inside and (found is None or len(root) > len(found["root"])):
            found = distribution
    return found


def has_init(project, root, folders):
    folder = "/".join([*([root] if root else []), *folders])
    return f"{folder}/__init__.py" in project.contexts


def flat_package(project, root, folders):
    marks = [
        has_init(project, root, folders[:size]) for size in range(1, len(folders) + 1)
    ]
    regular = marks.index(True) if True in marks else len(marks)
    namespace_ok = regular == 0 or folders[0] not in NOT_PACKAGES
    return regular < len(marks) and all(marks[regular:]) and namespace_ok


def package_parts(project, distribution, path):
    root = distribution["root"]
    relative = path[len(root) + 1 :] if root else path
    parts = relative.split("/")
    if parts[0] == SOURCE_LAYOUT and len(parts) > 1:
        return parts[1:]
    if len(parts) == 1:
        stem = PurePosixPath(parts[0]).stem
        return parts if stem in distribution.get("modules", []) else None
    return parts if flat_package(project, root, parts[:-1]) else None


def public_module(project, distribution, path):
    parts = package_parts(project, distribution, path)
    if parts is None:
        return False
    stem = PurePosixPath(parts[-1]).stem
    return all(not part.startswith("_") for part in parts[:-1]) and (
        stem == "__init__" or not stem.startswith("_")
    )


def public_name(module, name):
    if module.exports is not None:
        return name in module.exports
    return not name.startswith("_")


def published_module(index, module):
    distribution = distribution_of(index.distributions, module.path)
    if distribution is None or not distribution["published"]:
        return False
    return public_module(index.project, distribution, module.path)


def module_names(index, module):
    names = set(module.imports)
    for path in module.stars:
        target = index.modules[path]
        names.update(target.exports or [*target.classes, *target.functions])
    return names


def module_reexports(index, module):
    from design.resolve.lookup import lookup

    names = [n for n in module_names(index, module) if public_name(module, n)]
    entities = (lookup(index, module, name) for name in names)
    return {getattr(e, "id", None) for e in entities if e is not None}


def reexported_ids(index):
    if index.reexported is None:
        published = [m for m in index.modules.values() if published_module(index, m)]
        index.reexported = set().union(*(module_reexports(index, m) for m in published))
    return index.reexported


def is_published(index, entity):
    module = entity.module
    if published_module(index, module) and public_name(module, entity.name):
        return True
    return entity.id in reexported_ids(index)
