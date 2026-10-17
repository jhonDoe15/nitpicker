COUNTER = 0
CACHE = None


def read():
    global COUNTER
    return COUNTER


def load():
    global CACHE
    CACHE = {}
    return CACHE
