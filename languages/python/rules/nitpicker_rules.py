import ast
import json
import os
import sys
import tokenize

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
TOO_DEEP_RULE = "rules-skipped"


def load_checks():
    sys.path.insert(0, HERE)
    from boundary import domain_types, guards, paths
    from checks import comments, declarations, shell, sql, state
    from environment import environment, purity
    from errors import errors
    from discovery import helpers, uncollected
    from honesty import assertions, isolation, skipped
    from review import docstrings, fields
    from smells import literals, loops, names, secret_logs, secrets

    return [
        declarations,
        errors,
        comments,
        environment,
        purity,
        state,
        shell,
        sql,
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
        isolation,
        uncollected,
        helpers,
        docstrings,
        fields,
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


def too_deep(path, subject):
    return {"rule": TOO_DEEP_RULE, "path": path, "subject": subject, "line": 1}


def file_findings(context, modules):
    found, skipped = [], False
    for module in modules:
        try:
            found.extend(module.check(context))
        except RecursionError:
            skipped = True
    return found + ([too_deep(context.path, "file")] if skipped else [])


def review_findings(project):
    from review.project.entry_points import declared_entry_points, invalid_file_findings
    from review.project.enum_predicates import enum_predicate_findings
    from review.project.forwarding import forwarding_findings
    from review.project.index import ProjectIndex
    from review.project.unused_options import unused_option_findings

    entries, problems = declared_entry_points()
    options = dict(project.options)
    options["entryPoints"] = options.get("entryPoints", []) + entries
    trees = {path: context.tree for path, context in project.contexts.items()}
    index = ProjectIndex(trees, options.get("modules", {}), project.test_files)
    checks = {
        "forwarding-wrapper": lambda: forwarding_findings(index),
        "exhaustive-enum-predicate": lambda: enum_predicate_findings(index),
        "unused-option": lambda: unused_option_findings(index, options),
    }
    found = invalid_file_findings(options.get("invalidFiles", []) + problems)
    for name, run in checks.items():
        try:
            found.extend(run())
        except RecursionError:
            found.append(too_deep(".", name))
    return found


def check_all(paths, options, modules):
    from checks.comments import stub_findings
    from index.project import Project

    project = Project(options, paths)
    findings = [item for path in paths for item in stub_findings(path)]
    for path in paths:
        try:
            source = parse_file(path)
        except RecursionError:
            findings.append(too_deep(path, "all"))
            continue
        if source is not None:
            project.add(FileContext(path, source[0], source[1], project))
    for context in project.contexts.values():
        findings.extend(file_findings(context, modules))
    return findings + review_findings(project)


def read_options(arguments):
    if len(arguments) < 3:
        return {}
    with open(arguments[2], encoding="utf-8") as handle:
        return json.load(handle)


def main(arguments):
    list_file, out_file = arguments[:2]
    options = read_options(arguments)
    with open(list_file, encoding="utf-8") as handle:
        paths_to_check = [line.strip() for line in handle if line.strip()]
    findings = check_all(paths_to_check, options, load_checks())
    findings.sort(
        key=lambda item: (item["path"], item["line"], item["rule"], item["subject"])
    )
    with open(out_file, "w", encoding="utf-8") as handle:
        json.dump(findings, handle)


if __name__ == "__main__":
    main(sys.argv[1:])
