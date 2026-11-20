import ast

from fixers.extract.support.scopes import (
    bound_names,
    defined_names,
    forbidden,
    loaded_names,
    stored_names,
    used_names,
)
from source_text import refuse

LOOPS = (ast.For, ast.AsyncFor, ast.While)
SUSPENDING = (ast.Await, ast.AsyncFor, ast.AsyncWith)


def in_loop(node, parents):
    chain = [parents.get(node)]
    for current in chain:
        if current is None:
            return False
        if isinstance(current, LOOPS):
            return True
        chain.append(parents.get(current))
    return False


def jumps_out(run):
    parents = {}
    for statement in run:
        for node in ast.walk(statement):
            for child in ast.iter_child_nodes(node):
                parents[child] = node
    for statement in run:
        for node in ast.walk(statement):
            if isinstance(node, (ast.Return,) + SUSPENDING):
                return True
            if isinstance(node, ast.comprehension) and node.is_async:
                return True
            if isinstance(node, (ast.Break, ast.Continue)) and not in_loop(node, parents):
                return True
    return False


def scoped_names(run):
    names = set()
    for statement in run:
        for node in ast.walk(statement):
            if isinstance(node, ast.Lambda):
                names.update(a.arg for a in node.args.args)
            if isinstance(node, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
                for generator in node.generators:
                    names.update(bound_names(generator.target))
    return names


def definite_outputs(run, names):
    assigned = set()
    for statement in run:
        if isinstance(statement, ast.Assign):
            for target in statement.targets:
                if isinstance(target, ast.Name):
                    assigned.add(target.id)
        elif isinstance(statement, ast.AnnAssign) and statement.value is not None:
            if isinstance(statement.target, ast.Name):
                assigned.add(statement.target.id)
    if not set(names) <= assigned:
        refuse("a value the run defines for the code after it is not always assigned")


def analyse(function, parts):
    run, before, after = parts["run"], parts["before"], parts["after"]
    forbidden(run)
    if jumps_out(run):
        refuse("the run returns, breaks or continues out of itself, or awaits")
    if any(isinstance(node, (ast.Global, ast.Nonlocal)) for node in ast.walk(function)):
        refuse("the function declares a global or nonlocal name")
    params = {argument.arg for argument in function.args.args}
    known = params | defined_names(before)
    stores = stored_names(run)
    scoped = scoped_names(run)
    if stores & known:
        refuse("a run assigns to a variable declared outside it")
    reads = loaded_names(run)
    inputs = [name for name in reads if name in known]
    unclear = (bound_names(function) - known - stores - scoped) & set(reads)
    if scoped & known or unclear:
        refuse("the flow of a name the run reads is unclear")
    outputs = [name for name in used_names(after) if name in stores]
    if len(outputs) > 1:
        refuse("the run defines more than one value used after it")
    definite_outputs(run, outputs)
    return {
        "inputs": inputs,
        "inside": stores | scoped,
        "output": outputs[0] if outputs else None,
        "locals": stores | scoped | set(inputs),
    }
