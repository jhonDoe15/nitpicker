class Flag:
    def __init__(self):
        yield 1

    def __bool__(self):
        return 1

    def __index__(self):
        return "1"

    def __str__(self):
        return 1

    def __bytes__(self):
        return "flag"

    def __hash__(self):
        return "flag"
