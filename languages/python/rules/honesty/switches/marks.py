import ast

from checks.common import dotted_name
from syntax.folding import module_constants

NAME_HOPS = 8
MARKER_METHODS = {"add_marker", "applymarker"}
PYTESTMARK = "pytestmark"


class Site:
    def __init__(self, expression, at, call=None):
        self.expression = expression
        self.at = at
        self.call = call


def expand(expression, names):
    found = []
    pending = [(expression, expression, 0, False)]
    while pending:
        node, site, hops, via_name = pending.pop()
        if isinstance(node, ast.Name) and node.id in names and hops < NAME_HOPS:
            pending.append((names[node.id], site, hops + 1, True))
        elif isinstance(node, (ast.List, ast.Tuple)) and hops < NAME_HOPS:
            pending.extend(
                (element, site if via_name else element, hops + 1, via_name)
                for element in reversed(node.elts)
            )
        else:
            found.append((node, site))
    return found


def targets_pytestmark(node):
    targets = node.targets if isinstance(node, ast.Assign) else [node.target]
    return any(isinstance(t, ast.Name) and t.id == PYTESTMARK for t in targets)


def declared(node):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        return list(node.decorator_list)
    assigned = (ast.Assign, ast.AnnAssign, ast.AugAssign)
    if isinstance(node, assigned) and node.value is not None and targets_pytestmark(node):
        return [node.value]
    return []


def keyword_marks(call, aliases):
    if dotted_name(call.func, aliases) != "pytest.param":
        return []
    return [k.value for k in call.keywords if k.arg == "marks"]


def imperative(call):
    func = call.func
    if isinstance(func, ast.Attribute) and func.attr in MARKER_METHODS and call.args:
        return [call.args[0]]
    return []


def mark_sites(context):
    cached = getattr(context, "mark_site_cache", None)
    if cached is not None:
        return cached
    names = module_constants(context.tree)
    sites = []
    for node in ast.walk(context.tree):
        for expression in declared(node):
            sites.extend(Site(e, at) for e, at in expand(expression, names))
        if isinstance(node, ast.Call):
            for expression in keyword_marks(node, context.aliases):
                sites.extend(Site(e, at) for e, at in expand(expression, names))
            for expression in imperative(node):
                sites.extend(Site(e, node, node) for e, _ in expand(expression, names))
    context.mark_site_cache = sites
    return sites
