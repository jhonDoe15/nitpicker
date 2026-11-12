class Cart:
    def _sum(self, items: list[int]) -> int:
        return sum(items)

    def total(self, items: list[int]) -> int:
        return self._sum(items)
