import ast

from fixers.project.forwarding import deletion, star_importers
from fixers.project.scan import binders, names_mentioned
from review.project.index import attribute_chain
from source_text import refuse, replacement


def reaches(index, other, node, path, alias):
    chain = attribute_chain(node)
    if chain is None:
        return False
    head, rest = chain[0], chain[1:]
    binding = index.binding(other, node, head)
    if binding is None:
        return other == path and head == alias and not rest
    if binding[0] == "name":
        return not rest and binding[2] == alias and index.paths.get(binding[1]) == path
    parts = binding[1].split(".") + rest
    return (
        len(parts) > 1
        and parts[-1] == alias
        and index.paths.get(".".join(parts[:-1])) == path
    )


def reference_edits(index, sources, path, alias, target):
    edits = {}
    for other, tree in index.trees.items():
        for node in ast.walk(tree):
            if not (
                isinstance(node, (ast.Name, ast.Attribute))
                and isinstance(node.ctx, ast.Load)
                and reaches(index, other, node, path, alias)
            ):
                continue
            start, end = sources[other].span(node)
            first = start if isinstance(node, ast.Name) else end - len(alias)
            edits.setdefault(other, []).append(replacement(first, end, target))
    return edits


def import_edits(index, sources, path, alias, target):
    edits = {}
    for other, tree in index.trees.items():
        for node in ast.walk(tree):
            if not isinstance(node, ast.ImportFrom):
                continue
            for name in node.names:
                if name.name != alias:
                    continue
                base = index.import_base(other, node)
                if index.paths.get(base) == path:
                    if name.asname is not None:
                        refuse("a caller imports the alias under another name")
                    edit = replacement(*sources[other].span(name), target)
                    edits.setdefault(other, []).append(edit)
                elif base is not None and index.exported(base, alias) == (path, alias):
                    refuse("another module re-exports the alias")
    return edits


def reached_through_importers(index, importers, alias):
    for other, tree in index.trees.items():
        for node in ast.walk(tree):
            chain = attribute_chain(node) if isinstance(node, ast.Attribute) else None
            binding = index.binding(other, node, chain[0]) if chain else None
            if binding is None or binding[0] != "module" or chain[-1] != alias:
                continue
            parts = binding[1].split(".") + chain[1:]
            if index.paths.get(".".join(parts[:-1])) in importers:
                refuse("another module re-exports the alias")


def check_bindings(index, path, alias, target, files):
    for other in files:
        tree = index.trees[other]
        allowed = {"assign"} if other == path else {"import"}
        if set(binders(tree, alias)) - allowed:
            refuse("a caller rebinds the name of the alias")
        if other == path and binders(tree, target) != ["definition"]:
            refuse("the replacement is bound again in the module")
        if other != path and binders(tree, target):
            refuse("a caller already binds the name of the replacement")


def alias_fix(index, sources, editable, path, statement):
    alias, target = statement.targets[0].id, statement.value.id
    source = sources[path]
    if len(index.definitions[path].get(target, [])) != 1:
        refuse("the replacement is not defined in the module of the alias")
    if names_mentioned(index, alias):
        refuse("a string or a non-Python file in the project names the alias")
    if star_importers(index, path):
        refuse("another module imports everything from the module of the alias")
    if binders(index.trees[path], alias) != ["assign"]:
        refuse("the module binds the alias more than once")
    if source.text[source.starts[statement.lineno - 1] : source.span(statement)[0]].strip():
        refuse("another statement shares the line of the alias")
    edits = reference_edits(index, sources, path, alias, target)
    imported = import_edits(index, sources, path, alias, target)
    reached_through_importers(index, set(imported) - {path}, alias)
    for other, more in imported.items():
        edits.setdefault(other, []).extend(more)
    if not edits:
        refuse("no use of the alias is visible in the project")
    check_bindings(index, path, alias, target, set(edits) | {path})
    edits.setdefault(path, []).append(deletion(source, statement, "alias"))
    if not set(edits) <= editable:
        refuse("a caller sits in a file --fix does not cover")
    return edits
