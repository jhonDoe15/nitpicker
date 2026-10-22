import ast
import fnmatch
import os
import re

from checks.common import dotted_name, finding
from discovery.patterns import is_function

RULE = "uncollected-tests"
TOKEN = re.compile(r"\(|\)|[^\s()]+")
OPERATORS = {"and", "or", "not"}


def clean(path):
    return os.path.normpath(path).replace(os.sep, "/")


def under(path, prefix):
    prefix = clean(prefix)
    return path == prefix or path.startswith(prefix.rstrip("/") + "/")


def norecursedir_reason(path, options):
    patterns = options.get("norecursedirs") or []
    for part in path.split("/")[:-1]:
        if any(fnmatch.fnmatch(part, pattern) for pattern in patterns):
            return f"{path} (norecursedirs)"
    return None


def testpath_reason(path, options):
    testpaths = options.get("testpaths") or []
    if testpaths and not any(
        under(path, p) or fnmatch.fnmatch(path, clean(p)) for p in testpaths
    ):
        return f"{path} (testpaths)"
    return None


def ignore_reason(path, options):
    ignored = options.get("ignored") or []
    globs = options.get("ignoredGlobs") or []
    if any(under(path, entry) for entry in ignored) or any(
        fnmatch.fnmatch(path, clean(pattern))
        or fnmatch.fnmatch(os.path.basename(path), pattern)
        for pattern in globs
    ):
        return f"{path} (--ignore)"
    return None


def collect_ignores(project):
    def build(_):
        entries = []
        for path, context in project.contexts.items():
            if os.path.basename(path) != "conftest.py":
                continue
            base = os.path.dirname(path)
            for node in context.tree.body:
                entries.extend(ignore_entries(node, base))
        return entries

    return project.memo("collect-ignores", build)


def ignore_entries(node, base):
    if not isinstance(node, ast.Assign) or not isinstance(
        node.value, (ast.List, ast.Tuple)
    ):
        return []
    names = {t.id for t in node.targets if isinstance(t, ast.Name)}
    kinds = [
        kind for kind in ("collect_ignore", "collect_ignore_glob") if kind in names
    ]
    values = [
        e.value
        for e in node.value.elts
        if isinstance(e, ast.Constant) and isinstance(e.value, str)
    ]
    return [
        (kind, clean(os.path.join(base, value))) for kind in kinds for value in values
    ]


def collect_ignore_reason(path, project):
    for kind, entry in collect_ignores(project):
        if (kind == "collect_ignore" and under(path, entry)) or (
            kind == "collect_ignore_glob" and fnmatch.fnmatch(path, entry)
        ):
            return f"{path} (collect_ignore)"
    return None


def file_reason(path, context):
    options = context.options
    return (
        norecursedir_reason(path, options)
        or testpath_reason(path, options)
        or ignore_reason(path, options)
        or collect_ignore_reason(path, context.project)
    )


def test_nodes(tree, functions_matcher):
    found = []
    for node in tree.body:
        if is_function(node) and functions_matcher(node.name):
            found.append((None, node))
        elif isinstance(node, ast.ClassDef):
            found.extend(
                (node.name, member)
                for member in node.body
                if is_function(member) and functions_matcher(member.name)
            )
    return found


def deselected_ids(options, path):
    ids = []
    for entry in options.get("deselected") or []:
        file, _, rest = clean(entry).partition("::")
        if file == path or file.endswith("/" + path):
            ids.append(
                [re.sub(r"\[.*$", "", part) for part in rest.split("::") if part]
            )
    return ids


def is_deselected(owner, function, ids):
    parts = [owner, function.name] if owner else [function.name]
    return any(
        parts == entry or (entry and len(entry) == 1 and entry[0] == owner)
        for entry in ids
    )


def marker_names(function, aliases):
    names = set()
    for decorator in function.decorator_list:
        target = decorator.func if isinstance(decorator, ast.Call) else decorator
        dotted = dotted_name(target, aliases) or ""
        if dotted.startswith("pytest.mark."):
            names.add(dotted.split(".")[-1].lower())
    return names


def evaluate(tokens, names):
    position = [0]

    def peek():
        return tokens[position[0]] if position[0] < len(tokens) else None

    def take():
        position[0] += 1
        return tokens[position[0] - 1]

    def primary():
        token = take()
        if token == "not":
            return not primary()
        if token == "(":
            value = disjunction()
            if peek() == ")":
                take()
            return value
        return any(token.lower() in name for name in names)

    def conjunction():
        value = primary()
        while peek() == "and":
            take()
            right = primary()
            value = value and right
        return value

    def disjunction():
        value = conjunction()
        while peek() == "or":
            take()
            right = conjunction()
            value = value or right
        return value

    return disjunction()


def keyword_matches(expression, names):
    tokens = TOKEN.findall(expression)
    if not tokens or tokens[0] in {"and", "or"}:
        return True
    try:
        return evaluate(tokens, names)
    except IndexError:
        return True


def hidden_test_findings(context, functions_matcher):
    path = context.path
    ids = deselected_ids(context.options, path)
    expressions = context.options.get("keywords") or []
    stem = os.path.splitext(os.path.basename(path))[0].lower()
    found = []
    for owner, function in test_nodes(context.tree, functions_matcher):
        names = {stem, function.name.lower()} | marker_names(function, context.aliases)
        names |= {owner.lower()} if owner else set()
        if is_deselected(owner, function, ids):
            reason = "--deselect"
        elif not all(keyword_matches(e, names) for e in expressions):
            reason = "-k"
        else:
            continue
        label = f"{owner}.{function.name}" if owner else function.name
        found.append(finding(path, RULE, f"{label} ({reason})", function))
    return found
