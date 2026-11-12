import ast
from collections import namedtuple

from design.support.astutil import CLOSURES, FUNCTIONS, body_nodes, closure_arguments

PATTERN_TYPES = tuple(
    t
    for t in (
        getattr(ast, "MatchAs", None),
        getattr(ast, "MatchStar", None),
        getattr(ast, "MatchMapping", None),
    )
    if t is not None
)
IMPLICIT_SELF_FIRST = {"__new__", "__init_subclass__", "__class_getitem__"}


Parameter = namedtuple("Parameter", "name annotation index optional variadic")
Site = namedtuple(
    "Site", "kind value annotation asynchronous", defaults=(None, None, False)
)


def skips_first(function):
    return function.owner is not None and (
        not function.static or function.name in IMPLICIT_SELF_FIRST
    )


def parameters(function):
    arguments = function.node.args
    positional = arguments.posonlyargs + arguments.args
    defaults = [False] * (len(positional) - len(arguments.defaults)) + [True] * len(
        arguments.defaults
    )
    entries = [(a, d, False) for a, d in zip(positional, defaults, strict=True)]
    if arguments.vararg:
        entries.append((arguments.vararg, False, True))
    keyword_defaults = [d is not None for d in arguments.kw_defaults]
    entries += [
        (a, d, False)
        for a, d in zip(arguments.kwonlyargs, keyword_defaults, strict=True)
    ]
    if arguments.kwarg:
        entries.append((arguments.kwarg, False, True))
    if skips_first(function) and positional:
        entries = entries[1:]
    return [
        Parameter(arg.arg, arg.annotation, index, default, variadic)
        for index, (arg, default, variadic) in enumerate(entries)
    ]


def target_names(target):
    if isinstance(target, ast.Name):
        return [target.id]
    if isinstance(target, (ast.Tuple, ast.List)):
        return [name for element in target.elts for name in target_names(element)]
    if isinstance(target, ast.Starred):
        return target_names(target.value)
    return []


def add_site(sites, name, site):
    sites.setdefault(name, []).append(site)


def assigned_sites(node):
    if isinstance(node, ast.AnnAssign):
        site = Site("annotated", node.value, node.annotation)
        return [(name, site) for name in target_names(node.target)]
    if not isinstance(node, ast.Assign):
        return []
    found = []
    for target in node.targets:
        site = Site("assign" if isinstance(target, ast.Name) else "other", node.value)
        found.extend((name, site) for name in target_names(target))
    return found


def assignment_sites(node, sites):
    for name, site in assigned_sites(node):
        add_site(sites, name, site)


def pattern_names(node):
    return [n for n in (getattr(node, "name", None), getattr(node, "rest", None)) if n]


def import_names(node):
    return [(a.asname or a.name).split(".")[0] for a in node.names if a.name != "*"]


def deleted_names(node):
    return [n for target in node.targets for n in target_names(target)]


BINDERS = [
    (
        (ast.For, ast.AsyncFor, ast.comprehension, ast.NamedExpr),
        lambda n: target_names(n.target),
    ),
    ((ast.ExceptHandler,), lambda n: [n.name] if n.name else []),
    ((ast.Global, ast.Nonlocal), lambda n: list(n.names)),
    ((ast.Delete,), deleted_names),
    ((*FUNCTIONS, ast.ClassDef), lambda n: [n.name]),
    (PATTERN_TYPES, pattern_names),
    ((ast.Import, ast.ImportFrom), import_names),
]


def bound_names(node):
    for types, names in BINDERS:
        if types and isinstance(node, types):
            return names(node)
    return []


def other_sites(node, sites):
    if isinstance(node, ast.AugAssign):
        for name in target_names(node.target):
            add_site(sites, name, Site("aug"))
    for name in bound_names(node):
        add_site(sites, name, Site("other"))
    if isinstance(node, (ast.With, ast.AsyncWith)):
        with_sites(node, sites)


def with_item_sites(item, asynchronous):
    variables = item.optional_vars
    if isinstance(variables, ast.Name):
        return [(variables.id, Site("with", item.context_expr, None, asynchronous))]
    names = target_names(variables) if variables is not None else []
    return [(name, Site("other")) for name in names]


def with_sites(node, sites):
    asynchronous = isinstance(node, ast.AsyncWith)
    for item in node.items:
        for name, site in with_item_sites(item, asynchronous):
            add_site(sites, name, site)


def collect_sites(function, params):
    sites = {}
    for parameter in params:
        add_site(sites, parameter.name, Site("param", None, parameter.annotation))
    arguments = function.node.args
    skipped = (
        (arguments.posonlyargs + arguments.args)[:1] if skips_first(function) else []
    )
    for argument in skipped:
        add_site(sites, argument.arg, Site("param", None, None))
    for node in body_nodes(function.node):
        assignment_sites(node, sites)
        other_sites(node, sites)
        if isinstance(node, CLOSURES):
            closure_sites(node, sites)
    return sites


def closure_sites(node, sites):
    for argument in closure_arguments(node):
        annotation = argument.annotation
        site = (
            Site("other") if annotation is None else Site("annotated", None, annotation)
        )
        add_site(sites, argument.arg, site)
