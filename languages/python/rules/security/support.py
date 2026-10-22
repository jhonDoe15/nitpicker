import posixpath

TEST_ROOTS = {"tests", "test"}
SUPPORT_FOLDERS = {
    "testing",
    "test_support",
    "test-support",
    "test_utils",
    "test_helpers",
    "testutils",
    "test_fixtures",
    "fixtures",
    "__fixtures__",
    "mocks",
    "__mocks__",
    "fakes",
    "stubs",
}
SUPPORT_FILES = {"testing.py", "testutils.py", "fixtures.py"}
CONFTEST = "conftest.py"
ROOT_MARKERS = {"", "."}


def under_test_root(path, testpaths):
    parts = path.split("/")
    if any(part in TEST_ROOTS for part in parts[:-1]) or parts[-1] == CONFTEST:
        return True
    for root in testpaths:
        prefix = posixpath.normpath(root).strip("/")
        if prefix not in ROOT_MARKERS and (
            path == prefix or path.startswith(prefix + "/")
        ):
            return True
    return False


def support_group(path):
    parts = path.split("/")
    for index, part in enumerate(parts[:-1]):
        if part in SUPPORT_FOLDERS:
            return "/".join(parts[: index + 1])
    return path if parts[-1] in SUPPORT_FILES else None


def imported_paths(context):
    project = context.project
    found = set()
    for dotted in list(context.aliases[0].values()) + list(context.aliases[1].values()):
        parts = dotted.split(".")
        for size in range(len(parts), 0, -1):
            path = project.module_path(".".join(parts[:size]))
            if path is not None:
                found.add(path)
                break
    return found


def live_groups(project, candidates, production):
    live, pending = set(), list(production)
    seen = set(production)
    while pending:
        context = project.contexts.get(pending.pop())
        for target in imported_paths(context) if context is not None else []:
            group = candidates.get(target)
            if group is None or group in live:
                continue
            live.add(group)
            members = [path for path, owner in candidates.items() if owner == group]
            pending.extend(path for path in members if path not in seen)
            seen.update(members)
    return live


def support_files(project):
    testpaths = project.options.get("testpaths") or []
    support, candidates = set(), {}
    for path in project.paths:
        if path in project.test_files or under_test_root(path, testpaths):
            support.add(path)
            continue
        group = support_group(path)
        if group is not None:
            candidates[path] = group
    production = [p for p in project.paths if p not in support and p not in candidates]
    live = live_groups(project, candidates, production)
    return support | {path for path, group in candidates.items() if group not in live}


def exempt(context):
    files = context.project.memo("security-support-files", support_files)
    return context.tests or context.path in files
