class Cart:
    def __init__(self, owner: str):
        self.owner = owner

    def add(self, item):
        return item

    @classmethod
    def create(cls, owner):
        return cls(owner)

    @staticmethod
    def blank():
        return Cart("nobody")

    @property
    def size(self):
        return 0

    def named(self) -> "Cart":
        return self
