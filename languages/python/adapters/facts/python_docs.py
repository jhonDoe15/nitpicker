import ast

from nitpicker_checks.common import scoped_definitions
from nitpicker_checks.docstrings import description_lines


def doc_comments(tree):
    found = []
    for node, scope in scoped_definitions(tree):
        docstring = ast.get_docstring(node, clean=True)
        if docstring:
            found.append(
                {
                    "line": node.body[0].lineno,
                    "name": node.name,
                    "qualifiedName": ".".join(scope),
                    "lines": description_lines(docstring),
                }
            )
    return sorted(found, key=lambda entry: entry["line"])


def is_main_guard(statement):
    test = getattr(statement, "test", None)
    return (
        isinstance(statement, ast.If)
        and isinstance(test, ast.Compare)
        and isinstance(test.left, ast.Name)
        and test.left.id == "__name__"
        and len(test.comparators) == 1
        and isinstance(test.comparators[0], ast.Constant)
        and test.comparators[0].value == "__main__"
    )


def is_script(tree):
    return any(is_main_guard(statement) for statement in tree.body)
