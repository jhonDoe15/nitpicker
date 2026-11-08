def matching(routes, paths):
    by_path = {route.path: route for route in routes}
    return [by_path.get(path) for path in paths]


def root(routes):
    return next((r for r in routes if r.path == "/"), None)


def fixed(routes, paths):
    return [next((r for r in routes if r.path == "/"), None) for _ in paths]


def rebuilt(paths):
    added = []
    for path in paths:
        if not any(route == path for route in added):
            added.append(path)
    return added


def per_group(groups, path):
    return [any(route.path == path for route in group) for group in groups]


def grown(routes, paths):
    for path in paths:
        if not any(route.path == path for route in routes):
            routes.append(path)
    return routes
