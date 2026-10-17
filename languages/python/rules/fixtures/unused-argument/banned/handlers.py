def handle(event, context):
    return event


class Handler:
    def run(self, item):
        return 1

    @classmethod
    def build(cls, item):
        return cls()

    @staticmethod
    def label(item):
        return "x"


ordered = sorted([3, 2], key=lambda item: 0)
