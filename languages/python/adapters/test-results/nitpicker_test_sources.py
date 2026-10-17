import ast
import inspect
import os
import tokenize

LOCALS = "<locals>"
FUNCTION_TYPES = (ast.FunctionDef, ast.AsyncFunctionDef)


def read_tree(file):
    try:
        with tokenize.open(file) as handle:
            text = handle.read()
        return text.split("\n"), ast.parse(text, file)
    except (OSError, SyntaxError, UnicodeDecodeError, ValueError, RecursionError):
        return None


def definition(tree, qualname):
    parts = qualname.split(".")
    body, found = tree.body, None
    for index, part in enumerate(parts):
        kinds = FUNCTION_TYPES if index == len(parts) - 1 else (ast.ClassDef,)
        matches = [node for node in body if isinstance(node, kinds) and node.name == part]
        if not matches:
            return None
        found = matches[-1]
        body = found.body
    return found


def source_of(parsed, qualname):
    if parsed is None:
        return None
    lines, tree = parsed
    node = definition(tree, qualname)
    if node is None:
        return None
    start = min([node.lineno] + [decorator.lineno for decorator in node.decorator_list])
    text = [line.strip() for line in lines[start - 1 : node.end_lineno]]
    return {"line": node.lineno, "text": "\n".join(line for line in text if line)}


class Sources:
    def __init__(self, project_root, baseline_root):
        self.project_root = project_root
        self.baseline_root = baseline_root
        self.trees = {}

    def parsed(self, file):
        if file not in self.trees:
            self.trees[file] = read_tree(file)
        return self.trees[file]

    def baseline_file(self, file):
        try:
            relative = os.path.relpath(file, self.project_root)
        except ValueError:
            return None
        if relative.startswith(os.pardir):
            return None
        return os.path.join(self.baseline_root, relative)

    def changed(self, file, qualname, text):
        base_file = self.baseline_file(file)
        if base_file is None:
            return None
        if not os.path.exists(base_file):
            return True
        base = source_of(self.parsed(base_file), qualname)
        return base is None or base["text"] != text

    def describe(self, function):
        try:
            target = inspect.unwrap(function)
            file = os.path.abspath(target.__code__.co_filename)
            qualname = target.__qualname__
        except (AttributeError, ValueError):
            return None
        if LOCALS in qualname:
            return None
        head = source_of(self.parsed(file), qualname)
        if head is None:
            return None
        source = {"file": file, "line": head["line"]}
        if self.baseline_root:
            changed = self.changed(file, qualname, head["text"])
            if changed is not None:
                source["changed"] = changed
        return source
