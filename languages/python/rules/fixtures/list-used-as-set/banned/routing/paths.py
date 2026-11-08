def unique_paths(routes):
    seen = []
    for route in routes:
        if route.path not in seen:
            seen.append(route.path)
    return seen


def reachable(start, edges):
    visited = []

    def visit(node):
        if node in visited:
            return
        visited.append(node)
        for following in edges.get(node, ()):
            visit(following)

    visit(start)
    return visited


def tagged(routes):
    tags: list[str] = []
    for route in routes:
        if route.tag not in tags:
            tags += [route.tag]
    return tags
