from registry import HANDLERS, on_b


def run(key):
    return HANDLERS[key]


def callbacks():
    return [on_b, lambda: on_b]
