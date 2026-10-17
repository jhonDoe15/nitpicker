HANDLERS = {}


def register(name, handler):
    HANDLERS[name] = handler
    HANDLERS.update({name: handler})
