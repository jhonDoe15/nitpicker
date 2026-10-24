class Prices:
    def total(self, value: int) -> int:
        return self.subtotal(value) + 1

    def subtotal(self, value: int) -> int:
        return value + 1
