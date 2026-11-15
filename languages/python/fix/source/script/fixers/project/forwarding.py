import ast

from fixers.project.scan import binders, names_mentioned
from review.project.forwarding import forwarded_call, target_of
from source_text import refuse, replacement


def star_importers(index, path):
    module = index.modules[path]
    return [other for other in index.trees if module in index.star_imported(other)]


def references(index, key):
    found = []
    for path, tree in index.trees.items():
        for node in ast.walk(tree):
            if isinstance(node, (ast.Name, ast.Attribute)) and isinstance(
                node.ctx, ast.Load
            ):
                resolved = index.resolve(path, node)
                if resolved is not None and (resolved[0], resolved[1]) == key:
                    found.append((path, node))
    return found


def direct_imports(index, key):
    path, name = key
    found = []
    for other, tree in index.trees.items():
        for node in ast.walk(tree):
            if not isinstance(node, ast.ImportFrom):
                continue
            for alias in node.names:
                if alias.name != name:
                    continue
                base = index.import_base(other, node)
                if index.paths.get(base) == path:
                    found.append((other, alias))
                elif base is not None and index.definition(base, name) is not None:
                    resolved = index.definition(base, name)
                    if (resolved[0], resolved[1]) == key:
                        refuse("another module re-exports the wrapper")
    return found


def deletion(source, fn):
    first = fn.lineno - 1
    while first > 0 and source.lines[first - 1].lstrip().startswith("#"):
        first -= 1
    start = source.starts[first]
    last = fn.end_lineno
    rest = source.lines[last - 1][fn.end_col_offset :]
    if rest.strip() and not rest.strip().startswith("#"):
        refuse("another statement shares the last line of the wrapper")
    end = source.starts[last] if last < len(source.starts) else len(source.text)
    while last < len(source.lines) and not source.lines[last].strip():
        last += 1
        end = source.starts[last] if last < len(source.starts) else len(source.text)
    if end == len(source.text):
        row = first
        while row > 0 and not source.lines[row - 1].strip():
            row -= 1
        start = source.starts[row]
    return replacement(start, end, "")


def replacement_text(source, call, same_module, target_name):
    if same_module:
        return target_name
    func = call.func
    if not isinstance(func, ast.Name):
        refuse("the wrapper reaches its target through an attribute of another module")
    return source.source_of(func)


def collect_edits(index, sources, key, call, target):
    path, name = key
    target_path, target_name, _ = target
    same_module = target_path == path
    refs = references(index, key)
    imports = direct_imports(index, key)
    if not refs:
        refuse("no caller of the wrapper is visible in the project")
    if not same_module and any(other != path for other, _ in refs):
        refuse("callers outside the module cannot import a target from another module")
    text = replacement_text(sources[path], call, same_module, target_name)
    edits = {}
    for other, node in refs:
        parent = index.parents[other].get(id(node))
        if not (isinstance(parent, ast.Call) and parent.func is node):
            refuse("the wrapper is used as a value, not only called")
        source = sources[other]
        if isinstance(node, ast.Attribute):
            if not same_module:
                refuse("a caller reaches the wrapper through a module attribute")
            end = source.span(node)[1]
            edit = replacement(end - len(name), end, target_name)
        else:
            edit = replacement(*source.span(node), text)
        edits.setdefault(other, []).append(edit)
    for other, alias in imports:
        if alias.asname is not None:
            refuse("a caller imports the wrapper under another name")
        if not any(p == other for p, _ in refs):
            refuse("a module imports the wrapper without calling it")
        edits.setdefault(other, []).append(
            replacement(*sources[other].span(alias), target_name)
        )
    return edits, same_module, text


def check_bindings(index, key, files, same_module, target_name, text):
    path, name = key
    for other in files:
        tree = index.trees[other]
        if set(binders(tree, name)) - {"import", "definition"}:
            refuse("a caller rebinds the name of the wrapper")
        if other == path and not same_module:
            head = text.split(".")[0]
            if binders(tree, head) != ["import"]:
                refuse("the target name is not a single module-level import")
        elif other == path:
            if binders(tree, target_name) != ["definition"]:
                refuse("the target name is bound again in the module")
        elif binders(tree, target_name):
            refuse("a caller already binds the name of the target")


def forwarding(index, sources, editable, path, fn):
    key = (path, fn.name)
    if names_mentioned(index, fn.name):
        refuse("a string or a non-Python file in the project names the wrapper")
    if star_importers(index, path):
        refuse("another module imports everything from the wrapper's module")
    call = forwarded_call(fn)
    target = target_of(index, path, call)
    edits, same_module, text = collect_edits(index, sources, key, call, target)
    check_bindings(index, key, set(edits) | {path}, same_module, target[1], text)
    edits.setdefault(path, []).append(deletion(sources[path], fn))
    if not set(edits) <= editable:
        refuse("a caller sits in a file --fix does not cover")
    return edits
