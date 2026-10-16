def handle(event, _context):
    return event


class Handler:
    def run(self, item):
        return item

    @classmethod
    def build(cls, item):
        return cls(), item

    @staticmethod
    def label(item):
        return str(item)


ordered = sorted([3, 2], key=lambda item: item)
