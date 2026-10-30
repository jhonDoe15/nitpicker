import ast

COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)


def ancestors(node, parents):
    chain = [node]
    while id(chain[-1]) in parents:
        chain.append(parents[id(chain[-1])])
    return chain


def in_loop_body(parent, child):
    if isinstance(parent, (ast.For, ast.AsyncFor)):
        return child in parent.body
    return isinstance(parent, ast.While) and (
        child in parent.body or child is parent.test
    )


def is_evaluated_once(comprehension, chain, index):
    first = comprehension.generators[0]
    return chain[index - 1] is first and index >= 2 and chain[index - 2] is first.iter


def enclosing_loop(node, parents):
    chain = ancestors(node, parents)
    for index in range(1, len(chain)):
        child, parent = chain[index - 1], chain[index]
        if isinstance(parent, FUNCTIONS):
            return None
        if in_loop_body(parent, child):
            return parent
        if isinstance(parent, COMPREHENSIONS) and not is_evaluated_once(
            parent, chain, index
        ):
            return parent
    return None
