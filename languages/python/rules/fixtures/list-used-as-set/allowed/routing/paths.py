def unique_paths(routes):
    seen = set()
    for route in routes:
        seen.add(route.path)
    return seen


def ordered_paths(routes):
    ordered = []
    for route in routes:
        if route.path not in ordered:
            ordered.insert(0, route.path)
    return ordered


def single(path):
    one = []
    one.append(path)
    return path in one


def first_seen(routes):
    seen = []
    for route in routes:
        if route.path not in seen:
            seen.append(route.path)
    return seen[0]
