class Cart:
    def total(self, items: list[int]) -> int:
        return sum(items)

    def with_fee(self, items: list[int], fee: int) -> int:
        return self.total(items) + fee
