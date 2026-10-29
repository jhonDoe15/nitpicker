import ast
import json
import os
import sys
import tokenize

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
MINIMUM_PYTHON = (3, 10)
SKIPPED_RULE = "rules-skipped"
CHECK_FAILED_RULE = "rules-check-failed"
ALLOWANCES_REPORT = "rules-allowances.json"
GUARDED_PREFIXES = ("security.", "signatures.")


def load_checks():
    sys.path.insert(0, HERE)
    from boundary import domain_types, guards, paths
    from checks import comments, declarations, parameters, shell, state
    from discovery import helpers, uncollected
    from effects import import_time, reach
    from environment import domain_imports, environment, purity
    from errors import errors
    from honesty import assertions, isolation, skipped
    from security import hashes, loading
    from security.sql import check as sql
    from security.timeouts import check as timeouts
    from security.tls import check as tls
    from signatures import defaults, mutation, shims, tri_state
    from silent_tests import unasserted
    from smells import literals, loops, names, secret_logs, secrets
    from tasks import cleanup, lifetimes

    return [
        declarations,
        parameters,
        errors,
        comments,
        environment,
        purity,
        reach,
        domain_imports,
        import_time,
        state,
        shell,
        sql,
        tls,
        hashes,
        timeouts,
        loading,
        guards,
        domain_types,
        paths,
        literals,
        names,
        secrets,
        secret_logs,
        loops,
        skipped,
        assertions,
        unasserted,
        isolation,
        uncollected,
        helpers,
        lifetimes,
        cleanup,
        tri_state,
        defaults,
        mutation,
        shims,
    ]


class FileContext:
    def __init__(self, path, text, tree, project):
        from checks.common import import_aliases, is_domain_path

        self.path = path
        self.text = text
        self.tree = tree
        self.project = project
        self.options = project.options
        self.aliases = import_aliases(tree, project, path)
        self.tests = path in project.test_files
        self.domain = is_domain_path(path, self.tests)
        self.parents = {
            id(child): parent
            for parent in ast.walk(tree)
            for child in ast.iter_child_nodes(parent)
        }


def parse_file(path):
    try:
        with tokenize.open(path) as handle:
            text = handle.read()
        return text, ast.parse(text)
    except (OSError, SyntaxError, UnicodeDecodeError, ValueError):
        return None


def is_guarded(module):
    return getattr(module, "GUARDED", False) or module.__name__.startswith(GUARDED_PREFIXES)


def check_failure(module, context, error):
    return {
        "rule": CHECK_FAILED_RULE,
        "path": context.path,
        "subject": module.RULE,
        "line": 1,
        "error": f"{type(error).__name__}: {error}",
    }


def run_check(module, context, step="check"):
    run = getattr(module, step, None)
    if run is None:
        return [], []
    if not is_guarded(module):
        return run(context), []
    try:
        return run(context), []
    except Exception as error:
        return [], [check_failure(module, context, error)]


class Results:
    def __init__(self, findings, allowances, support):
        self.findings = findings
        self.allowances = allowances
        self.support = support


def check_all(paths, options, modules):
    from checks.comments import stub_findings
    from index.project import Project
    from security.support import support_files

    project = Project(options, paths)
    parsed = {path: parse_file(path) for path in paths}
    for path, source in parsed.items():
        if source is not None:
            project.add(FileContext(path, source[0], source[1], project))
    findings = [item for path in paths for item in stub_findings(path)]
    allowances = []
    for context in project.contexts.values():
        for module in modules:
            found, failures = run_check(module, context)
            allowed, allowance_failures = run_check(module, context, "allowances")
            findings.extend(found + failures + allowance_failures)
            allowances.extend(allowed)
    support = project.memo("security-support-files", support_files)
    return Results(findings, allowances, sorted(support))


def read_options(arguments):
    if len(arguments) < 3:
        return {}
    with open(arguments[2], encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, value):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(value, handle)


def skipped(out_file):
    version = ".".join(str(part) for part in sys.version_info[:3])
    write_json(
        out_file, [{"rule": SKIPPED_RULE, "path": ".", "subject": version, "line": 1}]
    )


def main(arguments):
    list_file, out_file = arguments[:2]
    if sys.version_info < MINIMUM_PYTHON:
        skipped(out_file)
        return
    options = read_options(arguments)
    with open(list_file, encoding="utf-8") as handle:
        paths_to_check = [line.strip() for line in handle if line.strip()]
    results = check_all(paths_to_check, options, load_checks())
    results.findings.sort(
        key=lambda item: (item["path"], item["line"], item["rule"], item["subject"])
    )
    write_json(out_file, results.findings)
    allowed = sorted(
        results.allowances, key=lambda item: (item["path"], item["line"], item["rule"])
    )
    allowances = {"supportFiles": results.support, "allowed": allowed}
    write_json(os.path.join(os.path.dirname(out_file), ALLOWANCES_REPORT), allowances)


if __name__ == "__main__":
    main(sys.argv[1:])
