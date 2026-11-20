import ast

from fixers.extract.support.align import Alignment
from fixers.extract.flow import analyse
from fixers.extract.support.render import (
    helper_name,
    hole_argument,
    hole_names,
    indentation,
    insertion,
    newline_of,
    replaced_body,
)
from fixers.extract.support.scopes import comments_in, forbidden, identifiers
from fixers.extract.support.hierarchy import subclass_problem
from fixers.extract.units import label_stem
from fixers.extract.whole import (
    dump,
    plain_signature,
    same_container,
    statements_of,
)
from source_text import refuse


def parts_of(function, span):
    body = statements_of(function)
    starts = [i for i, s in enumerate(body) if s.lineno == span["start"]]
    ends = [i for i, s in enumerate(body) if s.end_lineno == span["end"]]
    if len(starts) != 1 or len(ends) != 1 or ends[0] < starts[0]:
        refuse("a run is not a whole list of statements in the function body")
    begin, finish = starts[0], ends[0]
    return {"run": body[begin : finish + 1], "before": body[:begin], "after": body[finish + 1 :]}


def input_pairs(alignment, sides, function_pair):
    pairs = []
    for name in sides[0]["inputs"]:
        partner = alignment.forward.get(name)
        if partner is None or partner not in sides[1]["inputs"]:
            refuse("a value the run reads has no counterpart in the other copy")
        pairs.append((name, partner))
    return pairs


def input_text(source, functions, pair):
    arguments = [{a.arg: a for a in function.args.args} for function in functions]
    left, right = arguments[0].get(pair[0]), arguments[1].get(pair[1])
    if left is not None and right is not None and left.annotation and right.annotation:
        if dump(left.annotation) == dump(right.annotation):
            return source.source_of(left)
    return pair[0]


def output_annotation(source, run, name):
    for statement in run:
        if isinstance(statement, ast.AnnAssign) and getattr(statement.target, "id", None) == name:
            return source.source_of(statement.annotation)
    return None


def run_lines(parts):
    return parts["run"][0].lineno, parts["run"][-1].end_lineno


def checked(source, request):
    functions, containers, runs = request["functions"], request["containers"], request["runs"]
    for function in functions:
        plain_signature(function)
    same_container(functions, containers)
    parts = [parts_of(function, span) for function, span in zip(functions, runs)]
    if len(parts[0]["run"]) != len(parts[1]["run"]):
        refuse("the runs have different numbers of statements")
    for function, part in zip(functions, parts):
        forbidden(function.args.defaults)
        indentation(source, part["run"][0])
    comments = [comments_in(source.text, *run_lines(part)) for part in parts]
    if not set(comments[1]) <= set(comments[0]):
        refuse("the second copy has comments the shared function would drop")
    sides = [analyse(function, part) for function, part in zip(functions, parts)]
    return parts, sides


def aligned(request, parts, sides):
    functions = request["functions"]
    inside = tuple(side["inside"] for side in sides)
    alignment = Alignment(tuple(side["locals"] for side in sides), inside)
    method = isinstance(request["containers"][0], ast.ClassDef)
    if method:
        left, right = (function.args.args[0].arg for function in functions)
        alignment.bind(left, right)
    holes = alignment.run(zip(*(part["run"] for part in parts)))
    if len({hole.key[:2] for hole in holes}) != request["holes"]:
        refuse("the differing values do not match the ones the rule found")
    out = [side["output"] for side in sides]
    if (out[0] is None) != (out[1] is None) or (out[0] and alignment.forward.get(out[0]) != out[1]):
        refuse("the runs define different values")
    return alignment, holes, method


def extract(source, request):
    functions = request["functions"]
    parts, sides = checked(source, request)
    alignment, holes, method = aligned(request, parts, sides)
    first = functions[0]
    pairs = input_pairs(alignment, sides, functions)
    if method:
        pairs = [pair for pair in pairs if pair[0] != first.args.args[0].arg]
    taken = identifiers(source.tree) | request["claimed"]
    name = helper_name(f"{label_stem(request['label'])}_steps", taken)
    names = hole_names(holes, taken | {name})
    request["claimed"].add(name)
    if method:
        subclass_problem(request["containers"][0], name, request["project"])
    heads = [first.args.args[0].arg] if method else []
    heads += [input_text(source, functions, pair) for pair in pairs] + names
    output = sides[0]["output"]
    annotation = output_annotation(source, parts[0]["run"], output) if output else None
    returns = "" if annotation is None else f" -> {annotation}"
    eol, indent = newline_of(source), indentation(source, parts[0]["run"][0])
    helper = f"def {name}({', '.join(heads)}){returns}:{eol}{indent}"
    helper += replaced_body(source, parts[0]["run"], holes, names)
    helper += f"{eol}{indent}return {output}" if output else ""
    edits = []
    for side, function in enumerate(functions):
        own = [pair[side] for pair in pairs]
        values = [hole_argument(source, hole, side) for hole in holes]
        callee = f"{function.args.args[0].arg}.{name}" if method else name
        call = f"{callee}({', '.join(own + values)})"
        out = sides[side]["output"]
        kept = output_annotation(source, parts[side]["run"], out) if out else None
        target = "" if out is None else f"{out}{'' if kept is None else f': {kept}'} = "
        start, _ = source.span(parts[side]["run"][0])
        _, end = source.span(parts[side]["run"][-1])
        edits.append((start, end, f"{target}{call}"))
    edits.append(insertion(source, first, indentation(source, first) + helper, method))
    return edits
