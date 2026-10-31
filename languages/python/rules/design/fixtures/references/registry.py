def on_a():
    return 1


def on_b():
    return 2


def fallback():
    return 0


HANDLERS = {"a": on_a, "b": on_b}


def dispatch(key):
    return HANDLERS[key]()


def pick(flag):
    return on_a if flag else on_b


def subscribe(callback):
    return callback


def wire():
    subscribe(fallback)


def store(holder):
    holder.handler = on_a


def register(function):
    return function


@register
def decorated():
    return 3


def make():
    return {}


DEFAULT = make()

__all__ = ["dispatch", "on_a"]


class Router:
    routes = [fallback]

    def handle(self):
        return 1

    def bind(self):
        return subscribe(self.handle)

    def again(self):
        return self.again


def calls_only():
    return on_a()
