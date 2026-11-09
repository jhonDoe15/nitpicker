def matching(routes, paths):
    return [next((r for r in routes if r.path == path), None) for path in paths]


def known(rows, events):
    count = 0
    for event in events:
        if any(row["id"] == event.row_id for row in rows):
            count += 1
    return count


class Dispatcher:
    def __init__(self, handlers):
        self.handlers = handlers

    def dispatch(self, messages):
        for message in messages:
            handler = next(h for h in self.handlers if h.kind == message.kind)
            handler.run(message)


def ranked(routes, paths):
    return sorted(paths, key=lambda p: next(r.weight for r in routes if r.path == p))
