_CACHE = []
_SEEN = {}


def cache():
    found = _CACHE
    return found


def peek():
    global _CACHE
    return _CACHE


def reset():
    global _SEEN
    _SEEN = {}
    return _SEEN
