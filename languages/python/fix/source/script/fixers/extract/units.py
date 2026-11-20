import ast

from fixers.extract.support.scopes import FUNCTIONS


def unit_index(tree):
    pending = [(statement, "", tree) for statement in tree.body]
    roots = []
    for node, qualifier, parent in pending:
        if isinstance(node, FUNCTIONS):
            roots.append((node, f"{qualifier}{node.name}", parent))
        elif isinstance(node, ast.ClassDef):
            pending.extend((child, f"{qualifier}{node.name}.", node) for child in node.body)
    roots.sort(key=lambda root: (root[0].lineno, root[0].col_offset))
    seen, index = {}, {}
    for node, label, parent in roots:
        count = seen.get(label, 0) + 1
        seen[label] = count
        index[label if count == 1 else f"{label}#{count}"] = (node, parent)
    return index


def function_of(index, unit):
    found = index.get(unit["name"])
    if found is None:
        return None
    node = found[0]
    return found if (node.lineno, node.end_lineno) == (unit["start"], unit["end"]) else None


def label_stem(label):
    cleaned = label.split("#")[0]
    return cleaned.rsplit(".", 1)[-1]
