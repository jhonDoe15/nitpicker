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
    from checks import comments, declarations, environment, errors, state
    from honesty import assertions, collection, isolation, skipped
    from smells import literals, loops, names, secrets

    return [
        declarations,
        errors,
        comments,
        environment,
        state,
        guards,
        domain_types,
        paths,
        literals,
        names,
        secrets,
        loops,
        skipped,
        assertions,
        isolation,
        collection,
    ]


class FileContext:
    def __init__(self, path, text, tree, options):
        from checks.common import import_aliases, is_domain_path, is_test_path

        self.path = path
        self.text = text
        self.tree = tree
        self.options = options
        self.aliases = import_aliases(tree)
        self.tests = is_test_path(path)
        self.domain = is_domain_path(path)


def check_file(path, options, modules):
    from checks.comments import stub_findings

    stubs = stub_findings(path)
    try:
        with tokenize.open(path) as handle:
            text = handle.read()
        tree = ast.parse(text)
    except (OSError, SyntaxError, UnicodeDecodeError, ValueError):
        return stubs
    context = FileContext(path, text, tree, options)
    return stubs + [item for module in modules for item in module.check(context)]


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
    modules = load_checks()
    findings = []
    for path in paths_to_check:
        findings.extend(check_file(path, options, modules))
    findings.sort(
        key=lambda item: (item["path"], item["line"], item["rule"], item["subject"])
    )
    with open(out_file, "w", encoding="utf-8") as handle:
        json.dump(findings, handle)


if __name__ == "__main__":
    main(sys.argv[1:])
