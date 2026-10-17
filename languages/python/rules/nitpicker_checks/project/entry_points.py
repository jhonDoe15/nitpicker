import ast
import configparser
import re
import tokenize

SETUP_CFG = "setup.cfg"
SETUP_PY = "setup.py"
SETUP_CFG_SECTION = "options.entry_points"
ENTRY_POINT = re.compile(r"^\s*[^=\[#]+?=\s*([\w.]+)\s*:\s*([\w.]+)")


def references_in(text):
    return [
        f"{match.group(1)}:{match.group(2)}"
        for match in (ENTRY_POINT.match(line) for line in text.split("\n"))
        if match
    ]


def setup_cfg_entry_points():
    parser = configparser.ConfigParser(interpolation=None)
    try:
        parser.read(SETUP_CFG, encoding="utf-8")
    except (configparser.Error, UnicodeDecodeError):
        return []
    if not parser.has_section(SETUP_CFG_SECTION):
        return []
    return [
        reference
        for _, value in parser.items(SETUP_CFG_SECTION)
        for reference in references_in(value)
    ]


def texts_in(value):
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [text for item in value.values() for text in texts_in(item)]
    if isinstance(value, (list, tuple)):
        return [text for item in value for text in texts_in(item)]
    return []


def module_values(tree):
    values = {}
    for statement in tree.body:
        if isinstance(statement, ast.Assign) and len(statement.targets) == 1:
            target = statement.targets[0]
            if isinstance(target, ast.Name):
                values[target.id] = statement.value
    return values


def literal(node, values):
    if isinstance(node, ast.Name):
        node = values.get(node.id)
    try:
        return ast.literal_eval(node) if node is not None else None
    except (ValueError, TypeError, SyntaxError, RecursionError):
        return None


def is_setup_call(node):
    if not isinstance(node, ast.Call):
        return False
    func = node.func
    name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", None)
    return name == "setup"


def setup_py_entry_points():
    try:
        with tokenize.open(SETUP_PY) as handle:
            tree = ast.parse(handle.read(), SETUP_PY)
    except (OSError, SyntaxError, UnicodeDecodeError, ValueError, RecursionError):
        return []
    values = module_values(tree)
    found = []
    for node in ast.walk(tree):
        if is_setup_call(node):
            for keyword in node.keywords:
                if keyword.arg == "entry_points":
                    value = literal(keyword.value, values)
                    found.extend(ref for text in texts_in(value) for ref in references_in(text))
    return found


def declared_entry_points():
    return setup_cfg_entry_points() + setup_py_entry_points()
