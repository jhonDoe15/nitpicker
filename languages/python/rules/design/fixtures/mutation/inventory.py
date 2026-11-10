class Inventory:
    def __init__(self):
        self._lines = []
        self._index = {}
        self.label = "x"

    def lines(self):
        return self._lines

    def snapshot(self):
        return list(self._lines)

    def index(self):
        return self._index

    @property
    def view(self):
        return self._lines

    def text(self):
        return self.label

    def add(self, item):
        self._lines.append(item)

    async def fetch(self):
        return self._lines
