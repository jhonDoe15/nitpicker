import ast


def run(text: str) -> object:
    return ast.literal_eval(text)
