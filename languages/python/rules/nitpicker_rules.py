import ast
import json
import os
import sys
import tokenize

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))


def load_checks():
    sys.path.insert(0, HERE)
    from boundary import domain_types, guards, paths
    from checks import comments, declarations, state
    from environment import environment, purity
    from errors import errors
    from honesty import assertions, collection, isolation, skipped
    from smells import literals, loops, names, secret_logs, secrets

    return [
        declarations,
        errors,
        comments,
        environment,
        purity,
        state,
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
        collection,
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


def check_all(paths, options, modules):
    from checks.comments import stub_findings
    from index.project import Project

    project = Project(options, paths)
    parsed = {path: parse_file(path) for path in paths}
    for path, source in parsed.items():
        if source is not None:
            project.add(FileContext(path, source[0], source[1], project))
    findings = [item for path in paths for item in stub_findings(path)]
    for context in project.contexts.values():
        findings.extend(item for module in modules for item in module.check(context))
    return findings


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
