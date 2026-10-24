class Prices:
    def total(self, value: int) -> int:
        return self.subtotal(value)

    def subtotal(self, value: int) -> int:
        return value + 1
