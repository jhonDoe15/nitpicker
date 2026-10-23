import ast

from design.support.astutil import FUNCTIONS, own_nodes

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


class Parameter:
    def __init__(self, name, annotation, index, optional, variadic):
        self.name = name
        self.annotation = annotation
        self.index = index
        self.optional = optional
        self.variadic = variadic


class Site:
    def __init__(self, kind, value=None, annotation=None, asynchronous=False):
        self.kind = kind
        self.value = value
        self.annotation = annotation
        self.asynchronous = asynchronous


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
    entries = [(a, d, False) for a, d in zip(positional, defaults)]
    if arguments.vararg:
        entries.append((arguments.vararg, False, True))
    keyword_defaults = [d is not None for d in arguments.kw_defaults]
    entries += [(a, d, False) for a, d in zip(arguments.kwonlyargs, keyword_defaults)]
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


def assignment_sites(node, sites):
    if isinstance(node, ast.Assign):
        for target in node.targets:
            for name in target_names(target):
                direct = isinstance(target, ast.Name)
                add_site(sites, name, Site("assign" if direct else "other", node.value))
    elif isinstance(node, ast.AnnAssign):
        for name in target_names(node.target):
            add_site(sites, name, Site("annotated", node.value, node.annotation))


def other_sites(node, sites):
    names = []
    if isinstance(node, ast.AugAssign):
        names = target_names(node.target)
    elif isinstance(node, (ast.For, ast.AsyncFor, ast.comprehension)):
        names = target_names(node.target)
    elif isinstance(node, ast.ExceptHandler) and node.name:
        names = [node.name]
    elif isinstance(node, ast.NamedExpr):
        names = target_names(node.target)
    elif isinstance(node, (ast.Global, ast.Nonlocal)):
        names = list(node.names)
    elif isinstance(node, ast.Delete):
        names = [n for target in node.targets for n in target_names(target)]
    elif isinstance(node, FUNCTIONS + (ast.ClassDef,)):
        names = [node.name]
    elif PATTERN_TYPES and isinstance(node, PATTERN_TYPES):
        names = [
            n for n in (getattr(node, "name", None), getattr(node, "rest", None)) if n
        ]
    elif isinstance(node, (ast.Import, ast.ImportFrom)):
        names = [
            (a.asname or a.name).split(".")[0] for a in node.names if a.name != "*"
        ]
    for name in names:
        add_site(sites, name, Site("other"))
    if isinstance(node, (ast.With, ast.AsyncWith)):
        with_sites(node, sites)


def with_sites(node, sites):
    for item in node.items:
        variables = item.optional_vars
        if isinstance(variables, ast.Name):
            site = Site(
                "with", item.context_expr, None, isinstance(node, ast.AsyncWith)
            )
            add_site(sites, variables.id, site)
        elif variables is not None:
            for name in target_names(variables):
                add_site(sites, name, Site("other"))


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
    for node in own_nodes(function.node):
        assignment_sites(node, sites)
        other_sites(node, sites)
    return sites
