ROUTES = {}


def route(path):
    def decorator(function):
        ROUTES[path] = function
        return function

    return decorator


def register(name, callback):
    ROUTES[name] = callback
