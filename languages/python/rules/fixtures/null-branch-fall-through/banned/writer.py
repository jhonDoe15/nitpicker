class Writer:
    def __init__(self, formats):
        self.out = []
        self.formats = formats

    def write(self, value, fmt):
        if value is None:
            self.out.append("null")
        chosen = fmt
        if chosen is None:
            chosen = self.formats.get(type(value))
        self.out.append(chosen.format(value))
